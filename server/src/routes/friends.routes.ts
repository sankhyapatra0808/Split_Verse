import crypto from "node:crypto";
import express from "express";
import { db } from "../config/db.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";
import { sendLiveUpdate } from "../liveEvents.js";

const router = express.Router();

type DbUserRow = {
  id: string;
  name: string | null;
  email: string;
  photo_url: string | null;
};

type FriendRequestRow = {
  id: string;
  requester_user_id: string;
  requester_name: string | null;
  requester_email: string;
  recipient_email: string;
  status: string;
  token: string;
  created_at: string;
  updated_at: string;
};

async function ensureFriendTables() {
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

async function getCurrentUser(firebaseUid: string) {
  const result = await db.query<DbUserRow>(
    `
    SELECT id, name, email, photo_url
    FROM users
    WHERE firebase_uid = $1;
    `,
    [firebaseUid],
  );

  return result.rows[0] ?? null;
}

function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getServerUrl(req: express.Request) {
  return (
    process.env.SERVER_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");
}

function makeAcceptUrl(req: express.Request, token: string) {
  return `${getServerUrl(req)}/api/friends/accept/${token}`;
}

function sortFriendPair(userA: string, userB: string) {
  return [userA, userB].sort() as [string, string];
}

async function createFriendship(userA: string, userB: string) {
  const [userOneId, userTwoId] = sortFriendPair(userA, userB);

  await db.query(
    `
    INSERT INTO friendships (user_one_id, user_two_id)
    VALUES ($1, $2)
    ON CONFLICT (user_one_id, user_two_id) DO NOTHING;
    `,
    [userOneId, userTwoId],
  );
}

async function sendFriendRequestEmail({
  acceptUrl,
  recipientEmail,
  requesterName,
}: {
  acceptUrl: string;
  recipientEmail: string;
  requesterName: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || "SplitVerse <onboarding@resend.dev>";

  if (!resendApiKey) {
    return "not_configured";
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: recipientEmail,
      subject: `${requesterName} sent you a SplitVerse friend request`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0b0d;">
          <h1 style="font-size:24px;margin:0 0 12px;">Friend request on SplitVerse</h1>
          <p style="font-size:15px;line-height:1.5;margin:0 0 20px;">
            ${requesterName} wants to add you as a friend on SplitVerse.
          </p>
          <a href="${acceptUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#0052ff;color:#ffffff;text-decoration:none;font-weight:700;">
            Accept friend request
          </a>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const data = await response.text();
    console.error("Friend request email failed:", data);
    return "failed";
  }

  return "sent";
}

router.get("/", verifyFirebaseToken, async (req: AuthRequest, res) => {
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
      db.query<DbUserRow>(
        `
        SELECT
          friend.id,
          friend.name,
          friend.email,
          friend.photo_url
        FROM friendships friendship
        INNER JOIN users friend
          ON friend.id = CASE
            WHEN friendship.user_one_id = $1 THEN friendship.user_two_id
            ELSE friendship.user_one_id
          END
        WHERE friendship.user_one_id = $1
        OR friendship.user_two_id = $1
        ORDER BY friend.name NULLS LAST, friend.email;
        `,
        [dbUser.id],
      ),
      db.query<FriendRequestRow>(
        `
        SELECT
          request.id,
          request.requester_user_id,
          requester.name AS requester_name,
          requester.email AS requester_email,
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
        ORDER BY request.created_at DESC;
        `,
        [dbUser.email],
      ),
      db.query<FriendRequestRow>(
        `
        SELECT
          request.id,
          request.requester_user_id,
          requester.name AS requester_name,
          requester.email AS requester_email,
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
        `,
        [dbUser.id],
      ),
    ]);

    return res.json({
      friends: friendResult.rows,
      receivedRequests: receivedResult.rows,
      sentRequests: sentResult.rows.map((request) => ({
        ...request,
        acceptUrl: makeAcceptUrl(req, request.token),
      })),
    });
  } catch (error) {
    console.error("Load friends failed:", error);

    return res.status(500).json({
      message: "Failed to load friends",
    });
  }
});

router.post("/requests", verifyFirebaseToken, async (req: AuthRequest, res) => {
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

    const recipientEmail = normalizeEmail(req.body.email);

    if (!isEmail(recipientEmail)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    if (recipientEmail === dbUser.email.toLowerCase()) {
      return res.status(400).json({ message: "You cannot send a friend request to yourself" });
    }

    const recipientResult = await db.query<DbUserRow>(
      `
      SELECT id, name, email, photo_url
      FROM users
      WHERE LOWER(email) = LOWER($1);
      `,
      [recipientEmail],
    );
    const recipientUser = recipientResult.rows[0];

    if (recipientUser) {
      const [userOneId, userTwoId] = sortFriendPair(dbUser.id, recipientUser.id);
      const existingFriendResult = await db.query(
        `
        SELECT id
        FROM friendships
        WHERE user_one_id = $1
        AND user_two_id = $2;
        `,
        [userOneId, userTwoId],
      );

      if (existingFriendResult.rows.length > 0) {
        return res.status(409).json({ message: "You are already friends" });
      }
    }

    const token = crypto.randomBytes(32).toString("hex");

    const requestResult = await db.query<FriendRequestRow>(
      `
      INSERT INTO friend_requests (
        requester_user_id,
        recipient_email,
        token
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (requester_user_id, (LOWER(recipient_email)))
      WHERE status = 'pending'
      DO UPDATE SET
        token = EXCLUDED.token,
        updated_at = NOW()
      RETURNING
        id,
        requester_user_id,
        recipient_email,
        status,
        token,
        created_at,
        updated_at;
      `,
      [dbUser.id, recipientEmail, token],
    );

    const acceptUrl = makeAcceptUrl(req, requestResult.rows[0].token);
    const emailStatus = await sendFriendRequestEmail({
      acceptUrl,
      recipientEmail,
      requesterName: dbUser.name || dbUser.email,
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
        requester_email: dbUser.email,
        acceptUrl,
        emailStatus,
      },
    });
  } catch (error) {
    console.error("Send friend request failed:", error);

    return res.status(500).json({
      message: "Failed to send friend request",
    });
  }
});

router.post(
  "/requests/:requestId/accept",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
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

      const requestResult = await db.query<FriendRequestRow>(
        `
        SELECT *
        FROM friend_requests
        WHERE id = $1
        AND LOWER(recipient_email) = LOWER($2)
        AND status = 'pending';
        `,
        [req.params.requestId, dbUser.email],
      );

      const friendRequest = requestResult.rows[0];

      if (!friendRequest) {
        return res.status(404).json({ message: "Friend request not found" });
      }

      await createFriendship(friendRequest.requester_user_id, dbUser.id);

      await db.query(
        `
        UPDATE friend_requests
        SET status = 'accepted',
            accepted_at = NOW(),
            updated_at = NOW()
        WHERE id = $1;
        `,
        [friendRequest.id],
      );

      sendLiveUpdate([dbUser.id, friendRequest.requester_user_id], {
        type: "friends",
        reason: "friend-request-accepted",
      });

      return res.json({
        message: "Friend request accepted",
      });
    } catch (error) {
      console.error("Accept friend request failed:", error);

      return res.status(500).json({
        message: "Failed to accept friend request",
      });
    }
  },
);

router.get("/accept/:token", async (req, res) => {
  try {
    await ensureFriendTables();

    const requestResult = await db.query<FriendRequestRow>(
      `
      SELECT *
      FROM friend_requests
      WHERE token = $1;
      `,
      [req.params.token],
    );

    const friendRequest = requestResult.rows[0];

    if (!friendRequest) {
      return res.status(404).send(renderAcceptPage("Friend request not found"));
    }

    if (friendRequest.status === "accepted") {
      return res.send(renderAcceptPage("This friend request is already accepted."));
    }

    const recipientResult = await db.query<DbUserRow>(
      `
      SELECT id, name, email, photo_url
      FROM users
      WHERE LOWER(email) = LOWER($1);
      `,
      [friendRequest.recipient_email],
    );

    const recipientUser = recipientResult.rows[0];

    if (!recipientUser) {
      return res.send(
        renderAcceptPage(
          "Almost there. Create a SplitVerse account with this email, then open this link again.",
        ),
      );
    }

    await createFriendship(friendRequest.requester_user_id, recipientUser.id);

    await db.query(
      `
      UPDATE friend_requests
      SET status = 'accepted',
          accepted_at = NOW(),
          updated_at = NOW()
      WHERE id = $1;
      `,
      [friendRequest.id],
    );

    sendLiveUpdate([recipientUser.id, friendRequest.requester_user_id], {
      type: "friends",
      reason: "friend-request-accepted",
    });

    return res.send(renderAcceptPage("Friend request accepted. You can open SplitVerse now."));
  } catch (error) {
    console.error("Public accept friend request failed:", error);

    return res.status(500).send(renderAcceptPage("Failed to accept this friend request."));
  }
});

function renderAcceptPage(message: string) {
  return `
    <!doctype html>
    <html lang="en">
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
          <p>${message}</p>
        </main>
      </body>
    </html>
  `;
}

export default router;
