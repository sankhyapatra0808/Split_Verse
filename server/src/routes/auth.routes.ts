import express from "express";
import { db } from "../config/db.js";
import { adminAuth } from "../config/firebaseAdmin.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";

const router = express.Router();
const deleteAccountConfirmationText = "/DeleteAccount";

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

router.delete("/account", verifyFirebaseToken, async (req: AuthRequest, res) => {
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
});

export default router;
