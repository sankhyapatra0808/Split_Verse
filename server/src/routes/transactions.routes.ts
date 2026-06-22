import express from "express";
import { db } from "../config/db.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";

const router = express.Router();
const visibleTransactionLimit = 10;
const maxExportTransactionLimit = 5000;

function getPositiveInt(value: unknown, fallback: number, max: number) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(numericValue), max);
}

router.get("/", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const search = String(req.query.search || "")
      .trim()
      .toLowerCase();
    const status = String(req.query.status || "all")
      .trim()
      .toLowerCase();
    const exportMode = String(req.query.exportMode || "count")
      .trim()
      .toLowerCase();
    const isYearExport = exportMode === "year";
    const limit = isYearExport
      ? maxExportTransactionLimit
      : getPositiveInt(
          req.query.limit,
          visibleTransactionLimit,
          maxExportTransactionLimit,
        );

    const userResult = await db.query(
      `
      SELECT id, created_at
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
    const userCreatedAt = userResult.rows[0].created_at;
    const accountCreatedAt = new Date(userCreatedAt);
    const accountYear = Number.isNaN(accountCreatedAt.getTime())
      ? new Date().getFullYear()
      : accountCreatedAt.getFullYear();
    const currentYear = new Date().getFullYear();
    const requestedYear = Number(req.query.year);
    const selectedYear = isYearExport
      ? Math.min(
          Math.max(
            Number.isInteger(requestedYear) ? requestedYear : currentYear,
            accountYear,
          ),
          currentYear,
        )
      : null;

    const result = await db.query(
      `
      WITH combined_transactions AS (
        SELECT
          'expense-' || expenses.id::text AS id,
          expenses.title AS title,
          COALESCE(expenses.category, 'Personal expense') AS room,
          (-expenses.amount)::float AS signed_amount,
          expenses.amount::float AS amount,
          'paid' AS status,
          'Paid' AS display_status,
          'expense' AS type,
          expenses.created_at AS created_at
        FROM expenses
        WHERE expenses.user_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM split_room_items item
          INNER JOIN split_rooms room
            ON room.id = item.room_id
          INNER JOIN wallet_transactions wallet
            ON wallet.user_id = expenses.user_id
            AND wallet.type = 'debit'
            AND wallet.amount = expenses.amount
            AND wallet.description = 'Paid ' || item.title || ' in ' || room.name
            AND ABS(EXTRACT(EPOCH FROM (wallet.created_at - expenses.created_at))) < 60
          WHERE item.expense_id = expenses.id
        )

        UNION ALL

        SELECT
          'wallet-' || wallet_transactions.id::text AS id,
          COALESCE(wallet_transactions.description, 'Wallet transaction') AS title,
          'Wallet' AS room,
          CASE
            WHEN wallet_transactions.type = 'credit'
              THEN wallet_transactions.amount::float
            ELSE (-wallet_transactions.amount)::float
          END AS signed_amount,
          wallet_transactions.amount::float AS amount,
          CASE
            WHEN wallet_transactions.type = 'credit'
              THEN 'added'
            ELSE 'paid'
          END AS status,
          CASE
            WHEN wallet_transactions.type = 'credit'
              THEN 'Added'
            ELSE 'Paid'
          END AS display_status,
          'wallet' AS type,
          wallet_transactions.created_at AS created_at
        FROM wallet_transactions
        WHERE wallet_transactions.user_id = $1

        UNION ALL

        SELECT
          'settlement-out-' || settlements.id::text AS id,
          'Settlement payment' AS title,
          'Settlement' AS room,
          (-settlements.amount)::float AS signed_amount,
          settlements.amount::float AS amount,
          settlements.status AS status,
          INITCAP(settlements.status) AS display_status,
          'settlement' AS type,
          settlements.created_at AS created_at
        FROM settlements
        WHERE settlements.from_user_id = $1

        UNION ALL

        SELECT
          'settlement-in-' || settlements.id::text AS id,
          'Settlement receivable' AS title,
          'Settlement' AS room,
          settlements.amount::float AS signed_amount,
          settlements.amount::float AS amount,
          CASE
            WHEN settlements.status = 'paid'
              THEN 'received'
            ELSE settlements.status
          END AS status,
          CASE
            WHEN settlements.status = 'paid'
              THEN 'Received'
            ELSE INITCAP(settlements.status)
          END AS display_status,
          'settlement' AS type,
          settlements.created_at AS created_at
        FROM settlements
        WHERE settlements.to_user_id = $1
      ),

      filtered_transactions AS (
        SELECT *
        FROM combined_transactions
        WHERE
          ($2 = '' OR LOWER(title) LIKE '%' || $2 || '%' OR LOWER(room) LIKE '%' || $2 || '%')
          AND ($3 = 'all' OR status = $3)
          AND (
            $4::int IS NULL
            OR EXTRACT(YEAR FROM (created_at + INTERVAL '5 hours 30 minutes'))::int = $4::int
          )
      ),

      selected_transactions AS (
        SELECT *
        FROM filtered_transactions
        ORDER BY created_at DESC
        LIMIT $5
      ),

      transaction_summary AS (
        SELECT
          (SELECT COUNT(*)::int FROM filtered_transactions) AS total_count,
          (SELECT COUNT(*)::int FROM combined_transactions) AS all_transaction_count
      )

      SELECT
        selected_transactions.*,
        CASE
          WHEN selected_transactions.created_at IS NULL THEN NULL
          ELSE TO_CHAR(
            selected_transactions.created_at + INTERVAL '5 hours 30 minutes',
            'DD-MM-YYYY'
          )
        END AS display_date,
        transaction_summary.total_count,
        transaction_summary.all_transaction_count
      FROM transaction_summary
      LEFT JOIN selected_transactions ON true
      ORDER BY selected_transactions.created_at DESC NULLS LAST;
      `,
      [dbUserId, search, status, selectedYear, limit],
    );

    const transactions = result.rows
      .filter((row) => row.id)
      .map((row) => ({
        id: row.id,
        title: row.title,
        room: row.room,
        amount: Number(row.signed_amount),
        status: row.status,
        displayStatus: row.display_status,
        type: row.type,
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : row.created_at,
        displayDate: row.display_date,
      }));

    const netMovement = transactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0,
    );

    return res.json({
      transactions,
      summary: {
        netMovement,
        count: Number(result.rows[0]?.total_count ?? 0),
        totalTillDate: Number(result.rows[0]?.all_transaction_count ?? 0),
        visibleCount: transactions.length,
        accountCreatedAt: userCreatedAt,
      },
    });
  } catch (error) {
    console.error("Get transactions failed:", error);

    return res.status(500).json({
      message: "Failed to load transactions",
    });
  }
});

export default router;
