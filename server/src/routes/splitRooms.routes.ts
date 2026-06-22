import express from "express";
import { db } from "../config/db.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";
import { sendLiveUpdate } from "../liveEvents.js";

const router = express.Router();
const maxSplitRoomsPerDay = 10;
const splitRoomMemberInsertChunkSize = 500;
let splitRoomTablesReady: Promise<void> | null = null;

type DbUserRow = {
  id: string;
  name: string | null;
  email: string;
};

type RoomMemberRow = {
  id: string;
  room_id: string;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  role: string;
  status: string;
};

type RoomItemRow = {
  id: string;
  room_id: string;
  assigned_member_id: string;
  title: string;
  amount: number;
  collected_at: string | null;
  expense_id: string | null;
  created_at: string;
};

type RoomPaymentStatus = "no_one_paid" | "all_paid" | "complete";

type Queryable = {
  query: typeof db.query;
};

type SplitRoomMemberInsertRow = {
  roomId: string;
  userId: string | null;
  displayName: string | null;
  email: string | null;
  role: "owner" | "member";
  status: "active" | "invited";
};

function chunkArray<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

async function getRoomUserIds(roomId: string) {
  const result = await db.query<{ user_id: string | null }>(
    `
    SELECT DISTINCT user_id
    FROM split_room_members
    WHERE room_id = $1
    AND user_id IS NOT NULL;
    `,
    [roomId],
  );

  return result.rows.map((row) => row.user_id);
}

async function ensureSplitRoomTables() {
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS split_rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT,
      payment_status TEXT NOT NULL DEFAULT 'no_one_paid',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE split_rooms
      ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'no_one_paid';

    CREATE TABLE IF NOT EXISTS split_room_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID NOT NULL REFERENCES split_rooms(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      display_name TEXT,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS split_room_members_room_email_idx
      ON split_room_members (room_id, LOWER(email))
      WHERE email IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS split_room_members_room_user_idx
      ON split_room_members (room_id, user_id)
      WHERE user_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS split_room_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID NOT NULL REFERENCES split_rooms(id) ON DELETE CASCADE,
      assigned_member_id UUID NOT NULL REFERENCES split_room_members(id) ON DELETE CASCADE,
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      collected_at TIMESTAMP,
      expense_id UUID,
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE split_room_items
      ADD COLUMN IF NOT EXISTS collected_at TIMESTAMP;

    ALTER TABLE split_room_items
      ADD COLUMN IF NOT EXISTS expense_id UUID;
  `);
}

async function ensureSplitRoomTablesOnce() {
  splitRoomTablesReady ??= ensureSplitRoomTables().catch((error) => {
    splitRoomTablesReady = null;
    throw error;
  });

  return splitRoomTablesReady;
}

async function getCurrentUser(firebaseUid: string) {
  const result = await db.query<DbUserRow>(
    `
    SELECT id, name, email
    FROM users
    WHERE firebase_uid = $1;
    `,
    [firebaseUid],
  );

  return result.rows[0] ?? null;
}

function parseMembers(rawMembers: unknown) {
  if (!Array.isArray(rawMembers)) {
    return [];
  }

  return rawMembers
    .map((member) => String(member ?? "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function memberToIdentity(member: string) {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member);

  return {
    displayName: isEmail ? member.split("@")[0] : member,
    email: isEmail ? member.toLowerCase() : null,
  };
}

async function findUsersByEmail(client: Queryable, emails: string[]) {
  if (emails.length === 0) {
    return new Map<string, DbUserRow>();
  }

  const result = await client.query<DbUserRow>(
    `
    SELECT id, name, email
    FROM users
    WHERE LOWER(email) = ANY($1::text[]);
    `,
    [emails],
  );

  return new Map(
    result.rows.map((user) => [user.email.toLowerCase(), user] as const),
  );
}

async function insertSplitRoomMembers(
  client: Queryable,
  rows: SplitRoomMemberInsertRow[],
) {
  for (const chunk of chunkArray(rows, splitRoomMemberInsertChunkSize)) {
    const values: Array<string | null> = [];
    const placeholders = chunk
      .map((row, rowIndex) => {
        const paramIndex = rowIndex * 6;

        values.push(
          row.roomId,
          row.userId,
          row.displayName,
          row.email,
          row.role,
          row.status,
        );

        return `($${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`;
      })
      .join(",\n");

    await client.query(
      `
      INSERT INTO split_room_members (
        room_id,
        user_id,
        display_name,
        email,
        role,
        status
      )
      VALUES ${placeholders}
      ON CONFLICT DO NOTHING;
      `,
      values,
    );
  }
}

function serializeRoom(
  room: {
    id: string;
    owner_user_id: string;
    name: string;
    category: string | null;
    payment_status: RoomPaymentStatus | string | null;
    created_at: string;
  },
  members: RoomMemberRow[],
  items: RoomItemRow[],
  currentUser: DbUserRow,
) {
  const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const itemCountByMember = new Map<string, number>();
  const amountByMember = new Map<string, number>();
  const outstandingByMember = new Map<string, number>();
  const collectedByMember = new Map<string, number>();
  const serializedMembers = members.map((member) => ({
    ...member,
    isMe:
      member.user_id === currentUser.id ||
      member.email?.toLowerCase() === currentUser.email.toLowerCase(),
    isOwner: member.role === "owner",
  }));
  const memberById = new Map(
    serializedMembers.map((member) => [member.id, member]),
  );

  items.forEach((item) => {
    const member = memberById.get(item.assigned_member_id);
    const amount = Number(item.amount);

    itemCountByMember.set(
      item.assigned_member_id,
      (itemCountByMember.get(item.assigned_member_id) ?? 0) + 1,
    );
    amountByMember.set(
      item.assigned_member_id,
      (amountByMember.get(item.assigned_member_id) ?? 0) + amount,
    );

    if (!member?.isMe) {
      if (item.collected_at) {
        collectedByMember.set(
          item.assigned_member_id,
          (collectedByMember.get(item.assigned_member_id) ?? 0) + amount,
        );
      } else {
        outstandingByMember.set(
          item.assigned_member_id,
          (outstandingByMember.get(item.assigned_member_id) ?? 0) + amount,
        );
      }
    }
  });

  const outstandingAmount = Array.from(outstandingByMember.values()).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const collectedAmount = Array.from(collectedByMember.values()).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const paymentStatus = normalizePaymentStatus(room.payment_status);
  const statusLabel =
    paymentStatus === "complete"
      ? "Complete"
      : paymentStatus === "all_paid"
        ? "All paid"
        : items.length === 0
          ? "New"
          : "No one paid";

  return {
    ...room,
    paymentStatus,
    isOwner: room.owner_user_id === currentUser.id,
    memberCount: members.length,
    totalAmount: total,
    outstandingAmount,
    collectedAmount,
    status: statusLabel,
    members: serializedMembers,
    balances: serializedMembers.map((member) => {
      const amount = amountByMember.get(member.id) ?? 0;
      const outstandingAmountForMember =
        outstandingByMember.get(member.id) ?? 0;
      const collectedAmountForMember = collectedByMember.get(member.id) ?? 0;

      return {
        memberId: member.id,
        name: member.isMe ? "Me" : member.display_name || member.email,
        detail: member.isMe
          ? "Your spend"
          : outstandingAmountForMember > 0
            ? "Dues pending"
            : collectedAmountForMember > 0
              ? "Collected"
              : "No dues yet",
        amount,
        outstandingAmount: outstandingAmountForMember,
        collectedAmount: collectedAmountForMember,
        isMe: member.isMe,
        isCollected:
          !member.isMe && amount > 0 && outstandingAmountForMember === 0,
        itemCount: itemCountByMember.get(member.id) ?? 0,
      };
    }),
    items: items.map((item) => ({
      ...item,
      amount: Number(item.amount),
      isCollected: Boolean(item.collected_at),
    })),
  };
}

function normalizePaymentStatus(status: unknown): RoomPaymentStatus {
  if (status === "all_paid" || status === "complete") {
    return status;
  }

  return "no_one_paid";
}

function getRouteParam(req: AuthRequest, paramName: string) {
  const value = req.params[paramName];

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

router.get("/", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    await ensureSplitRoomTablesOnce();

    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const dbUser = await getCurrentUser(firebaseUser.uid);

    if (!dbUser) {
      return res.status(404).json({ message: "User not found in database" });
    }

    const roomResult = await db.query(
      `
      SELECT DISTINCT
        room.id,
        room.owner_user_id,
        room.name,
        room.category,
        room.payment_status,
        room.created_at
      FROM split_rooms room
      INNER JOIN split_room_members member
        ON member.room_id = room.id
      WHERE room.owner_user_id = $1
      OR member.user_id = $1
      OR LOWER(member.email) = LOWER($2)
      ORDER BY room.created_at DESC;
      `,
      [dbUser.id, dbUser.email],
    );

    const roomIds = roomResult.rows.map((room) => room.id);

    if (roomIds.length === 0) {
      return res.json({ rooms: [] });
    }

    const [memberResult, itemResult] = await Promise.all([
      db.query<RoomMemberRow>(
        `
        SELECT id, room_id, user_id, display_name, email, role, status
        FROM split_room_members
        WHERE room_id = ANY($1::uuid[])
        ORDER BY created_at ASC;
        `,
        [roomIds],
      ),
      db.query<RoomItemRow>(
        `
        SELECT
          id,
          room_id,
          assigned_member_id,
          title,
          amount::float,
          collected_at,
          expense_id,
          created_at
        FROM split_room_items
        WHERE room_id = ANY($1::uuid[])
        ORDER BY created_at DESC;
        `,
        [roomIds],
      ),
    ]);

    const rooms = roomResult.rows.map((room) =>
      serializeRoom(
        room,
        memberResult.rows.filter((member) => member.room_id === room.id),
        itemResult.rows.filter((item) => item.room_id === room.id),
        dbUser,
      ),
    );

    return res.json({ rooms });
  } catch (error) {
    console.error("Load split rooms failed:", error);

    return res.status(500).json({
      message: "Failed to load split rooms",
    });
  }
});

router.post("/", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const client = await db.connect();

  try {
    await ensureSplitRoomTablesOnce();

    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const dbUser = await getCurrentUser(firebaseUser.uid);

    if (!dbUser) {
      return res.status(404).json({ message: "User not found in database" });
    }

    const name = String(req.body.name ?? "").trim();
    const category = String(req.body.category ?? "general").trim();
    const members = parseMembers(req.body.members);

    if (!name) {
      return res.status(400).json({ message: "Room name is required" });
    }

    const roomsCreatedTodayResult = await client.query(
      `
      SELECT COUNT(*)::int AS room_count
      FROM split_rooms
      WHERE owner_user_id = $1
      AND created_at::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
      `,
      [dbUser.id],
    );
    const roomsCreatedToday = Number(
      roomsCreatedTodayResult.rows[0].room_count,
    );

    if (roomsCreatedToday >= maxSplitRoomsPerDay) {
      return res.status(429).json({
        message: "You can create up to 10 split rooms per day",
      });
    }

    await client.query("BEGIN");

    const roomResult = await client.query(
      `
      INSERT INTO split_rooms (owner_user_id, name, category, payment_status)
      VALUES ($1, $2, $3, 'no_one_paid')
      RETURNING id, name, category, payment_status, created_at;
      `,
      [dbUser.id, name, category || "general"],
    );

    const room = roomResult.rows[0];

    const memberIdentities = members
      .map(memberToIdentity)
      .filter((identity) => identity.email !== dbUser.email.toLowerCase());
    const memberEmails = [
      ...new Set(
        memberIdentities
          .map((identity) => identity.email)
          .filter((email): email is string => Boolean(email)),
      ),
    ];
    const usersByEmail = await findUsersByEmail(client, memberEmails);
    const memberRows: SplitRoomMemberInsertRow[] = [
      {
        roomId: room.id,
        userId: dbUser.id,
        displayName: dbUser.name || "Me",
        email: dbUser.email,
        role: "owner",
        status: "active",
      },
      ...memberIdentities.map((identity) => {
        const matchedUser = identity.email
          ? usersByEmail.get(identity.email)
          : null;

        return {
          roomId: room.id,
          userId: matchedUser?.id ?? null,
          displayName: matchedUser?.name || identity.displayName,
          email: matchedUser?.email || identity.email,
          role: "member" as const,
          status: matchedUser ? ("active" as const) : ("invited" as const),
        };
      }),
    ];

    await insertSplitRoomMembers(client, memberRows);

    await client.query("COMMIT");

    const notifiedUserIds = await getRoomUserIds(room.id);
    sendLiveUpdate([dbUser.id, ...notifiedUserIds], {
      type: "split-room",
      reason: "room-created",
      roomId: room.id,
    });

    return res.status(201).json({
      message: "Split room created",
      room,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create split room failed:", error);

    return res.status(500).json({
      message: "Failed to create split room",
    });
  } finally {
    client.release();
  }
});

router.post(
  "/:roomId/items",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      await ensureSplitRoomTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const roomId = getRouteParam(req, "roomId");
      const title = String(req.body.title ?? "").trim();
      const assignedMemberId = String(req.body.assignedMemberId ?? "").trim();
      const amount = Number(req.body.amount);

      if (!title) {
        return res.status(400).json({ message: "Item name is required" });
      }

      if (!assignedMemberId) {
        return res.status(400).json({ message: "Assigned member is required" });
      }

      if (!amount || amount <= 0) {
        return res
          .status(400)
          .json({ message: "Amount must be greater than 0" });
      }

      if (!roomId) {
        return res.status(400).json({ message: "Room id is required" });
      }

      const accessResult = await db.query(
        `
      SELECT room.id, room.name
      FROM split_rooms room
      INNER JOIN split_room_members member
        ON member.room_id = room.id
      WHERE room.id = $1
      AND (
        room.owner_user_id = $2
        OR member.user_id = $2
        OR LOWER(member.email) = LOWER($3)
      )
      LIMIT 1;
      `,
        [roomId, dbUser.id, dbUser.email],
      );

      if (accessResult.rows.length === 0) {
        return res.status(404).json({ message: "Room not found" });
      }

      const assignedMemberResult = await db.query<RoomMemberRow>(
        `
      SELECT id, room_id, user_id, display_name, email, role, status
      FROM split_room_members
      WHERE id = $1
      AND room_id = $2;
      `,
        [assignedMemberId, roomId],
      );

      if (assignedMemberResult.rows.length === 0) {
        return res
          .status(400)
          .json({ message: "Assigned member is not in this room" });
      }

      const assignedMember = assignedMemberResult.rows[0];
      const isAssignedToCurrentUser =
        assignedMember.user_id === dbUser.id ||
        assignedMember.email?.toLowerCase() === dbUser.email.toLowerCase();

      const itemResult = await db.query(
        `
      INSERT INTO split_room_items (
        room_id,
        assigned_member_id,
        created_by_user_id,
        title,
        amount,
        collected_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        room_id,
        assigned_member_id,
        title,
        amount::float,
        collected_at,
        expense_id,
        created_at;
      `,
        [
          roomId,
          assignedMemberId,
          dbUser.id,
          title,
          amount,
          isAssignedToCurrentUser ? new Date() : null,
        ],
      );

      if (isAssignedToCurrentUser) {
        const expenseResult = await db.query(
          `
        INSERT INTO expenses (
          user_id,
          title,
          category,
          amount,
          expense_date
        )
        VALUES (
          $1,
          $2,
          'Shared room',
          $3,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        )
        RETURNING id;
        `,
          [dbUser.id, `${accessResult.rows[0].name}: ${title}`, amount],
        );

        await db.query(
          `
        UPDATE split_room_items
        SET expense_id = $1
        WHERE id = $2;
        `,
          [expenseResult.rows[0].id, itemResult.rows[0].id],
        );
      }

      await db.query(
        `
      UPDATE split_rooms
      SET
        payment_status = CASE
          WHEN $2::boolean THEN payment_status
          ELSE 'no_one_paid'
        END,
        updated_at = NOW()
      WHERE id = $1;
      `,
        [roomId, isAssignedToCurrentUser],
      );

      const notifiedUserIds = await getRoomUserIds(roomId);
      sendLiveUpdate([dbUser.id, ...notifiedUserIds], {
        type: "split-room",
        reason: "item-added",
        roomId,
      });

      return res.status(201).json({
        message: "Split item added",
        item: itemResult.rows[0],
      });
    } catch (error) {
      console.error("Add split item failed:", error);

      return res.status(500).json({
        message: "Failed to add split item",
      });
    }
  },
);

router.post(
  "/:roomId/members/:memberId/collect",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      await ensureSplitRoomTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const roomId = getRouteParam(req, "roomId");
      const memberId = getRouteParam(req, "memberId");

      if (!roomId || !memberId) {
        return res
          .status(400)
          .json({ message: "Room id and member id are required" });
      }

      const roomResult = await db.query(
        `
        SELECT id
        FROM split_rooms
        WHERE id = $1
        AND owner_user_id = $2;
        `,
        [roomId, dbUser.id],
      );

      if (roomResult.rows.length === 0) {
        return res.status(404).json({
          message: "Room not found or you do not own this room",
        });
      }

      const memberResult = await db.query<RoomMemberRow>(
        `
        SELECT id, room_id, user_id, display_name, email, role, status
        FROM split_room_members
        WHERE id = $1
        AND room_id = $2;
        `,
        [memberId, roomId],
      );
      const member = memberResult.rows[0];

      if (!member) {
        return res
          .status(404)
          .json({ message: "Member not found in this room" });
      }

      if (
        member.user_id === dbUser.id ||
        member.email?.toLowerCase() === dbUser.email.toLowerCase()
      ) {
        return res.status(400).json({
          message: "Your own spend is already counted on the dashboard",
        });
      }

      const updateResult = await db.query(
        `
        UPDATE split_room_items
        SET collected_at = NOW()
        WHERE room_id = $1
        AND assigned_member_id = $2
        AND collected_at IS NULL
        RETURNING id;
        `,
        [roomId, memberId],
      );

      await db.query(
        `
        UPDATE split_rooms
        SET
          payment_status = CASE
            WHEN NOT EXISTS (
              SELECT 1
              FROM split_room_items item
              INNER JOIN split_room_members member
                ON member.id = item.assigned_member_id
              WHERE item.room_id = $1
              AND item.collected_at IS NULL
              AND NOT (
                member.user_id = $2
                OR LOWER(COALESCE(member.email, '')) = LOWER($3)
              )
            )
              THEN 'all_paid'
            ELSE payment_status
          END,
          updated_at = NOW()
        WHERE id = $1;
        `,
        [roomId, dbUser.id, dbUser.email],
      );

      sendLiveUpdate([dbUser.id, member.user_id], {
        type: "split-room",
        reason: "dues-collected",
        roomId,
      });

      return res.json({
        message: "Dues marked as collected",
        updatedCount: updateResult.rows.length,
      });
    } catch (error) {
      console.error("Collect split room dues failed:", error);

      return res.status(500).json({
        message: "Failed to mark dues collected",
      });
    }
  },
);

router.patch(
  "/:roomId/payment-status",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      await ensureSplitRoomTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const roomId = getRouteParam(req, "roomId");
      const paymentStatus = normalizePaymentStatus(req.body.paymentStatus);

      if (!roomId) {
        return res.status(400).json({ message: "Room id is required" });
      }

      await client.query("BEGIN");

      const roomResult = await client.query(
        `
      SELECT id
      FROM split_rooms
      WHERE id = $1
      AND owner_user_id = $2;
      `,
        [roomId, dbUser.id],
      );

      if (roomResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Room not found or you do not own this room",
        });
      }

      if (paymentStatus === "no_one_paid") {
        await client.query(
          `
        UPDATE split_room_items item
        SET collected_at = NULL
        FROM split_room_members member
        WHERE member.id = item.assigned_member_id
        AND item.room_id = $1
        AND NOT (
          member.user_id = $2
          OR LOWER(COALESCE(member.email, '')) = LOWER($3)
        );
        `,
          [roomId, dbUser.id, dbUser.email],
        );
      }

      if (paymentStatus === "all_paid" || paymentStatus === "complete") {
        await client.query(
          `
        UPDATE split_room_items item
        SET collected_at = COALESCE(item.collected_at, NOW())
        FROM split_room_members member
        WHERE member.id = item.assigned_member_id
        AND item.room_id = $1
        AND NOT (
          member.user_id = $2
          OR LOWER(COALESCE(member.email, '')) = LOWER($3)
        );
        `,
          [roomId, dbUser.id, dbUser.email],
        );
      }

      await client.query(
        `
      UPDATE split_rooms
      SET payment_status = $1,
          updated_at = NOW()
      WHERE id = $2
      AND owner_user_id = $3;
      `,
        [paymentStatus, roomId, dbUser.id],
      );

      await client.query("COMMIT");

      const notifiedUserIds = await getRoomUserIds(roomId);
      sendLiveUpdate([dbUser.id, ...notifiedUserIds], {
        type: "split-room",
        reason: "payment-status",
        roomId,
      });

      return res.json({
        message: "Room payment status updated",
        paymentStatus,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Update split room payment status failed:", error);

      return res.status(500).json({
        message: "Failed to update room payment status",
      });
    } finally {
      client.release();
    }
  },
);

router.delete(
  "/:roomId",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      await ensureSplitRoomTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const roomId = getRouteParam(req, "roomId");

      if (!roomId) {
        return res.status(400).json({ message: "Room id is required" });
      }

      const roomResult = await client.query(
        `
      SELECT id, name
      FROM split_rooms
      WHERE id = $1
      AND owner_user_id = $2;
      `,
        [roomId, dbUser.id],
      );

      if (roomResult.rows.length === 0) {
        return res.status(404).json({
          message: "Room not found or you do not own this room",
        });
      }

      const dueResult = await client.query(
        `
      SELECT COALESCE(SUM(amount), 0)::float AS total_due
      FROM split_room_items
      INNER JOIN split_room_members
        ON split_room_members.id = split_room_items.assigned_member_id
      WHERE split_room_items.room_id = $1
      AND split_room_items.collected_at IS NULL
      AND NOT (
        split_room_members.user_id = $2
        OR LOWER(COALESCE(split_room_members.email, '')) = LOWER($3)
      );
      `,
        [roomId, dbUser.id, dbUser.email],
      );
      const totalDue = Number(dueResult.rows[0]?.total_due ?? 0);

      if (totalDue > 0) {
        return res.status(409).json({
          message: "All member payments must be done before deleting this room",
        });
      }

      const notifiedUserIds = await getRoomUserIds(roomId);

      await client.query("BEGIN");

      await client.query(
        `
      DELETE FROM split_rooms
      WHERE id = $1
      AND owner_user_id = $2;
      `,
        [roomId, dbUser.id],
      );

      await client.query("COMMIT");

      sendLiveUpdate([dbUser.id, ...notifiedUserIds], {
        type: "split-room",
        reason: "room-deleted",
        roomId,
      });

      return res.json({
        message: "Split room deleted",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Delete split room failed:", error);

      return res.status(500).json({
        message: "Failed to delete split room",
      });
    } finally {
      client.release();
    }
  },
);

router.post(
  "/items/:itemId/pay",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      await client.query("BEGIN");

      const userResult = await client.query(
        `
        SELECT id, email
        FROM users
        WHERE firebase_uid = $1;
        `,
        [firebaseUser.uid],
      );

      if (userResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "User not found",
        });
      }

      const payerUserId = userResult.rows[0].id;
      const payerEmail = userResult.rows[0].email;
      const itemId = getRouteParam(req, "itemId");

      if (!itemId) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "Due item id is required",
        });
      }

      const itemResult = await client.query(
        `
        SELECT
          split_room_items.id,
          split_room_items.room_id,
          split_room_items.title,
          split_room_items.amount::float,
          split_room_items.assigned_member_id,
          split_room_items.collected_at,
          split_room_members.user_id AS assigned_user_id,
          split_room_members.email AS assigned_email,
          split_rooms.owner_user_id AS receiver_user_id,
          owner_user.email AS receiver_email,
          split_rooms.name AS room_name
        FROM split_room_items
        JOIN split_room_members
          ON split_room_members.id = split_room_items.assigned_member_id
        JOIN split_rooms
          ON split_rooms.id = split_room_items.room_id
        JOIN users AS owner_user
          ON owner_user.id = split_rooms.owner_user_id
        WHERE split_room_items.id = $1
        FOR UPDATE;
        `,
        [itemId],
      );

      if (itemResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "Due item not found",
        });
      }

      const item = itemResult.rows[0];

      if (item.collected_at) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "This due is already paid",
        });
      }

      if (
        item.assigned_user_id !== payerUserId &&
        item.assigned_email?.toLowerCase() !== payerEmail.toLowerCase()
      ) {
        await client.query("ROLLBACK");

        return res.status(403).json({
          message: "You can only pay dues assigned to you",
        });
      }

      if (item.receiver_user_id === payerUserId) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "You cannot pay yourself",
        });
      }

      const balanceResult = await client.query(
        `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN type = 'credit' THEN amount
                WHEN type = 'debit' THEN -amount
                ELSE 0
              END
            )::float,
            0
          ) AS wallet_balance
        FROM wallet_transactions
        WHERE user_id = $1;
        `,
        [payerUserId],
      );

      const walletBalance = Number(balanceResult.rows[0].wallet_balance);
      const amount = Number(item.amount);

      if (walletBalance < amount) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "Insufficient wallet balance",
        });
      }

      await client.query(
        `
        INSERT INTO wallet_transactions (
          user_id,
          type,
          amount,
          description
        )
        VALUES
          ($1, 'debit', $3, $4),
          ($2, 'credit', $3, $5);
        `,
        [
          payerUserId,
          item.receiver_user_id,
          amount,
          `Paid ${item.title} in ${item.room_name}`,
          `Received ${item.title} from split room ${item.room_name}`,
        ],
      );

      const expenseResult = await client.query(
        `
        INSERT INTO expenses (
          user_id,
          title,
          category,
          amount,
          expense_date
        )
        VALUES (
          $1,
          $2,
          'Shared room',
          $3,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        )
        RETURNING id;
        `,
        [payerUserId, `${item.room_name}: ${item.title}`, amount],
      );

      await client.query(
        `
        UPDATE split_room_items
        SET
          collected_at = NOW(),
          expense_id = $2
        WHERE id = $1;
        `,
        [itemId, expenseResult.rows[0].id],
      );

      await client.query(
        `
        UPDATE split_rooms
        SET
          payment_status = CASE
            WHEN payment_status = 'complete' THEN payment_status
            WHEN NOT EXISTS (
              SELECT 1
              FROM split_room_items item
              INNER JOIN split_room_members member
                ON member.id = item.assigned_member_id
              WHERE item.room_id = $1
              AND item.collected_at IS NULL
              AND NOT (
                member.user_id = $2
                OR LOWER(COALESCE(member.email, '')) = LOWER($3)
              )
            )
              THEN 'all_paid'
            ELSE payment_status
          END,
          updated_at = NOW()
        WHERE id = $1;
        `,
        [item.room_id, item.receiver_user_id, item.receiver_email],
      );

      await client.query("COMMIT");

      sendLiveUpdate([payerUserId, item.receiver_user_id], {
        type: "money",
        reason: "due-paid",
        roomId: item.room_id,
      });

      return res.json({
        message: "Due paid successfully",
        paidItem: {
          id: item.id,
          roomId: item.room_id,
          title: item.title,
          amount,
          expenseId: expenseResult.rows[0].id,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Pay due from wallet failed:", error);

      return res.status(500).json({
        message: "Failed to pay due from wallet",
      });
    } finally {
      client.release();
    }
  },
);

router.get(
  "/pending-dues",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      await ensureSplitRoomTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const userResult = await db.query(
        `
        SELECT id, email
        FROM users
        WHERE firebase_uid = $1;
        `,
        [firebaseUser.uid],
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      const dbUserId = userResult.rows[0].id;
      const dbUserEmail = userResult.rows[0].email;

      const duesResult = await db.query(
        `
        SELECT
          split_room_items.id,
          split_room_items.title,
          split_room_items.amount::float,
          split_room_items.created_at,
          split_rooms.id AS room_id,
          split_rooms.name AS room_name,
          owner_user.name AS receiver_name,
          owner_user.email AS receiver_email
        FROM split_room_items
        JOIN split_room_members
          ON split_room_members.id = split_room_items.assigned_member_id
        JOIN split_rooms
          ON split_rooms.id = split_room_items.room_id
        JOIN users AS owner_user
          ON owner_user.id = split_rooms.owner_user_id
        WHERE (
          split_room_members.user_id = $1
          OR LOWER(COALESCE(split_room_members.email, '')) = LOWER($2)
        )
        AND split_rooms.owner_user_id <> $1
        AND split_room_items.collected_at IS NULL
        ORDER BY split_room_items.created_at DESC;
        `,
        [dbUserId, dbUserEmail],
      );

      return res.json({
        dues: duesResult.rows.map((row) => ({
          id: row.id,
          title: row.title,
          amount: Number(row.amount),
          roomId: row.room_id,
          roomName: row.room_name,
          receiverName: row.receiver_name,
          receiverEmail: row.receiver_email,
          createdAt: row.created_at,
        })),
      });
    } catch (error) {
      console.error("Get pending dues failed:", error);

      return res.status(500).json({
        message: "Failed to load pending dues",
      });
    }
  },
);

export default router;
