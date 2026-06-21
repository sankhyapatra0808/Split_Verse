import express from "express";
import { db } from "../config/db.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";
import { sendLiveUpdate } from "../liveEvents.js";

const router = express.Router();
const topUpMethods = new Set(["UPI", "Card", "Net banking"]);
const topUpDescriptionPrefix = "Wallet top-up via ";
const maxTopUpPerTransaction = 10000;
const maxTopUpPerDay = 100000;

async function getDbUserId(firebaseUid: string) {
  const userResult = await db.query(
    `
    SELECT id
    FROM users
    WHERE firebase_uid = $1;
    `,
    [firebaseUid]
  );

  return userResult.rows[0]?.id ?? null;
}

function getTopUpMethod(description: string | null) {
  if (description?.startsWith(topUpDescriptionPrefix)) {
    return description.slice(topUpDescriptionPrefix.length);
  }

  return "Wallet";
}

router.get("/top-ups", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const dbUserId = await getDbUserId(firebaseUser.uid);

    if (!dbUserId) {
      return res.status(404).json({
        message: "User not found in database",
      });
    }

    const topUpsResult = await db.query(
      `
      SELECT
        id,
        amount::float,
        description,
        created_at
      FROM wallet_transactions
      WHERE user_id = $1
      AND type = 'credit'
      AND (
        description IS NULL
        OR description LIKE 'Wallet top-up%'
      )
      ORDER BY created_at DESC
      LIMIT 3;
      `,
      [dbUserId]
    );

    return res.json({
      topUps: topUpsResult.rows.map((topUp) => ({
        id: topUp.id,
        amount: Number(topUp.amount),
        method: getTopUpMethod(topUp.description),
        createdAt: topUp.created_at,
      })),
    });
  } catch (error) {
    console.error("Get wallet top-ups failed:", error);

    return res.status(500).json({
      message: "Failed to load wallet top-ups",
    });
  }
});

router.post("/top-up", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const { amount, method } = req.body;

    const numericAmount = Number(amount);
    const paymentMethod =
      typeof method === "string" && topUpMethods.has(method) ? method : null;

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        message: "Top-up amount must be greater than 0",
      });
    }

    if (numericAmount > maxTopUpPerTransaction) {
      return res.status(400).json({
        message: "Wallet top-up cannot exceed Rs. 10,000 per transaction",
      });
    }

    if (method && !paymentMethod) {
      return res.status(400).json({
        message: "Unsupported top-up method",
      });
    }

    const dbUserId = await getDbUserId(firebaseUser.uid);

    if (!dbUserId) {
      return res.status(404).json({
        message: "User not found in database",
      });
    }

    const topUpTodayResult = await db.query(
      `
      SELECT COALESCE(SUM(amount), 0)::float AS top_up_total
      FROM wallet_transactions
      WHERE user_id = $1
      AND type = 'credit'
      AND (
        description IS NULL
        OR description LIKE 'Wallet top-up%'
      )
      AND created_at::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
      `,
      [dbUserId],
    );
    const topUpToday = Number(topUpTodayResult.rows[0].top_up_total);

    if (topUpToday + numericAmount > maxTopUpPerDay) {
      return res.status(429).json({
        message: "Wallet top-up limit is Rs. 100,000 per day",
      });
    }

    const transactionResult = await db.query(
      `
      INSERT INTO wallet_transactions (
        user_id,
        type,
        amount,
        description
      )
      VALUES ($1, 'credit', $2, $3)
      RETURNING
        id,
        type,
        amount::float,
        description,
        created_at;
      `,
      [
        dbUserId,
        numericAmount,
        `Wallet top-up${paymentMethod ? ` via ${paymentMethod}` : ""}`,
      ]
    );

    const balanceResult = await db.query(
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
      [dbUserId]
    );

    sendLiveUpdate([dbUserId], {
      type: "money",
      reason: "wallet-top-up",
    });

    return res.status(201).json({
      message: "Wallet topped up successfully",
      transaction: transactionResult.rows[0],
      walletBalance: Number(balanceResult.rows[0].wallet_balance),
    });
  } catch (error) {
    console.error("Wallet top-up failed:", error);

    return res.status(500).json({
      message: "Failed to top up wallet",
    });
  }
});


router.get("/summary", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const userResult = await db.query(
      `
      SELECT id
      FROM users
      WHERE firebase_uid = $1;
      `,
      [firebaseUser.uid]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        message: "User not found in database",
      });
    }

    const dbUserId = userResult.rows[0].id;

    const balanceResult = await db.query(
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
        ) AS available_balance
      FROM wallet_transactions
      WHERE user_id = $1;
      `,
      [dbUserId]
    );

    const settlementResult = await db.query(
      `
      SELECT
        COALESCE((
          SELECT SUM(amount)::float
          FROM settlements
          WHERE to_user_id = $1
          AND status = 'pending'
        ), 0) AS pending_incoming,

        COALESCE((
          SELECT SUM(amount)::float
          FROM settlements
          WHERE from_user_id = $1
          AND status = 'pending'
        ), 0) AS pending_outgoing;
      `,
      [dbUserId]
    );

    const recentWalletResult = await db.query(
      `
      SELECT
        id,
        type,
        amount::float,
        description,
        created_at
      FROM wallet_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 3;
      `,
      [dbUserId]
    );

    const pendingSettlementResult = await db.query(
      `
      SELECT
        settlements.id,
        settlements.amount::float,
        settlements.status,
        settlements.created_at,
        from_user.name AS from_name,
        from_user.email AS from_email,
        to_user.name AS to_name,
        to_user.email AS to_email,
        CASE
          WHEN settlements.from_user_id = $1 THEN 'outgoing'
          ELSE 'incoming'
        END AS direction
      FROM settlements
      JOIN users AS from_user ON from_user.id = settlements.from_user_id
      JOIN users AS to_user ON to_user.id = settlements.to_user_id
      WHERE
        (settlements.from_user_id = $1 OR settlements.to_user_id = $1)
        AND settlements.status = 'pending'
      ORDER BY settlements.created_at DESC
      LIMIT 8;
      `,
      [dbUserId]
    );

    const availableBalance = Number(balanceResult.rows[0].available_balance);
    const pendingIncoming = Number(settlementResult.rows[0].pending_incoming);
    const pendingOutgoing = Number(settlementResult.rows[0].pending_outgoing);

    return res.json({
      summary: {
        availableBalance,
        pendingIncoming,
        pendingOutgoing,
        netPosition: availableBalance + pendingIncoming - pendingOutgoing,
      },

      recentWalletTransactions: recentWalletResult.rows.map((row) => ({
        id: row.id,
        type: row.type,
        amount: Number(row.amount),
        description: row.description,
        createdAt: row.created_at,
      })),

      pendingSettlements: pendingSettlementResult.rows.map((row) => ({
        id: row.id,
        amount: Number(row.amount),
        status: row.status,
        direction: row.direction,
        fromName: row.from_name,
        fromEmail: row.from_email,
        toName: row.to_name,
        toEmail: row.to_email,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("Wallet summary failed:", error);

    return res.status(500).json({
      message: "Failed to load wallet summary",
    });
  }
});

export default router;
