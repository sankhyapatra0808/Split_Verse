import crypto from "node:crypto";
import express from "express";
import { db } from "../config/db.js";
import { adminAuth } from "../config/firebaseAdmin.js";
import { isEmailConfigured, sendTransactionalEmail } from "../utils/email.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";

const router = express.Router();
const deleteAccountConfirmationText = "/DeleteAccount";
const loginOtpLength = 6;
const loginOtpExpiryMs = 10 * 60 * 1000;
const maxLoginOtpAttempts = 5;

type LoginOtpSession = {
  firebaseUid: string;
  email: string;
  otpHash: string;
  expiresAt: number;
  attempts: number;
};

const loginOtpSessions = new Map<string, LoginOtpSession>();

function cleanupExpiredLoginOtpSessions() {
  const now = Date.now();

  loginOtpSessions.forEach((session, sessionId) => {
    if (session.expiresAt <= now) {
      loginOtpSessions.delete(sessionId);
    }
  });
}

function createLoginOtp() {
  return crypto
    .randomInt(10 ** (loginOtpLength - 1), 10 ** loginOtpLength)
    .toString();
}

function hashLoginOtp(otp: string) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

function timingSafeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function sendLoginOtpEmail({
  email,
  otp,
}: {
  email: string;
  otp: string;
}) {
  if (!isEmailConfigured()) {
    return "not_configured";
  }

  const emailResult = await sendTransactionalEmail({
    to: email,
    subject: "Your SplitVerse login code",
    text: `Your SplitVerse login code is ${otp}. It expires in 10 minutes. If you did not try to sign in, you can ignore this email.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0b0d;">
        <h1 style="font-size:24px;margin:0 0 12px;">SplitVerse login code</h1>

        <p style="font-size:15px;line-height:1.5;margin:0 0 18px;">
          Use this code to finish signing in to SplitVerse. It expires in 10 minutes.
        </p>

        <div style="display:inline-block;padding:14px 18px;border-radius:14px;background:#f7f7f7;border:1px solid #dee1e6;font-size:28px;font-weight:800;letter-spacing:8px;">
          ${otp}
        </div>

        <p style="font-size:13px;line-height:1.5;margin:18px 0 0;color:#5b616e;">
          If you did not try to sign in, you can ignore this email.
        </p>
      </div>
    `,
  });

  if (!emailResult.ok) {
    console.error("Login OTP email failed through Brevo SMTP:", emailResult);
    return emailResult.reason;
  }

  return "sent";
}

router.post(
  "/email-login-otp/request",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      cleanupExpiredLoginOtpSessions();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      if (firebaseUser.firebase?.sign_in_provider !== "password") {
        return res.status(400).json({
          message: "OTP login is only available for email and password sign-in",
        });
      }

      if (!firebaseUser.email) {
        return res.status(400).json({
          message: "Firebase user email is missing",
        });
      }

      const otp = createLoginOtp();
      const emailStatus = await sendLoginOtpEmail({
        email: firebaseUser.email,
        otp,
      });

      if (emailStatus !== "sent") {
        return res.status(503).json({
          message:
            emailStatus === "not_configured"
              ? "Email OTP delivery is not configured. Add Brevo SMTP settings in server/.env."
              : "Could not send the login OTP email. Please try again.",
        });
      }

      const sessionId = crypto.randomUUID();
      const expiresAt = Date.now() + loginOtpExpiryMs;

      loginOtpSessions.set(sessionId, {
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email,
        otpHash: hashLoginOtp(otp),
        expiresAt,
        attempts: 0,
      });

      return res.status(201).json({
        sessionId,
        email: firebaseUser.email,
        expiresAt: new Date(expiresAt).toISOString(),
      });
    } catch (error) {
      console.error("Request login OTP failed:", error);

      return res.status(500).json({
        message: "Failed to request login OTP",
      });
    }
  },
);

router.post("/email-login-otp/verify", (req, res) => {
  cleanupExpiredLoginOtpSessions();

  const sessionId = String(req.body?.sessionId ?? "");
  const otp = String(req.body?.otp ?? "").replace(/\D/g, "");

  if (!sessionId || otp.length !== loginOtpLength) {
    return res.status(400).json({
      message: "Enter the 6-digit login code",
    });
  }

  const session = loginOtpSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      message: "Login code expired. Please request a new code.",
    });
  }

  if (session.attempts >= maxLoginOtpAttempts) {
    loginOtpSessions.delete(sessionId);

    return res.status(429).json({
      message: "Too many incorrect codes. Please request a new code.",
    });
  }

  const matches = timingSafeEqualHex(hashLoginOtp(otp), session.otpHash);

  if (!matches) {
    session.attempts += 1;

    return res.status(401).json({
      message: "Incorrect login code",
    });
  }

  loginOtpSessions.delete(sessionId);

  return res.json({
    verified: true,
  });
});

router.post(
  "/sync-user",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const firebaseUid = firebaseUser.uid;
      const email = firebaseUser.email;

      if (!email) {
        return res.status(400).json({
          message: "Firebase user email is missing",
        });
      }

      const name = firebaseUser.name || email.split("@")[0];
      const photoUrl = firebaseUser.picture || null;
      const provider = firebaseUser.firebase?.sign_in_provider || "unknown";

      const result = await db.query(
        `
      INSERT INTO users (
        firebase_uid,
        name,
        email,
        photo_url,
        provider
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (firebase_uid)
      DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        photo_url = EXCLUDED.photo_url,
        provider = EXCLUDED.provider,
        updated_at = NOW()
      RETURNING *;
      `,
        [firebaseUid, name, email, photoUrl, provider],
      );

      return res.json({
        message: "User synced successfully",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Sync user failed:", error);

      return res.status(500).json({
        message: "Failed to sync user",
      });
    }
  },
);

router.get("/me", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const result = await db.query(
      `
      SELECT
        id,
        firebase_uid,
        name,
        email,
        photo_url,
        provider,
        created_at,
        updated_at
      FROM users
      WHERE firebase_uid = $1;
      `,
      [firebaseUser.uid],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found in database",
      });
    }

    return res.json({
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Get current user failed:", error);

    return res.status(500).json({
      message: "Failed to get current user",
    });
  }
});

router.delete(
  "/account",
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

      if (req.body?.confirmationText !== deleteAccountConfirmationText) {
        return res.status(400).json({
          message: `Type ${deleteAccountConfirmationText} to delete your account`,
        });
      }

      const userResult = await client.query(
        `
      SELECT id, email
      FROM users
      WHERE firebase_uid = $1;
      `,
        [firebaseUser.uid],
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          message: "User not found in database",
        });
      }

      const dbUserId = userResult.rows[0].id;
      const dbUserEmail = userResult.rows[0].email;

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
        [dbUserId],
      );
      const walletBalance = Number(balanceResult.rows[0].wallet_balance);

      if (Math.abs(walletBalance) > 0.0001) {
        return res.status(409).json({
          message:
            "Withdraw or settle your wallet balance before deleting your account",
        });
      }

      const pendingDuesResult = await client.query(
        `
      SELECT
        COALESCE(SUM(amount), 0)::float AS pending_dues
      FROM split_room_items item
      INNER JOIN split_room_members member
        ON member.id = item.assigned_member_id
      INNER JOIN split_rooms room
        ON room.id = item.room_id
      WHERE item.collected_at IS NULL
      AND (
        member.user_id = $1
        OR LOWER(COALESCE(member.email, '')) = LOWER($2)
        OR (
          room.owner_user_id = $1
          AND NOT (
            member.user_id = $1
            OR LOWER(COALESCE(member.email, '')) = LOWER($2)
          )
        )
      );
      `,
        [dbUserId, dbUserEmail],
      );
      const pendingDues = Number(pendingDuesResult.rows[0].pending_dues);

      const pendingSettlementsResult = await client.query(
        `
      SELECT COUNT(*)::int AS pending_settlement_count
      FROM settlements
      WHERE status = 'pending'
      AND (from_user_id = $1 OR to_user_id = $1);
      `,
        [dbUserId],
      );
      const pendingSettlementCount = Number(
        pendingSettlementsResult.rows[0].pending_settlement_count,
      );

      if (pendingDues > 0 || pendingSettlementCount > 0) {
        return res.status(409).json({
          message: "Clear all pending dues before deleting your account",
        });
      }

      await client.query("BEGIN");

      await client.query(
        `
      DELETE FROM friend_requests
      WHERE LOWER(recipient_email) = LOWER($1);
      `,
        [dbUserEmail],
      );

      await client.query(
        `
      DELETE FROM split_room_members
      WHERE user_id = $1
      OR LOWER(COALESCE(email, '')) = LOWER($2);
      `,
        [dbUserId, dbUserEmail],
      );

      await client.query(
        `
      DELETE FROM users
      WHERE id = $1;
      `,
        [dbUserId],
      );

      await client.query("COMMIT");

      await adminAuth.deleteUser(firebaseUser.uid);

      return res.json({
        message: "Account deleted successfully",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Delete account failed:", error);

      return res.status(500).json({
        message: "Failed to delete account",
      });
    } finally {
      client.release();
    }
  },
);

export default router;
