import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { db } from "../config/db.js";
import { verifyFirebaseToken, } from "../middleware/verifyFirebaseToken.js";
import { sendLiveUpdate } from "../liveEvents.js";
import { isEmailConfigured, sendTransactionalEmail } from "../utils/email.js";
import { parseRequestBody, sendValidationError, } from "../middleware/validateRequest.js";
const router = express.Router();
const acceptPageCacheTtlMs = Number(process.env.ACCEPT_PAGE_CACHE_TTL_MS || 15 * 60 * 1000);
const acceptPageRenderVersion = "2026-06-22-v1";
const inviteEmailSchema = z
    .object({
    email: z.string().trim().email("Enter a valid email address").max(254),
})
    .strict();
const friendRequestSchema = z
    .object({
    email: z.string().trim().email("Enter a valid email address").max(254).optional(),
    identifier: z.string().trim().min(2).max(254).optional(),
    recipientUserId: z.string().uuid().optional(),
})
    .strict()
    .refine((value) => Boolean(value.email || value.identifier || value.recipientUserId), { message: "Enter a username or email address" });
const acceptPageMessages = {
    notFound: "Friend request not found",
    alreadyAccepted: "This friend request is already accepted.",
    needsAccount: "Almost there. Create a SplitVerse account with this email, then open this link again.",
    accepted: "Friend request accepted. You can open SplitVerse now.",
    failed: "Failed to accept this friend request.",
};
const acceptPageCache = new Map();
const acceptPageCacheStats = {
    hits: 0,
    misses: 0,
    renders: 0,
};
async function ensureFriendTables() {
    // Table creation is handled by migrations. Keep this legacy setup disabled in normal requests.
    if (process.env.ENABLE_LEGACY_ROUTE_TABLE_SETUP !== "true") {
        return;
    }
    await db.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS friend_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_email TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      accepted_at TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_unique_pending_idx
      ON friend_requests (requester_user_id, LOWER(recipient_email))
      WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS friendships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_one_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_two_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT friendships_distinct_users CHECK (user_one_id <> user_two_id),
      CONSTRAINT friendships_unique_pair UNIQUE (user_one_id, user_two_id)
    );
  `);
}
async function getCurrentUser(firebaseUid) {
    const result = await db.query(`
    SELECT
      id,
      name,
      username,
      email,
      photo_url,
      profile_photo_url,
      avatar_mode,
      CASE
        WHEN avatar_mode = 'initials' THEN NULL
        ELSE COALESCE(profile_photo_url, photo_url)
      END AS display_photo_url
    FROM users
    WHERE firebase_uid = $1;
    `, [firebaseUid]);
    return result.rows[0] ?? null;
}
function normalizeEmail(email) {
    return String(email ?? "")
        .trim()
        .toLowerCase();
}
function normalizeUsernameIdentifier(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/^@+/, "");
}
function maskEmail(email) {
    const [localPart, domain = ""] = email.split("@");
    if (!domain) {
        return "";
    }
    const visible = localPart.slice(0, Math.min(2, localPart.length));
    return `${visible}${localPart.length > visible.length ? "***" : ""}@${domain}`;
}
function getServerUrl(req) {
    return (process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}
function getClientUrl(req) {
    const configuredClientUrl = String(process.env.CLIENT_URL || "").trim();
    if (configuredClientUrl) {
        return configuredClientUrl.replace(/\/$/, "");
    }
    const requestOrigin = String(req.get("origin") || "").trim();
    if (/^https?:\/\//i.test(requestOrigin)) {
        return requestOrigin.replace(/\/$/, "");
    }
    return getServerUrl(req);
}
function makeSignupInviteUrl(req, recipientEmail) {
    const searchParams = new URLSearchParams({
        email: recipientEmail,
        invited: "1",
    });
    return `${getClientUrl(req)}/signup?${searchParams.toString()}`;
}
function makeAcceptUrl(req, token) {
    return `${getServerUrl(req)}/api/friends/accept/${token}`;
}
function sortFriendPair(userA, userB) {
    return [userA, userB].sort();
}
async function createFriendship(userA, userB) {
    const [userOneId, userTwoId] = sortFriendPair(userA, userB);
    await db.query(`
    INSERT INTO friendships (user_one_id, user_two_id)
    VALUES ($1, $2)
    ON CONFLICT (user_one_id, user_two_id) DO NOTHING;
    `, [userOneId, userTwoId]);
}
async function usersHaveBlockRelationship(userA, userB) {
    const result = await db.query(`
    SELECT 1
    FROM user_blocks
    WHERE (blocker_user_id = $1 AND blocked_user_id = $2)
       OR (blocker_user_id = $2 AND blocked_user_id = $1)
    LIMIT 1;
    `, [userA, userB]);
    return result.rows.length > 0;
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function getAcceptPageLocale(req) {
    return req.acceptsLanguages("en") === "en" ? "en" : "en";
}
function getAcceptPageCacheKey(locale, messageKey) {
    return `${acceptPageRenderVersion}:${locale}:${messageKey}`;
}
function getCachedAcceptPage(locale, messageKey) {
    const now = Date.now();
    const cacheKey = getAcceptPageCacheKey(locale, messageKey);
    const cached = acceptPageCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        acceptPageCacheStats.hits += 1;
        return {
            html: cached.html,
            cacheStatus: "hit",
            renderedAt: cached.renderedAt,
        };
    }
    acceptPageCacheStats.misses += 1;
    acceptPageCacheStats.renders += 1;
    const renderedAt = now;
    const html = renderAcceptPage({
        locale,
        message: acceptPageMessages[messageKey],
    });
    acceptPageCache.set(cacheKey, {
        html,
        expiresAt: now + acceptPageCacheTtlMs,
        renderedAt,
    });
    return {
        html,
        cacheStatus: "miss",
        renderedAt,
    };
}
function sendAcceptPage(req, res, messageKey, statusCode = 200) {
    const locale = getAcceptPageLocale(req);
    const page = getCachedAcceptPage(locale, messageKey);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("Vary", "Accept-Language, Accept-Encoding");
    res.setHeader("X-Render-Cache", page.cacheStatus);
    res.setHeader("X-Rendered-At", new Date(page.renderedAt).toISOString());
    res.status(statusCode).send(page.html);
}
export function getAcceptPageCacheStats() {
    return {
        ...acceptPageCacheStats,
        entries: acceptPageCache.size,
        ttlMs: acceptPageCacheTtlMs,
        version: acceptPageRenderVersion,
    };
}
async function sendSplitVerseInviteEmail({ inviteUrl, recipientEmail, requesterName, }) {
    if (!isEmailConfigured()) {
        return "not_configured";
    }
    const safeRequesterName = escapeHtml(requesterName);
    const safeInviteUrl = escapeHtml(inviteUrl);
    const emailResult = await sendTransactionalEmail({
        to: recipientEmail,
        subject: `${requesterName} invited you to SplitVerse`,
        text: `${requesterName} invited you to join SplitVerse. Create your account here: ${inviteUrl}`,
        html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0b0d;">
        <h1 style="font-size:24px;margin:0 0 12px;">You are invited to SplitVerse</h1>

        <p style="font-size:15px;line-height:1.5;margin:0 0 20px;">
          ${safeRequesterName} invited you to join SplitVerse and split shared expenses fairly.
        </p>

        <a
          href="${safeInviteUrl}"
          style="display:inline-block;padding:12px 18px;border-radius:999px;background:#0052ff;color:#ffffff;text-decoration:none;font-weight:700;"
        >
          Make SplitVerse your own
        </a>

        <p style="font-size:13px;line-height:1.5;color:#667085;margin:20px 0 0;">
          If the button does not work, copy and open this link:
          <br />
          ${safeInviteUrl}
        </p>
      </div>
    `,
    });
    if (!emailResult.ok) {
        console.error("SplitVerse invite email failed through Brevo SMTP:", emailResult);
        return emailResult.reason;
    }
    return "sent";
}
async function sendFriendRequestEmail({ acceptUrl, recipientEmail, requesterName, }) {
    if (!isEmailConfigured()) {
        return "not_configured";
    }
    const safeRequesterName = escapeHtml(requesterName);
    const safeAcceptUrl = escapeHtml(acceptUrl);
    const emailResult = await sendTransactionalEmail({
        to: recipientEmail,
        subject: `${requesterName} sent you a SplitVerse friend request`,
        text: `${requesterName} wants to add you as a friend on SplitVerse. Accept the request here: ${acceptUrl}`,
        html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0b0d;">
        <h1 style="font-size:24px;margin:0 0 12px;">Friend request on SplitVerse</h1>

        <p style="font-size:15px;line-height:1.5;margin:0 0 20px;">
          ${safeRequesterName} wants to add you as a friend on SplitVerse.
        </p>

        <a
          href="${safeAcceptUrl}"
          style="display:inline-block;padding:12px 18px;border-radius:999px;background:#0052ff;color:#ffffff;text-decoration:none;font-weight:700;"
        >
          Accept friend request
        </a>

        <p style="font-size:13px;line-height:1.5;color:#667085;margin:20px 0 0;">
          If the button does not work, copy and open this link:
          <br />
          ${safeAcceptUrl}
        </p>
      </div>
    `,
    });
    if (!emailResult.ok) {
        console.error("Friend request email failed through Brevo SMTP:", emailResult);
        return emailResult.reason;
    }
    return "sent";
}
router.get("/", verifyFirebaseToken, async (req, res) => {
    try {
        await ensureFriendTables();
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const dbUser = await getCurrentUser(firebaseUser.uid);
        if (!dbUser) {
            return res.status(404).json({ message: "User not found in database" });
        }
        const [friendResult, receivedResult, sentResult] = await Promise.all([
            db.query(`
        SELECT
          friend.id,
          friend.name,
          friend.username,
          friend.email,
          friend.photo_url,
          friend.profile_photo_url,
          friend.avatar_mode,
          CASE
            WHEN friend.avatar_mode = 'initials' THEN NULL
            ELSE COALESCE(friend.profile_photo_url, friend.photo_url)
          END AS display_photo_url,
          friendship.created_at AS friendship_created_at,
          GREATEST(
            FLOOR(EXTRACT(EPOCH FROM (NOW() - friendship.created_at)) / 86400),
            0
          )::int AS friendship_days
        FROM friendships friendship
        INNER JOIN users friend
          ON friend.id = CASE
            WHEN friendship.user_one_id = $1 THEN friendship.user_two_id
            ELSE friendship.user_one_id
          END
        WHERE (friendship.user_one_id = $1
        OR friendship.user_two_id = $1)
        AND NOT EXISTS (
          SELECT 1
          FROM user_blocks blocked
          WHERE (blocked.blocker_user_id = $1 AND blocked.blocked_user_id = friend.id)
             OR (blocked.blocker_user_id = friend.id AND blocked.blocked_user_id = $1)
        )
        ORDER BY friend.name NULLS LAST, friend.email;
        `, [dbUser.id]),
            db.query(`
        SELECT
          request.id,
          request.requester_user_id,
          requester.name AS requester_name,
          requester.username AS requester_username,
          requester.email AS requester_email,
          requester.photo_url AS requester_photo_url,
          requester.profile_photo_url AS requester_profile_photo_url,
          requester.avatar_mode AS requester_avatar_mode,
          CASE
            WHEN requester.avatar_mode = 'initials' THEN NULL
            ELSE COALESCE(requester.profile_photo_url, requester.photo_url)
          END AS requester_display_photo_url,
          request.recipient_email,
          request.status,
          request.token,
          request.created_at,
          request.updated_at
        FROM friend_requests request
        INNER JOIN users requester
          ON requester.id = request.requester_user_id
        WHERE LOWER(request.recipient_email) = LOWER($1)
        AND request.status = 'pending'
        AND NOT EXISTS (
          SELECT 1
          FROM user_blocks blocked
          WHERE (blocked.blocker_user_id = $2 AND blocked.blocked_user_id = requester.id)
             OR (blocked.blocker_user_id = requester.id AND blocked.blocked_user_id = $2)
        )
        ORDER BY request.created_at DESC;
        `, [dbUser.email, dbUser.id]),
            db.query(`
        SELECT
          request.id,
          request.requester_user_id,
          requester.name AS requester_name,
          requester.username AS requester_username,
          requester.email AS requester_email,
          requester.photo_url AS requester_photo_url,
          requester.profile_photo_url AS requester_profile_photo_url,
          requester.avatar_mode AS requester_avatar_mode,
          CASE
            WHEN requester.avatar_mode = 'initials' THEN NULL
            ELSE COALESCE(requester.profile_photo_url, requester.photo_url)
          END AS requester_display_photo_url,
          request.recipient_email,
          request.status,
          request.token,
          request.created_at,
          request.updated_at
        FROM friend_requests request
        INNER JOIN users requester
          ON requester.id = request.requester_user_id
        WHERE request.requester_user_id = $1
        ORDER BY request.created_at DESC
        LIMIT 8;
        `, [dbUser.id]),
        ]);
        return res.json({
            friends: friendResult.rows,
            receivedRequests: receivedResult.rows,
            sentRequests: sentResult.rows.map((request) => ({
                ...request,
                acceptUrl: makeAcceptUrl(req, request.token),
            })),
        });
    }
    catch (error) {
        console.error("Load friends failed:", error);
        return res.status(500).json({
            message: "Failed to load friends",
        });
    }
});
router.get("/people", verifyFirebaseToken, async (req, res) => {
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const dbUser = await getCurrentUser(firebaseUser.uid);
        if (!dbUser) {
            return res.status(404).json({ message: "User not found in database" });
        }
        const query = normalizeUsernameIdentifier(req.query.query);
        if (query.length < 2) {
            return res.json({ people: [] });
        }
        if (query.length > 60) {
            return res.status(400).json({ message: "Search is too long" });
        }
        const result = await db.query(`
      SELECT
        candidate.id,
        candidate.name,
        candidate.username,
        candidate.email,
        candidate.photo_url,
        candidate.profile_photo_url,
        candidate.avatar_mode,
        CASE
          WHEN candidate.avatar_mode = 'initials' THEN NULL
          ELSE COALESCE(candidate.profile_photo_url, candidate.photo_url)
        END AS display_photo_url,
        CASE
          WHEN friendship.id IS NOT NULL THEN 'friends'
          WHEN outgoing_request.id IS NOT NULL THEN 'request_sent'
          WHEN incoming_request.id IS NOT NULL THEN 'request_received'
          ELSE 'none'
        END AS relationship_status
      FROM users candidate
      LEFT JOIN friendships friendship
        ON friendship.user_one_id = LEAST($1::uuid, candidate.id)
        AND friendship.user_two_id = GREATEST($1::uuid, candidate.id)
      LEFT JOIN friend_requests outgoing_request
        ON outgoing_request.requester_user_id = $1
        AND outgoing_request.status = 'pending'
        AND (
          outgoing_request.recipient_user_id = candidate.id
          OR LOWER(outgoing_request.recipient_email) = LOWER(candidate.email)
        )
      LEFT JOIN friend_requests incoming_request
        ON incoming_request.requester_user_id = candidate.id
        AND incoming_request.status = 'pending'
        AND (
          incoming_request.recipient_user_id = $1
          OR LOWER(incoming_request.recipient_email) = LOWER($2)
        )
      WHERE candidate.id <> $1
      AND NOT EXISTS (
        SELECT 1
        FROM user_blocks blocked
        WHERE (blocked.blocker_user_id = $1 AND blocked.blocked_user_id = candidate.id)
           OR (blocked.blocker_user_id = candidate.id AND blocked.blocked_user_id = $1)
      )
      AND (
        LOWER(candidate.username) LIKE $3 || '%'
        OR LOWER(COALESCE(candidate.name, '')) LIKE '%' || $3 || '%'
        OR LOWER(candidate.email) = $3
      )
      ORDER BY
        CASE WHEN LOWER(candidate.username) = $3 THEN 0 ELSE 1 END,
        CASE WHEN LOWER(candidate.username) LIKE $3 || '%' THEN 0 ELSE 1 END,
        candidate.name NULLS LAST,
        candidate.username
      LIMIT 20;
      `, [dbUser.id, dbUser.email, query]);
        return res.json({
            people: result.rows.map((person) => ({
                id: person.id,
                name: person.name,
                username: person.username,
                emailHint: maskEmail(person.email),
                photo_url: person.photo_url,
                profile_photo_url: person.profile_photo_url,
                avatar_mode: person.avatar_mode,
                display_photo_url: person.display_photo_url,
                relationshipStatus: person.relationship_status,
            })),
        });
    }
    catch (error) {
        console.error("Search people failed:", error);
        return res.status(500).json({ message: "Failed to search people" });
    }
});
router.post("/invites", verifyFirebaseToken, async (req, res) => {
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const dbUser = await getCurrentUser(firebaseUser.uid);
        if (!dbUser) {
            return res.status(404).json({ message: "User not found in database" });
        }
        const payload = parseRequestBody(inviteEmailSchema, req.body);
        const recipientEmail = normalizeEmail(payload.email);
        if (recipientEmail === normalizeEmail(dbUser.email)) {
            return res
                .status(400)
                .json({ message: "You cannot send an invite to yourself" });
        }
        const existingUserResult = await db.query(`
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1;
      `, [recipientEmail]);
        if (existingUserResult.rows.length > 0) {
            return res.status(409).json({
                message: "This person already uses SplitVerse. Find them in search and send a friend request instead.",
            });
        }
        const inviteUrl = makeSignupInviteUrl(req, recipientEmail);
        const emailStatus = await sendSplitVerseInviteEmail({
            inviteUrl,
            recipientEmail,
            requesterName: dbUser.name || `@${dbUser.username}`,
        });
        if (emailStatus !== "sent") {
            return res.status(503).json({
                message: "The signup invite could not be delivered. Please try again later.",
                emailStatus,
            });
        }
        return res.status(200).json({
            message: `Signup invite sent to ${recipientEmail}.`,
            emailStatus,
        });
    }
    catch (error) {
        if (sendValidationError(res, error)) {
            return;
        }
        console.error("Send SplitVerse invite failed:", error);
        return res.status(500).json({
            message: "Failed to send the SplitVerse invite",
        });
    }
});
router.post("/requests", verifyFirebaseToken, async (req, res) => {
    try {
        await ensureFriendTables();
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const dbUser = await getCurrentUser(firebaseUser.uid);
        if (!dbUser) {
            return res.status(404).json({ message: "User not found in database" });
        }
        const payload = parseRequestBody(friendRequestSchema, req.body);
        const rawIdentifier = payload.identifier || payload.email || "";
        const normalizedIdentifier = normalizeUsernameIdentifier(rawIdentifier);
        const recipientResult = await db.query(`
      SELECT
        id,
        name,
        username,
        email,
        photo_url,
        profile_photo_url,
        avatar_mode,
        CASE
          WHEN avatar_mode = 'initials' THEN NULL
          ELSE COALESCE(profile_photo_url, photo_url)
        END AS display_photo_url
      FROM users
      WHERE
        ($1::uuid IS NOT NULL AND id = $1::uuid)
        OR ($1::uuid IS NULL AND LOWER(email) = LOWER($2))
        OR ($1::uuid IS NULL AND LOWER(username) = LOWER($3))
      LIMIT 1;
      `, [
            payload.recipientUserId || null,
            normalizeEmail(rawIdentifier),
            normalizedIdentifier,
        ]);
        const recipientUser = recipientResult.rows[0];
        const recipientEmail = recipientUser?.email || normalizeEmail(rawIdentifier);
        if (!recipientUser && !z.string().email().safeParse(recipientEmail).success) {
            return res.status(404).json({
                message: "No SplitVerse user was found with that username. Enter a valid email to send an invite.",
            });
        }
        if (normalizeEmail(recipientEmail) === normalizeEmail(dbUser.email) ||
            recipientUser?.id === dbUser.id) {
            return res
                .status(400)
                .json({ message: "You cannot send a friend request to yourself" });
        }
        if (recipientUser && (await usersHaveBlockRelationship(dbUser.id, recipientUser.id))) {
            return res.status(403).json({
                message: "A friend request cannot be sent between blocked accounts.",
            });
        }
        if (recipientUser) {
            const [userOneId, userTwoId] = sortFriendPair(dbUser.id, recipientUser.id);
            const existingFriendResult = await db.query(`
        SELECT id
        FROM friendships
        WHERE user_one_id = $1
        AND user_two_id = $2;
        `, [userOneId, userTwoId]);
            if (existingFriendResult.rows.length > 0) {
                return res.status(409).json({ message: "You are already friends" });
            }
            const reverseRequestResult = await db.query(`
        SELECT id
        FROM friend_requests
        WHERE requester_user_id = $1
        AND status = 'pending'
        AND (
          recipient_user_id = $2
          OR LOWER(recipient_email) = LOWER($3)
        )
        LIMIT 1;
        `, [recipientUser.id, dbUser.id, dbUser.email]);
            if (reverseRequestResult.rows.length > 0) {
                return res.status(409).json({
                    message: "This person has already sent you a friend request. Accept it from your inbox.",
                });
            }
        }
        const token = crypto.randomBytes(32).toString("hex");
        const requestResult = await db.query(`
      INSERT INTO friend_requests (
        requester_user_id,
        recipient_user_id,
        recipient_email,
        token
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (requester_user_id, (LOWER(recipient_email)))
      WHERE status = 'pending'
      DO UPDATE SET
        recipient_user_id = EXCLUDED.recipient_user_id,
        token = EXCLUDED.token,
        updated_at = NOW()
      RETURNING
        id,
        requester_user_id,
        recipient_user_id,
        recipient_email,
        status,
        token,
        created_at,
        updated_at;
      `, [dbUser.id, recipientUser?.id || null, recipientEmail, token]);
        const acceptUrl = makeAcceptUrl(req, requestResult.rows[0].token);
        const emailStatus = await sendFriendRequestEmail({
            acceptUrl,
            recipientEmail,
            requesterName: dbUser.name || `@${dbUser.username}`,
        });
        sendLiveUpdate([dbUser.id, recipientUser?.id], {
            type: "friends",
            reason: "friend-request-sent",
        });
        return res.status(201).json({
            message: "Friend request sent",
            request: {
                ...requestResult.rows[0],
                requester_name: dbUser.name,
                requester_username: dbUser.username,
                requester_email: dbUser.email,
                acceptUrl,
                emailStatus,
            },
        });
    }
    catch (error) {
        if (sendValidationError(res, error)) {
            return;
        }
        console.error("Send friend request failed:", error);
        return res.status(500).json({
            message: "Failed to send friend request",
        });
    }
});
router.delete("/requests/:requestId", verifyFirebaseToken, async (req, res) => {
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const dbUser = await getCurrentUser(firebaseUser.uid);
        if (!dbUser) {
            return res.status(404).json({ message: "User not found in database" });
        }
        const requestResult = await db.query(`
        SELECT
          request.*,
          (request.requester_user_id = $2) AS is_requester
        FROM friend_requests request
        WHERE request.id = $1
        AND request.status = 'pending'
        AND (
          request.requester_user_id = $2
          OR request.recipient_user_id = $2
          OR LOWER(request.recipient_email) = LOWER($3)
        )
        LIMIT 1;
        `, [req.params.requestId, dbUser.id, dbUser.email]);
        const friendRequest = requestResult.rows[0];
        if (!friendRequest) {
            return res.status(404).json({ message: "Friend request not found" });
        }
        const nextStatus = friendRequest.is_requester ? "cancelled" : "declined";
        await db.query(`
        UPDATE friend_requests
        SET status = $2,
            updated_at = NOW()
        WHERE id = $1;
        `, [friendRequest.id, nextStatus]);
        sendLiveUpdate([dbUser.id, friendRequest.requester_user_id, friendRequest.recipient_user_id], {
            type: "friends",
            reason: nextStatus === "cancelled" ? "friend-request-cancelled" : "friend-request-declined",
        });
        return res.json({
            message: nextStatus === "cancelled"
                ? "Friend request cancelled"
                : "Friend request declined",
        });
    }
    catch (error) {
        console.error("Delete friend request failed:", error);
        return res.status(500).json({ message: "Failed to delete friend request" });
    }
});
router.get("/blocked", verifyFirebaseToken, async (req, res) => {
    try {
        const firebaseUser = req.user;
        if (!firebaseUser)
            return res.status(401).json({ message: "Unauthorized" });
        const dbUser = await getCurrentUser(firebaseUser.uid);
        if (!dbUser)
            return res.status(404).json({ message: "User not found in database" });
        const result = await db.query(`
      SELECT
        blocked_user.id,
        blocked_user.name,
        blocked_user.username,
        blocked_user.email,
        blocked_user.photo_url,
        blocked_user.profile_photo_url,
        blocked_user.avatar_mode,
        CASE
          WHEN blocked_user.avatar_mode = 'initials' THEN NULL
          ELSE COALESCE(blocked_user.profile_photo_url, blocked_user.photo_url)
        END AS display_photo_url,
        user_blocks.created_at AS blocked_at
      FROM user_blocks
      JOIN users blocked_user ON blocked_user.id = user_blocks.blocked_user_id
      WHERE user_blocks.blocker_user_id = $1
      ORDER BY user_blocks.created_at DESC;
      `, [dbUser.id]);
        return res.json({ blockedUsers: result.rows });
    }
    catch (error) {
        console.error("Load blocked users failed:", error);
        return res.status(500).json({ message: "Failed to load blocked users" });
    }
});
router.delete("/blocked/:userId", verifyFirebaseToken, async (req, res) => {
    try {
        const firebaseUser = req.user;
        if (!firebaseUser)
            return res.status(401).json({ message: "Unauthorized" });
        const dbUser = await getCurrentUser(firebaseUser.uid);
        if (!dbUser)
            return res.status(404).json({ message: "User not found in database" });
        const blockedUserId = String(req.params.userId || "");
        if (!blockedUserId) {
            return res.status(400).json({ message: "Blocked user is required" });
        }
        const result = await db.query(`DELETE FROM user_blocks
         WHERE blocker_user_id = $1 AND blocked_user_id = $2
         RETURNING id;`, [dbUser.id, blockedUserId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Blocked user not found" });
        }
        sendLiveUpdate([dbUser.id, blockedUserId], {
            type: "friends",
            reason: "user-unblocked",
        });
        return res.json({ message: "User unblocked" });
    }
    catch (error) {
        console.error("Unblock user failed:", error);
        return res.status(500).json({ message: "Failed to unblock user" });
    }
});
router.post("/:friendId/block", verifyFirebaseToken, async (req, res) => {
    const client = await db.connect();
    try {
        const firebaseUser = req.user;
        if (!firebaseUser)
            return res.status(401).json({ message: "Unauthorized" });
        const dbUser = await getCurrentUser(firebaseUser.uid);
        if (!dbUser)
            return res.status(404).json({ message: "User not found in database" });
        const friendId = String(req.params.friendId || "");
        if (!friendId || friendId === dbUser.id) {
            return res.status(400).json({ message: "Choose another user to block" });
        }
        const targetResult = await client.query(`
        SELECT
          id, name, username, email, photo_url, profile_photo_url, avatar_mode,
          CASE WHEN avatar_mode = 'initials' THEN NULL
               ELSE COALESCE(profile_photo_url, photo_url) END AS display_photo_url
        FROM users
        WHERE id = $1
        LIMIT 1;
        `, [friendId]);
        const blockedUser = targetResult.rows[0];
        if (!blockedUser)
            return res.status(404).json({ message: "User not found" });
        const [userOneId, userTwoId] = sortFriendPair(dbUser.id, friendId);
        await client.query("BEGIN");
        await client.query(`INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
         VALUES ($1, $2)
         ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING;`, [dbUser.id, friendId]);
        await client.query(`DELETE FROM friendships WHERE user_one_id = $1 AND user_two_id = $2;`, [userOneId, userTwoId]);
        await client.query(`
        UPDATE friend_requests
        SET status = 'cancelled', updated_at = NOW()
        WHERE status = 'pending'
        AND (
          (requester_user_id = $1 AND (recipient_user_id = $2 OR LOWER(recipient_email) = LOWER($3)))
          OR
          (requester_user_id = $2 AND (recipient_user_id = $1 OR LOWER(recipient_email) = LOWER($4)))
        );
        `, [dbUser.id, friendId, blockedUser.email, dbUser.email]);
        await client.query("COMMIT");
        sendLiveUpdate([dbUser.id, friendId], {
            type: "friends",
            reason: "user-blocked",
        });
        return res.json({ message: "User blocked", blockedUser });
    }
    catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        console.error("Block user failed:", error);
        return res.status(500).json({ message: "Failed to block user" });
    }
    finally {
        client.release();
    }
});
router.get("/:friendId/activity", verifyFirebaseToken, async (req, res) => {
    try {
        await ensureFriendTables();
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const dbUser = await getCurrentUser(firebaseUser.uid);
        if (!dbUser) {
            return res.status(404).json({ message: "User not found in database" });
        }
        const friendId = String(req.params.friendId ?? "");
        if (!friendId) {
            return res.status(400).json({ message: "Friend id is required" });
        }
        const [userOneId, userTwoId] = sortFriendPair(dbUser.id, friendId);
        const friendshipResult = await db.query(`
      SELECT id
      FROM friendships
      WHERE user_one_id = $1
      AND user_two_id = $2;
      `, [userOneId, userTwoId]);
        if (friendshipResult.rows.length === 0) {
            return res.status(404).json({ message: "Friendship not found" });
        }
        const friendResult = await db.query(`
      SELECT
        users.id,
        users.name,
        users.username,
        users.email,
        users.photo_url,
        users.profile_photo_url,
        users.avatar_mode,
        CASE
          WHEN users.avatar_mode = 'initials' THEN NULL
          ELSE COALESCE(users.profile_photo_url, users.photo_url)
        END AS display_photo_url,
        friendships.created_at AS friendship_created_at,
        GREATEST(0, DATE_PART('day', NOW() - friendships.created_at)::int) AS friendship_days
      FROM users
      INNER JOIN friendships
        ON (
          (friendships.user_one_id = $1 AND friendships.user_two_id = users.id)
          OR (friendships.user_two_id = $1 AND friendships.user_one_id = users.id)
        )
      WHERE users.id = $2;
      `, [dbUser.id, friendId]);
        const friend = friendResult.rows[0];
        if (!friend) {
            return res.status(404).json({ message: "Friend not found" });
        }
        const activityResult = await db.query(`
      WITH shared_rooms AS (
        SELECT DISTINCT room.id
        FROM split_rooms room
        INNER JOIN split_room_members mine ON mine.room_id = room.id
        INNER JOIN split_room_members theirs ON theirs.room_id = room.id
        WHERE (
          mine.user_id = $1
          OR LOWER(COALESCE(mine.email, '')) = LOWER($3)
          OR room.owner_user_id = $1
          OR COALESCE(room.paid_by_user_id, room.owner_user_id) = $1
        )
        AND (
          theirs.user_id = $2
          OR LOWER(COALESCE(theirs.email, '')) = LOWER($4)
          OR room.owner_user_id = $2
          OR COALESCE(room.paid_by_user_id, room.owner_user_id) = $2
        )
      ),
      room_activity AS (
        SELECT
          'room-' || room.id::text AS id,
          room.name AS title,
          COALESCE(SUM(item.amount), 0)::float AS amount,
          'neutral' AS direction,
          'room' AS source,
          room.created_at
        FROM split_rooms room
        INNER JOIN shared_rooms shared ON shared.id = room.id
        LEFT JOIN split_room_items item ON item.room_id = room.id
        GROUP BY room.id, room.name, room.created_at
      ),
      wallet_activity AS (
        SELECT
          'wallet-' || wallet.id::text AS id,
          COALESCE(wallet.description, 'Wallet settlement') AS title,
          wallet.amount::float AS amount,
          CASE
            WHEN wallet.user_id = $1 AND wallet.type = 'debit' THEN 'outgoing'
            WHEN wallet.user_id = $1 AND wallet.type = 'credit' THEN 'incoming'
            ELSE 'neutral'
          END AS direction,
          'wallet' AS source,
          wallet.created_at
        FROM wallet_transactions wallet
        WHERE wallet.user_id = $1
        AND LOWER(COALESCE(wallet.description, '')) LIKE '%' || LOWER($4) || '%'
      )
      SELECT *
      FROM (
        SELECT * FROM room_activity
        UNION ALL
        SELECT * FROM wallet_activity
      ) activity
      ORDER BY created_at DESC
      LIMIT 8;
      `, [dbUser.id, friendId, dbUser.email, friend.email]);
        const summaryResult = await db.query(`
      WITH shared_rooms AS (
        SELECT DISTINCT room.id
        FROM split_rooms room
        INNER JOIN split_room_members mine ON mine.room_id = room.id
        INNER JOIN split_room_members theirs ON theirs.room_id = room.id
        WHERE (
          mine.user_id = $1
          OR LOWER(COALESCE(mine.email, '')) = LOWER($3)
          OR room.owner_user_id = $1
          OR COALESCE(room.paid_by_user_id, room.owner_user_id) = $1
        )
        AND (
          theirs.user_id = $2
          OR LOWER(COALESCE(theirs.email, '')) = LOWER($4)
          OR room.owner_user_id = $2
          OR COALESCE(room.paid_by_user_id, room.owner_user_id) = $2
        )
      ),
      friend_wallet AS (
        SELECT
          COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0)::float AS incoming,
          COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)::float AS outgoing
        FROM wallet_transactions
        WHERE user_id = $1
        AND LOWER(COALESCE(description, '')) LIKE '%' || LOWER($4) || '%'
      )
      SELECT
        (SELECT COUNT(*)::int FROM shared_rooms) AS rooms_together,
        COALESCE(friend_wallet.incoming + friend_wallet.outgoing, 0)::float AS total_settled,
        COALESCE(friend_wallet.incoming - friend_wallet.outgoing, 0)::float AS net_position
      FROM friend_wallet;
      `, [dbUser.id, friendId, dbUser.email, friend.email]);
        return res.json({
            friend,
            summary: {
                roomsTogether: Number(summaryResult.rows[0]?.rooms_together ?? 0),
                totalSettled: Number(summaryResult.rows[0]?.total_settled ?? 0),
                pendingWithFriend: 0,
                netPosition: Number(summaryResult.rows[0]?.net_position ?? 0),
            },
            recentActivity: activityResult.rows.map((row) => ({
                id: row.id,
                title: row.title,
                amount: Number(row.amount),
                direction: row.direction,
                source: row.source,
                createdAt: row.created_at,
            })),
        });
    }
    catch (error) {
        console.error("Load friend activity failed:", error);
        return res.status(500).json({
            message: "Failed to load friend activity",
        });
    }
});
router.delete("/:friendId", verifyFirebaseToken, async (req, res) => {
    try {
        await ensureFriendTables();
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const dbUser = await getCurrentUser(firebaseUser.uid);
        if (!dbUser) {
            return res.status(404).json({ message: "User not found in database" });
        }
        const friendId = String(req.params.friendId ?? "");
        if (!friendId) {
            return res.status(400).json({ message: "Friend id is required" });
        }
        const [userOneId, userTwoId] = sortFriendPair(dbUser.id, friendId);
        const deleteResult = await db.query(`
      DELETE FROM friendships
      WHERE user_one_id = $1
      AND user_two_id = $2
      RETURNING id;
      `, [userOneId, userTwoId]);
        if (deleteResult.rows.length === 0) {
            return res.status(404).json({ message: "Friendship not found" });
        }
        sendLiveUpdate([dbUser.id, friendId], {
            type: "friends",
            reason: "friend-deleted",
        });
        return res.json({
            message: "Friend deleted",
        });
    }
    catch (error) {
        console.error("Delete friend failed:", error);
        return res.status(500).json({
            message: "Failed to delete friend",
        });
    }
});
router.post("/requests/:requestId/accept", verifyFirebaseToken, async (req, res) => {
    try {
        await ensureFriendTables();
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const dbUser = await getCurrentUser(firebaseUser.uid);
        if (!dbUser) {
            return res.status(404).json({ message: "User not found in database" });
        }
        const requestResult = await db.query(`
        SELECT *
        FROM friend_requests
        WHERE id = $1
        AND LOWER(recipient_email) = LOWER($2)
        AND status = 'pending';
        `, [req.params.requestId, dbUser.email]);
        const friendRequest = requestResult.rows[0];
        if (!friendRequest) {
            return res.status(404).json({ message: "Friend request not found" });
        }
        if (await usersHaveBlockRelationship(friendRequest.requester_user_id, dbUser.id)) {
            return res.status(403).json({
                message: "This friend request cannot be accepted because one account is blocked.",
            });
        }
        await createFriendship(friendRequest.requester_user_id, dbUser.id);
        await db.query(`
        UPDATE friend_requests
        SET status = 'accepted',
            accepted_at = NOW(),
            updated_at = NOW()
        WHERE id = $1;
        `, [friendRequest.id]);
        sendLiveUpdate([dbUser.id, friendRequest.requester_user_id], {
            type: "friends",
            reason: "friend-request-accepted",
        });
        return res.json({
            message: "Friend request accepted",
        });
    }
    catch (error) {
        console.error("Accept friend request failed:", error);
        return res.status(500).json({
            message: "Failed to accept friend request",
        });
    }
});
router.get("/accept/:token", async (req, res) => {
    try {
        await ensureFriendTables();
        const requestResult = await db.query(`
      SELECT *
      FROM friend_requests
      WHERE token = $1;
      `, [req.params.token]);
        const friendRequest = requestResult.rows[0];
        if (!friendRequest) {
            return sendAcceptPage(req, res, "notFound", 404);
        }
        if (friendRequest.status === "accepted") {
            return sendAcceptPage(req, res, "alreadyAccepted");
        }
        if (friendRequest.status !== "pending") {
            return sendAcceptPage(req, res, "notFound", 404);
        }
        const recipientResult = await db.query(`
      SELECT id, name, username, email, photo_url
      FROM users
      WHERE LOWER(email) = LOWER($1);
      `, [friendRequest.recipient_email]);
        const recipientUser = recipientResult.rows[0];
        if (!recipientUser) {
            return sendAcceptPage(req, res, "needsAccount");
        }
        await createFriendship(friendRequest.requester_user_id, recipientUser.id);
        await db.query(`
      UPDATE friend_requests
      SET status = 'accepted',
          accepted_at = NOW(),
          updated_at = NOW()
      WHERE id = $1;
      `, [friendRequest.id]);
        sendLiveUpdate([recipientUser.id, friendRequest.requester_user_id], {
            type: "friends",
            reason: "friend-request-accepted",
        });
        return sendAcceptPage(req, res, "accepted");
    }
    catch (error) {
        console.error("Public accept friend request failed:", error);
        return sendAcceptPage(req, res, "failed", 500);
    }
});
function renderAcceptPage({ locale, message, }) {
    const safeMessage = escapeHtml(message);
    return `
    <!doctype html>
    <html lang="${locale}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SplitVerse friend request</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: Inter, Arial, sans-serif;
            color: #0a0b0d;
            background: #f7f7f7;
          }

          main {
            width: min(460px, calc(100vw - 32px));
            padding: 28px;
            border: 1px solid #dee1e6;
            border-radius: 20px;
            background: #ffffff;
            box-shadow: 0 18px 42px rgba(10, 11, 13, 0.1);
          }

          h1 {
            margin: 0 0 10px;
            font-size: 26px;
            font-weight: 600;
          }

          p {
            margin: 0;
            color: #5b616e;
            font-size: 15px;
            line-height: 1.55;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>SplitVerse</h1>
          <p>${safeMessage}</p>
        </main>
      </body>
    </html>
  `;
}
export default router;
