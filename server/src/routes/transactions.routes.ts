import express from "express";
import { db } from "../config/db.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";

const router = express.Router();

router.get("/", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const search = String(req.query.search || "").trim().toLowerCase();
    const status = String(req.query.status || "all").trim().toLowerCase();

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
      )

      SELECT *
      FROM combined_transactions
      WHERE
        ($2 = '' OR LOWER(title) LIKE '%' || $2 || '%' OR LOWER(room) LIKE '%' || $2 || '%')
        AND ($3 = 'all' OR status = $3)
      ORDER BY created_at DESC
      LIMIT 100;
      `,
      [dbUserId, search, status]
    );

    const transactions = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      room: row.room,
      amount: Number(row.signed_amount),
      status: row.status,
      displayStatus: row.display_status,
      type: row.type,
      createdAt: row.created_at,
    }));

    const netMovement = transactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0
    );

    return res.json({
      transactions,
      summary: {
        netMovement,
        count: transactions.length,
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