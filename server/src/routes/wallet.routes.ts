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
    [firebaseUid],
  );

  return userResult.rows[0]?.id ?? null;
}

function toIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return new Date(String(value)).toISOString();
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
        created_at,
        TO_CHAR(
          created_at + INTERVAL '5 hours 30 minutes',
          'DD-MM-YYYY'
        ) AS display_date
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
      [dbUserId],
    );

    return res.json({
      topUps: topUpsResult.rows.map((topUp) => ({
        id: topUp.id,
        amount: Number(topUp.amount),
        method: getTopUpMethod(topUp.description),
        createdAt: toIsoString(topUp.created_at),
        displayDate: topUp.display_date,
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
      ],
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
      [dbUserId],
    );

    sendLiveUpdate([dbUserId], {
      type: "money",
      reason: "wallet-top-up",
    });

    return res.status(201).json({
      message: "Wallet topped up successfully",
      transaction: {
        ...transactionResult.rows[0],
        created_at: toIsoString(transactionResult.rows[0].created_at),
      },
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

    const dbUserId = await getDbUserId(firebaseUser.uid);

    if (!dbUserId) {
      return res.status(404).json({
        message: "User not found in database",
      });
    }

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
      [dbUserId],
    );

    const splitDuesSummaryResult = await db.query(
      `
      SELECT
        COALESCE((
          SELECT SUM(item.amount)::float
          FROM split_room_items item
          INNER JOIN split_room_members member
            ON member.id = item.assigned_member_id
          INNER JOIN split_rooms room
            ON room.id = item.room_id
          WHERE room.owner_user_id = $1
          AND member.user_id <> $1
          AND item.collected_at IS NULL
        ), 0) AS pending_incoming,

        COALESCE((
          SELECT SUM(item.amount)::float
          FROM split_room_items item
          INNER JOIN split_room_members member
            ON member.id = item.assigned_member_id
          INNER JOIN split_rooms room
            ON room.id = item.room_id
          WHERE member.user_id = $1
          AND room.owner_user_id <> $1
          AND item.collected_at IS NULL
        ), 0) AS pending_outgoing;
      `,
      [dbUserId],
    );

    const recentWalletResult = await db.query(
      `
      SELECT
        id,
        type,
        amount::float,
        description,
        created_at,
        TO_CHAR(
          created_at + INTERVAL '5 hours 30 minutes',
          'DD-MM-YYYY'
        ) AS display_date
      FROM wallet_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 8;
      `,
      [dbUserId],
    );

    const pendingSettlementResult = await db.query(
      `
      SELECT
        item.id,
        item.amount::float,
        item.created_at,
        TO_CHAR(
          item.created_at + INTERVAL '5 hours 30 minutes',
          'DD-MM-YYYY'
        ) AS display_date,
        item.title,
        room.name AS room_name,

        owner_user.name AS owner_name,
        owner_user.email AS owner_email,

        assigned_user.name AS assigned_name,
        assigned_user.email AS assigned_email,

        CASE
          WHEN room.owner_user_id = $1 THEN 'incoming'
          ELSE 'outgoing'
        END AS direction
      FROM split_room_items item
      INNER JOIN split_room_members member
        ON member.id = item.assigned_member_id
      INNER JOIN split_rooms room
        ON room.id = item.room_id
      INNER JOIN users AS owner_user
        ON owner_user.id = room.owner_user_id
      LEFT JOIN users AS assigned_user
        ON assigned_user.id = member.user_id
      WHERE
        (
          room.owner_user_id = $1
          OR member.user_id = $1
        )
        AND room.owner_user_id <> COALESCE(member.user_id, room.owner_user_id)
        AND item.collected_at IS NULL
      ORDER BY item.created_at DESC
      LIMIT 8;
      `,
      [dbUserId],
    );

    const availableBalance = Number(balanceResult.rows[0].available_balance);
    const pendingIncoming = Number(
      splitDuesSummaryResult.rows[0].pending_incoming,
    );
    const pendingOutgoing = Number(
      splitDuesSummaryResult.rows[0].pending_outgoing,
    );

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
        createdAt: toIsoString(row.created_at),
        displayDate: row.display_date,
      })),

      pendingSettlements: pendingSettlementResult.rows.map((row) => ({
        id: row.id,
        amount: Number(row.amount),
        status: "pending",
        direction: row.direction,
        title: row.title,
        roomName: row.room_name,
        fromName:
          row.direction === "incoming" ? row.assigned_name : row.owner_name,
        fromEmail:
          row.direction === "incoming" ? row.assigned_email : row.owner_email,
        toName:
          row.direction === "incoming" ? row.owner_name : row.assigned_name,
        toEmail:
          row.direction === "incoming" ? row.owner_email : row.assigned_email,
        createdAt: toIsoString(row.created_at),
        displayDate: row.display_date,
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
