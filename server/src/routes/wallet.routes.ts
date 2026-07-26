import express from "express";
import { z } from "zod";
import { db } from "../config/db.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";
import { sendLiveUpdate } from "../liveEvents.js";
import {
  moneyAmountSchema,
  parseRequestBody,
  sendValidationError,
} from "../middleware/validateRequest.js";

const router = express.Router();
const topUpMethodValues = ["UPI", "Card", "Net banking"] as const;
const topUpDescriptionPrefix = "Wallet top-up via ";
const maxTopUpPerTransaction = Number(
  process.env.MAX_TOP_UP_PER_TRANSACTION || 10000,
);
const maxTopUpPerDay = Number(process.env.MAX_TOP_UP_PER_DAY || 100000);
const devWalletTopUpEnabled =
  process.env.NODE_ENV !== "production" &&
  process.env.ENABLE_DEV_WALLET_TOP_UP !== "false";

const topUpSchema = z
  .object({
    amount: moneyAmountSchema(maxTopUpPerTransaction),
    method: z.enum(topUpMethodValues).optional(),
  })
  .strict();

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
  const client = await db.connect();

  try {
    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    if (!devWalletTopUpEnabled) {
      return res.status(404).json({ message: "Not found" });
    }

    const { amount: numericAmount, method } = parseRequestBody(
      topUpSchema,
      req.body,
    );
    const paymentMethod = method ?? null;

    await client.query("BEGIN");

    const userResult = await client.query(
      `
      SELECT id
      FROM users
      WHERE firebase_uid = $1
      FOR UPDATE;
      `,
      [firebaseUser.uid],
    );

    const dbUserId = userResult.rows[0]?.id ?? null;

    if (!dbUserId) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "User not found in database",
      });
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text));", [
      dbUserId,
    ]);

    const topUpTodayResult = await client.query(
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
      await client.query("ROLLBACK");

      return res.status(429).json({
        message: `Wallet top-up limit is Rs. ${maxTopUpPerDay.toLocaleString("en-IN")} per day`,
      });
    }

    const transactionResult = await client.query(
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

    await client.query("COMMIT");

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
    await client.query("ROLLBACK").catch(() => undefined);

    if (sendValidationError(res, error)) {
      return;
    }

    console.error("Wallet top-up failed:", error);

    return res.status(500).json({
      message: "Failed to top up wallet",
    });
  } finally {
    client.release();
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

    const adjustedSettlementResult = await db.query(
      `
      WITH settled AS (
        SELECT
          item_id,
          COALESCE(SUM(amount)::float, 0) AS settled_amount
        FROM split_room_item_settlements
        GROUP BY item_id
      ),
      debt_lines AS (
        SELECT
          item.id AS item_id,
          item.title,
          room.name AS room_name,
          item.created_at,
          GREATEST(
            item.amount::float - COALESCE(settled.settled_amount, 0),
            0
          ) AS pending_amount,
          debtor_user.id AS debtor_user_id,
          paid_by_user.id AS creditor_user_id
        FROM split_room_items item
        INNER JOIN split_room_members member
          ON member.id = item.assigned_member_id
        INNER JOIN split_rooms room
          ON room.id = item.room_id
        INNER JOIN users AS paid_by_user
          ON paid_by_user.id = COALESCE(room.paid_by_user_id, room.owner_user_id)
        LEFT JOIN users AS member_user
          ON member_user.id = member.user_id
        LEFT JOIN users AS email_user
          ON member.user_id IS NULL
          AND member.email IS NOT NULL
          AND LOWER(email_user.email) = LOWER(member.email)
        INNER JOIN users AS debtor_user
          ON debtor_user.id = COALESCE(member_user.id, email_user.id)
        LEFT JOIN settled
          ON settled.item_id = item.id
        WHERE item.collected_at IS NULL
        AND COALESCE(room.paid_by_user_id, room.owner_user_id) <> debtor_user.id
        AND (
          COALESCE(room.paid_by_user_id, room.owner_user_id) = $1
          OR debtor_user.id = $1
        )
      ),
      pair_lines AS (
        SELECT
          CASE
            WHEN debtor_user_id < creditor_user_id THEN debtor_user_id
            ELSE creditor_user_id
          END AS user_a,
          CASE
            WHEN debtor_user_id < creditor_user_id THEN creditor_user_id
            ELSE debtor_user_id
          END AS user_b,
          CASE
            WHEN debtor_user_id < creditor_user_id THEN pending_amount
            ELSE -pending_amount
          END AS signed_amount,
          item_id,
          title,
          room_name,
          created_at
        FROM debt_lines
        WHERE pending_amount > 0
      ),
      pair_totals AS (
        SELECT
          user_a,
          user_b,
          SUM(signed_amount)::float AS net_amount,
          MAX(created_at) AS created_at,
          COUNT(*) AS item_count,
          CASE
            WHEN COUNT(DISTINCT room_name) = 1 THEN MIN(room_name)
            ELSE 'Multiple rooms'
          END AS room_name,
          CASE
            WHEN COUNT(*) = 1 THEN MIN(title)
            ELSE COUNT(*)::text || ' adjusted split items'
          END AS title
        FROM pair_lines
        GROUP BY user_a, user_b
      ),
      net_rows AS (
        SELECT
          CONCAT('net-', user_a, '-', user_b) AS id,
          CASE WHEN net_amount > 0 THEN user_a ELSE user_b END AS from_user_id,
          CASE WHEN net_amount > 0 THEN user_b ELSE user_a END AS to_user_id,
          ABS(net_amount)::float AS amount,
          title,
          room_name,
          created_at
        FROM pair_totals
        WHERE ABS(net_amount) >= 0.01
      )
      SELECT
        net_rows.id,
        net_rows.amount,
        net_rows.created_at,
        TO_CHAR(
          net_rows.created_at + INTERVAL '5 hours 30 minutes',
          'DD-MM-YYYY'
        ) AS display_date,
        net_rows.title,
        net_rows.room_name,
        from_user.name AS from_name,
        from_user.email AS from_email,
        to_user.name AS to_name,
        to_user.email AS to_email,
        CASE
          WHEN net_rows.from_user_id = $1 THEN 'outgoing'
          ELSE 'incoming'
        END AS direction
      FROM net_rows
      INNER JOIN users AS from_user
        ON from_user.id = net_rows.from_user_id
      INNER JOIN users AS to_user
        ON to_user.id = net_rows.to_user_id
      ORDER BY net_rows.created_at DESC;
      `,
      [dbUserId],
    );

    const availableBalance = Number(balanceResult.rows[0].available_balance);
    const pendingIncoming = adjustedSettlementResult.rows.reduce(
      (total, row) =>
        row.direction === "incoming" ? total + Number(row.amount) : total,
      0,
    );
    const pendingOutgoing = adjustedSettlementResult.rows.reduce(
      (total, row) =>
        row.direction === "outgoing" ? total + Number(row.amount) : total,
      0,
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

      pendingSettlements: adjustedSettlementResult.rows
        .slice(0, 8)
        .map((row) => ({
          id: row.id,
          amount: Number(row.amount),
          status: "pending",
          direction: row.direction,
          title: row.title,
          roomName: row.room_name,
          fromName: row.from_name,
          fromEmail: row.from_email,
          toName: row.to_name,
          toEmail: row.to_email,
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
