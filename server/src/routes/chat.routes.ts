import express from "express";
import { z } from "zod";
import { db } from "../config/db.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";
import {
  parseRequestBody,
  sendValidationError,
} from "../middleware/validateRequest.js";
import { sendLiveUpdate } from "../liveEvents.js";

const router = express.Router();
const maxGroupMembers = 50;
const maxMessageCiphertextLength = 24_000;
const maxEnvelopeCiphertextLength = 8_000;

const ecPublicJwkSchema = z
  .object({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/),
    y: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/),
    ext: z.boolean().optional(),
    key_ops: z.array(z.string().max(24)).max(4).optional(),
  })
  .passthrough();

const base64PayloadSchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Encrypted payload is not valid base64");

const conversationIdSchema = z.string().uuid();

const deviceRegistrationSchema = z
  .object({
    deviceId: z.string().trim().min(8).max(160),
    deviceName: z.string().trim().min(1).max(80).default("Web browser"),
    publicKeyJwk: ecPublicJwkSchema,
    signingPublicKeyJwk: ecPublicJwkSchema,
    keyVersion: z.number().int().min(1).max(100).default(1),
  })
  .strict();

const directConversationSchema = z
  .object({
    friendUserId: z.string().uuid(),
  })
  .strict();

const groupConversationSchema = z
  .object({
    title: z.string().trim().min(2).max(80),
    memberUserIds: z.array(z.string().uuid()).min(1).max(maxGroupMembers - 1),
  })
  .strict();

const envelopeSchema = z
  .object({
    senderDeviceId: z.string().uuid(),
    recipientDeviceId: z.string().uuid(),
    keyVersion: z.number().int().min(1).max(100).default(1),
    algorithm: z.literal("ECDH-P256-HKDF-SHA256-AES-GCM").default(
      "ECDH-P256-HKDF-SHA256-AES-GCM",
    ),
    ciphertext: base64PayloadSchema.max(maxEnvelopeCiphertextLength),
    nonce: base64PayloadSchema.max(256),
  })
  .strict();

const envelopesSchema = z
  .object({
    envelopes: z.array(envelopeSchema).min(1).max(maxGroupMembers * 8),
  })
  .strict();

const messageSchema = z
  .object({
    senderDeviceId: z.string().uuid(),
    clientMessageId: z.string().uuid(),
    keyVersion: z.number().int().min(1).max(100).default(1),
    algorithm: z.literal("AES-256-GCM").default("AES-256-GCM"),
    ciphertext: base64PayloadSchema.max(maxMessageCiphertextLength),
    nonce: base64PayloadSchema.max(256),
    signature: base64PayloadSchema.max(4096),
    messageType: z.literal("text").default("text"),
  })
  .strict();

type CurrentUser = {
  id: string;
  username: string;
  name: string | null;
  email: string;
};

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

async function getCurrentUser(firebaseUid: string) {
  const result = await db.query<CurrentUser>(
    `
    SELECT id, username, name, email
    FROM users
    WHERE firebase_uid = $1;
    `,
    [firebaseUid],
  );

  return result.rows[0] ?? null;
}

async function requireConversationMembership(
  conversationId: string,
  userId: string,
) {
  const result = await db.query<{
    conversation_type: "direct" | "group";
    title: string | null;
    created_by_user_id: string | null;
  }>(
    `
    SELECT
      conversation.conversation_type,
      conversation.title,
      conversation.created_by_user_id
    FROM chat_conversations conversation
    INNER JOIN chat_conversation_members member
      ON member.conversation_id = conversation.id
    WHERE conversation.id = $1
    AND member.user_id = $2
    AND member.left_at IS NULL;
    `,
    [conversationId, userId],
  );

  return result.rows[0] ?? null;
}

async function getConversationMemberUserIds(conversationId: string) {
  const result = await db.query<{ user_id: string }>(
    `
    SELECT user_id
    FROM chat_conversation_members
    WHERE conversation_id = $1
    AND left_at IS NULL;
    `,
    [conversationId],
  );

  return result.rows.map((row) => row.user_id);
}

async function areFriends(userA: string, userB: string) {
  const [userOneId, userTwoId] = [userA, userB].sort();
  const result = await db.query(
    `
    SELECT 1
    FROM friendships
    WHERE user_one_id = $1
    AND user_two_id = $2;
    `,
    [userOneId, userTwoId],
  );

  return result.rows.length > 0;
}

async function allAreFriends(ownerId: string, memberIds: string[]) {
  const uniqueMemberIds = Array.from(new Set(memberIds)).filter(
    (memberId) => memberId !== ownerId,
  );

  if (uniqueMemberIds.length === 0) {
    return false;
  }

  const result = await db.query<{ friend_id: string }>(
    `
    SELECT CASE
      WHEN user_one_id = $1 THEN user_two_id
      ELSE user_one_id
    END AS friend_id
    FROM friendships
    WHERE (user_one_id = $1 OR user_two_id = $1)
    AND CASE
      WHEN user_one_id = $1 THEN user_two_id
      ELSE user_one_id
    END = ANY($2::uuid[]);
    `,
    [ownerId, uniqueMemberIds],
  );

  return new Set(result.rows.map((row) => row.friend_id)).size === uniqueMemberIds.length;
}

async function getConversationPayload(conversationId: string, userId: string) {
  const conversationResult = await db.query(
    `
    SELECT
      conversation.id,
      conversation.conversation_type AS "conversationType",
      conversation.title,
      conversation.created_by_user_id AS "createdByUserId",
      conversation.created_at AS "createdAt",
      conversation.updated_at AS "updatedAt"
    FROM chat_conversations conversation
    INNER JOIN chat_conversation_members membership
      ON membership.conversation_id = conversation.id
    WHERE conversation.id = $1
    AND membership.user_id = $2
    AND membership.left_at IS NULL;
    `,
    [conversationId, userId],
  );

  if (conversationResult.rows.length === 0) {
    return null;
  }

  const [membersResult, devicesResult] = await Promise.all([
    db.query(
      `
      SELECT
        users.id,
        users.username,
        users.name,
        CASE
          WHEN users.avatar_mode = 'initials' THEN NULL
          ELSE COALESCE(users.profile_photo_url, users.photo_url)
        END AS "displayPhotoUrl",
        membership.role,
        membership.joined_at AS "joinedAt"
      FROM chat_conversation_members membership
      INNER JOIN users ON users.id = membership.user_id
      WHERE membership.conversation_id = $1
      AND membership.left_at IS NULL
      ORDER BY membership.joined_at, users.username;
      `,
      [conversationId],
    ),
    db.query(
      `
      SELECT
        device.id,
        device.user_id AS "userId",
        device.device_id AS "deviceId",
        device.device_name AS "deviceName",
        device.public_key_jwk AS "publicKeyJwk",
        device.signing_public_key_jwk AS "signingPublicKeyJwk",
        device.key_version AS "keyVersion",
        EXISTS (
          SELECT 1
          FROM chat_key_envelopes envelope
          WHERE envelope.conversation_id = $1
          AND envelope.recipient_device_id = device.id
          AND envelope.key_version = 1
        ) AS "hasEnvelope"
      FROM chat_devices device
      INNER JOIN chat_conversation_members membership
        ON membership.user_id = device.user_id
      WHERE membership.conversation_id = $1
      AND membership.left_at IS NULL
      ORDER BY device.user_id, device.created_at;
      `,
      [conversationId],
    ),
  ]);

  return {
    ...conversationResult.rows[0],
    members: membersResult.rows,
    devices: devicesResult.rows,
  };
}

router.post(
  "/devices",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const currentUser = await getCurrentUser(firebaseUser.uid);

      if (!currentUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const payload = parseRequestBody(deviceRegistrationSchema, req.body);
      const result = await db.query(
        `
        INSERT INTO chat_devices (
          user_id,
          device_id,
          device_name,
          public_key_jwk,
          signing_public_key_jwk,
          key_version,
          last_seen_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, NOW(), NOW())
        ON CONFLICT (user_id, device_id)
        DO UPDATE SET
          device_name = EXCLUDED.device_name,
          public_key_jwk = EXCLUDED.public_key_jwk,
          signing_public_key_jwk = EXCLUDED.signing_public_key_jwk,
          key_version = EXCLUDED.key_version,
          last_seen_at = NOW(),
          updated_at = NOW()
        RETURNING
          id,
          device_id AS "deviceId",
          device_name AS "deviceName",
          key_version AS "keyVersion";
        `,
        [
          currentUser.id,
          payload.deviceId,
          payload.deviceName,
          JSON.stringify(payload.publicKeyJwk),
          JSON.stringify(payload.signingPublicKeyJwk),
          payload.keyVersion,
        ],
      );

      return res.status(201).json({ device: result.rows[0] });
    } catch (error) {
      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Register chat device failed:", error);
      return res.status(500).json({ message: "Failed to register chat device" });
    }
  },
);

router.get("/conversations", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const currentUser = await getCurrentUser(firebaseUser.uid);

    if (!currentUser) {
      return res.status(404).json({ message: "User not found in database" });
    }

    const result = await db.query(
      `
      SELECT
        conversation.id,
        conversation.conversation_type AS "conversationType",
        conversation.title,
        conversation.created_by_user_id AS "createdByUserId",
        conversation.created_at AS "createdAt",
        conversation.updated_at AS "updatedAt",
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', member_user.id,
              'username', member_user.username,
              'name', member_user.name,
              'displayPhotoUrl', CASE
                WHEN member_user.avatar_mode = 'initials' THEN NULL
                ELSE COALESCE(member_user.profile_photo_url, member_user.photo_url)
              END,
              'role', member.role
            ) ORDER BY member.joined_at
          ) FILTER (WHERE member_user.id IS NOT NULL),
          '[]'::json
        ) AS members,
        latest_message.created_at AS "lastMessageAt",
        latest_message.sender_user_id AS "lastSenderUserId"
      FROM chat_conversations conversation
      INNER JOIN chat_conversation_members mine
        ON mine.conversation_id = conversation.id
        AND mine.user_id = $1
        AND mine.left_at IS NULL
      INNER JOIN chat_conversation_members member
        ON member.conversation_id = conversation.id
        AND member.left_at IS NULL
      INNER JOIN users member_user ON member_user.id = member.user_id
      LEFT JOIN LATERAL (
        SELECT message.created_at, message.sender_user_id
        FROM chat_messages message
        WHERE message.conversation_id = conversation.id
        ORDER BY message.created_at DESC, message.id DESC
        LIMIT 1
      ) latest_message ON true
      GROUP BY conversation.id, latest_message.created_at, latest_message.sender_user_id
      ORDER BY COALESCE(latest_message.created_at, conversation.updated_at) DESC;
      `,
      [currentUser.id],
    );

    return res.json({ conversations: result.rows });
  } catch (error) {
    console.error("Load chat conversations failed:", error);
    return res.status(500).json({ message: "Failed to load chat conversations" });
  }
});

router.post(
  "/conversations/direct",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const currentUser = await getCurrentUser(firebaseUser.uid);

      if (!currentUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const { friendUserId } = parseRequestBody(directConversationSchema, req.body);

      if (!(await areFriends(currentUser.id, friendUserId))) {
        return res.status(403).json({ message: "Direct chats can be created only with friends" });
      }

      const [userOneId, userTwoId] = [currentUser.id, friendUserId].sort();
      await client.query("BEGIN");

      const conversationResult = await client.query<{ id: string }>(
        `
        INSERT INTO chat_conversations (
          conversation_type,
          created_by_user_id,
          direct_user_one_id,
          direct_user_two_id
        )
        VALUES ('direct', $1, $2, $3)
        ON CONFLICT (direct_user_one_id, direct_user_two_id)
        WHERE conversation_type = 'direct'
        DO UPDATE SET updated_at = chat_conversations.updated_at
        RETURNING id;
        `,
        [currentUser.id, userOneId, userTwoId],
      );
      const conversationId = conversationResult.rows[0].id;

      await client.query(
        `
        INSERT INTO chat_conversation_members (conversation_id, user_id, role)
        VALUES ($1, $2, 'member'), ($1, $3, 'member')
        ON CONFLICT (conversation_id, user_id)
        DO UPDATE SET left_at = NULL;
        `,
        [conversationId, currentUser.id, friendUserId],
      );

      await client.query("COMMIT");
      const conversation = await getConversationPayload(conversationId, currentUser.id);

      sendLiveUpdate([currentUser.id, friendUserId], {
        type: "chat",
        reason: "conversation-created",
        conversationId,
      });

      return res.status(201).json({ conversation });
    } catch (error) {
      await client.query("ROLLBACK");

      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Create direct conversation failed:", error);
      return res.status(500).json({ message: "Failed to create direct conversation" });
    } finally {
      client.release();
    }
  },
);

router.post(
  "/conversations/group",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const currentUser = await getCurrentUser(firebaseUser.uid);

      if (!currentUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const payload = parseRequestBody(groupConversationSchema, req.body);
      const memberUserIds = Array.from(new Set(payload.memberUserIds)).filter(
        (memberId) => memberId !== currentUser.id,
      );

      if (!(await allAreFriends(currentUser.id, memberUserIds))) {
        return res.status(403).json({ message: "Group chats can include only your friends" });
      }

      await client.query("BEGIN");
      const conversationResult = await client.query<{ id: string }>(
        `
        INSERT INTO chat_conversations (
          conversation_type,
          title,
          created_by_user_id
        )
        VALUES ('group', $1, $2)
        RETURNING id;
        `,
        [payload.title, currentUser.id],
      );
      const conversationId = conversationResult.rows[0].id;

      await client.query(
        `
        INSERT INTO chat_conversation_members (conversation_id, user_id, role)
        SELECT $1, member_id, CASE WHEN member_id = $2 THEN 'owner' ELSE 'member' END
        FROM UNNEST($3::uuid[]) AS member_id;
        `,
        [conversationId, currentUser.id, [currentUser.id, ...memberUserIds]],
      );

      await client.query("COMMIT");
      const conversation = await getConversationPayload(conversationId, currentUser.id);

      sendLiveUpdate([currentUser.id, ...memberUserIds], {
        type: "chat",
        reason: "group-created",
        conversationId,
      });

      return res.status(201).json({ conversation });
    } catch (error) {
      await client.query("ROLLBACK");

      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Create group conversation failed:", error);
      return res.status(500).json({ message: "Failed to create group conversation" });
    } finally {
      client.release();
    }
  },
);

router.get(
  "/conversations/:conversationId/bootstrap",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const currentUser = await getCurrentUser(firebaseUser.uid);

      if (!currentUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const deviceId = String(req.query.deviceId || "").trim();
      const conversation = await getConversationPayload(conversationId, currentUser.id);

      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const envelopesResult = deviceId
        ? await db.query(
            `
            SELECT
              envelope.id,
              envelope.conversation_id AS "conversationId",
              envelope.sender_device_id AS "senderDeviceId",
              envelope.recipient_device_id AS "recipientDeviceId",
              envelope.key_version AS "keyVersion",
              envelope.algorithm,
              envelope.ciphertext,
              envelope.nonce,
              sender.public_key_jwk AS "senderPublicKeyJwk"
            FROM chat_key_envelopes envelope
            INNER JOIN chat_devices recipient ON recipient.id = envelope.recipient_device_id
            INNER JOIN chat_devices sender ON sender.id = envelope.sender_device_id
            WHERE envelope.conversation_id = $1
            AND recipient.user_id = $2
            AND recipient.device_id = $3
            ORDER BY envelope.key_version DESC, envelope.created_at DESC;
            `,
            [conversationId, currentUser.id, deviceId],
          )
        : { rows: [] };

      if (deviceId && envelopesResult.rows.length === 0) {
        const memberUserIds = await getConversationMemberUserIds(conversationId);

        sendLiveUpdate(
          memberUserIds.filter((userId) => userId !== currentUser.id),
          {
            type: "chat",
            reason: "key-envelope-requested",
            conversationId,
          },
        );
      }

      return res.json({
        conversation,
        envelopes: envelopesResult.rows,
      });
    } catch (error) {
      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Load chat bootstrap failed:", error);
      return res.status(500).json({ message: "Failed to load chat bootstrap" });
    }
  },
);

router.post(
  "/conversations/:conversationId/key-envelopes",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const currentUser = await getCurrentUser(firebaseUser.uid);

      if (!currentUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const membership = await requireConversationMembership(conversationId, currentUser.id);

      if (!membership) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const { envelopes } = parseRequestBody(envelopesSchema, req.body);
      const senderDeviceIds = Array.from(
        new Set(envelopes.map((item) => item.senderDeviceId)),
      );
      const keyVersions = Array.from(
        new Set(envelopes.map((item) => item.keyVersion)),
      );

      if (senderDeviceIds.length !== 1) {
        return res.status(400).json({
          message: "All key envelopes must use the same sender device",
        });
      }

      if (keyVersions.length !== 1) {
        return res.status(400).json({
          message: "All key envelopes must use the same key version",
        });
      }

      const senderDeviceResult = await client.query<{ id: string }>(
        `
        SELECT id
        FROM chat_devices
        WHERE id = $1
        AND user_id = $2;
        `,
        [senderDeviceIds[0], currentUser.id],
      );

      if (senderDeviceResult.rows.length === 0) {
        return res.status(403).json({ message: "Sender device is not registered for this user" });
      }

      const senderHasKeyResult = await client.query(
        `
        SELECT 1
        FROM chat_key_envelopes
        WHERE conversation_id = $1
        AND recipient_device_id = $2
        AND key_version = $3
        LIMIT 1;
        `,
        [conversationId, senderDeviceIds[0], keyVersions[0]],
      );

      if (
        membership.created_by_user_id !== currentUser.id &&
        senderHasKeyResult.rows.length === 0
      ) {
        return res.status(403).json({
          message: "This device has not received the conversation key",
        });
      }

      const recipientDeviceIds = Array.from(new Set(envelopes.map((item) => item.recipientDeviceId)));
      const validRecipientResult = await client.query<{ id: string }>(
        `
        SELECT device.id
        FROM chat_devices device
        INNER JOIN chat_conversation_members member ON member.user_id = device.user_id
        WHERE member.conversation_id = $1
        AND member.left_at IS NULL
        AND device.id = ANY($2::uuid[]);
        `,
        [conversationId, recipientDeviceIds],
      );

      if (validRecipientResult.rows.length !== recipientDeviceIds.length) {
        return res.status(403).json({ message: "One or more recipient devices are not conversation members" });
      }

      await client.query("BEGIN");

      for (const envelope of envelopes) {
        await client.query(
          `
          INSERT INTO chat_key_envelopes (
            conversation_id,
            sender_device_id,
            recipient_device_id,
            key_version,
            algorithm,
            ciphertext,
            nonce
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (conversation_id, recipient_device_id, key_version)
          DO NOTHING;
          `,
          [
            conversationId,
            envelope.senderDeviceId,
            envelope.recipientDeviceId,
            envelope.keyVersion,
            envelope.algorithm,
            envelope.ciphertext,
            envelope.nonce,
          ],
        );
      }

      await client.query("COMMIT");

      const memberUserIds = await getConversationMemberUserIds(conversationId);
      sendLiveUpdate(memberUserIds, {
        type: "chat",
        reason: "key-envelopes-updated",
        conversationId,
      });

      return res.status(201).json({ message: "Conversation keys saved" });
    } catch (error) {
      await client.query("ROLLBACK");

      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Save chat key envelopes failed:", error);
      return res.status(500).json({ message: "Failed to save conversation keys" });
    } finally {
      client.release();
    }
  },
);

router.get(
  "/conversations/:conversationId/messages",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const currentUser = await getCurrentUser(firebaseUser.uid);

      if (!currentUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const membership = await requireConversationMembership(conversationId, currentUser.id);

      if (!membership) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const before = String(req.query.before || "").trim();
      const result = await db.query(
        `
        SELECT
          message.id,
          message.conversation_id AS "conversationId",
          message.sender_user_id AS "senderUserId",
          message.sender_device_id AS "senderDeviceId",
          message.client_message_id AS "clientMessageId",
          message.key_version AS "keyVersion",
          message.algorithm,
          message.ciphertext,
          message.nonce,
          message.signature,
          message.message_type AS "messageType",
          message.created_at AS "createdAt",
          sender.username AS "senderUsername",
          sender.name AS "senderName",
          device.signing_public_key_jwk AS "signingPublicKeyJwk"
        FROM chat_messages message
        INNER JOIN users sender ON sender.id = message.sender_user_id
        INNER JOIN chat_devices device ON device.id = message.sender_device_id
        WHERE message.conversation_id = $1
        AND ($2::timestamptz IS NULL OR message.created_at < $2::timestamptz)
        ORDER BY message.created_at DESC, message.id DESC
        LIMIT $3;
        `,
        [conversationId, before || null, limit],
      );

      return res.json({ messages: result.rows.reverse() });
    } catch (error) {
      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Load encrypted chat messages failed:", error);
      return res.status(500).json({ message: "Failed to load encrypted messages" });
    }
  },
);

router.post(
  "/conversations/:conversationId/messages",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const currentUser = await getCurrentUser(firebaseUser.uid);

      if (!currentUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const membership = await requireConversationMembership(conversationId, currentUser.id);

      if (!membership) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const payload = parseRequestBody(messageSchema, req.body);
      const senderDeviceResult = await db.query<{ id: string }>(
        `
        SELECT device.id
        FROM chat_devices device
        INNER JOIN chat_key_envelopes envelope
          ON envelope.recipient_device_id = device.id
          AND envelope.conversation_id = $1
          AND envelope.key_version = $2
        WHERE device.id = $3
        AND device.user_id = $4;
        `,
        [conversationId, payload.keyVersion, payload.senderDeviceId, currentUser.id],
      );

      if (senderDeviceResult.rows.length === 0) {
        return res.status(403).json({
          message: "Sender device is not authorized for this conversation key",
        });
      }

      const result = await db.query(
        `
        INSERT INTO chat_messages (
          conversation_id,
          sender_user_id,
          sender_device_id,
          client_message_id,
          key_version,
          algorithm,
          ciphertext,
          nonce,
          signature,
          message_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (sender_device_id, client_message_id)
        DO UPDATE SET client_message_id = EXCLUDED.client_message_id
        RETURNING
          id,
          conversation_id AS "conversationId",
          sender_user_id AS "senderUserId",
          sender_device_id AS "senderDeviceId",
          client_message_id AS "clientMessageId",
          key_version AS "keyVersion",
          algorithm,
          ciphertext,
          nonce,
          signature,
          message_type AS "messageType",
          created_at AS "createdAt";
        `,
        [
          conversationId,
          currentUser.id,
          payload.senderDeviceId,
          payload.clientMessageId,
          payload.keyVersion,
          payload.algorithm,
          payload.ciphertext,
          payload.nonce,
          payload.signature,
          payload.messageType,
        ],
      );

      await db.query(
        `
        UPDATE chat_conversations
        SET updated_at = NOW()
        WHERE id = $1;
        `,
        [conversationId],
      );

      const memberUserIds = await getConversationMemberUserIds(conversationId);
      sendLiveUpdate(memberUserIds, {
        type: "chat",
        reason: "message-created",
        conversationId,
      });

      return res.status(201).json({ message: result.rows[0] });
    } catch (error) {
      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Send encrypted chat message failed:", error);
      return res.status(500).json({ message: "Failed to send encrypted message" });
    }
  },
);

export default router;
