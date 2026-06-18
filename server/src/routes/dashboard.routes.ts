import express from "express";
import { db } from "../config/db.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";

const router = express.Router();

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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
      SELECT id, name
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
    const userName = userResult.rows[0].name || "You";

    const summaryResult = await db.query(
      `
      SELECT
        COALESCE((
          SELECT SUM(amount)::float
          FROM expenses
          WHERE user_id = $1
          AND expense_date = CURRENT_DATE
        ), 0) AS today_expense,

        COALESCE((
          SELECT SUM(amount)::float
          FROM settlements
          WHERE from_user_id = $1
          AND status = 'pending'
        ), 0) AS pending_payment,

        COALESCE((
          SELECT SUM(amount)::float
          FROM settlements
          WHERE to_user_id = $1
          AND status = 'pending'
        ), 0) AS receivable,

        COALESCE((
          SELECT
            SUM(
              CASE
                WHEN type = 'credit' THEN amount
                WHEN type = 'debit' THEN -amount
                ELSE 0
              END
            )::float
          FROM wallet_transactions
          WHERE user_id = $1
        ), 0) AS wallet_balance;
      `,
      [dbUserId]
    );

    const summary = summaryResult.rows[0];

    const todayExpense = Number(summary.today_expense);
    const pendingPayment = Number(summary.pending_payment);
    const receivable = Number(summary.receivable);
    const walletBalance = Number(summary.wallet_balance);

    const categoryResult = await db.query(
      `
      SELECT
        COALESCE(category, 'Other') AS label,
        SUM(amount)::float AS amount
      FROM expenses
      WHERE user_id = $1
      AND expense_date = CURRENT_DATE
      GROUP BY COALESCE(category, 'Other')
      ORDER BY amount DESC;
      `,
      [dbUserId]
    );

    const expenseCategories = categoryResult.rows.map((row) => {
      const amount = Number(row.amount);

      return {
        label: row.label,
        amount,
        value: todayExpense > 0 ? Math.round((amount / todayExpense) * 100) : 0,
      };
    });

    const monthlyResult = await db.query(
      `
      SELECT
        EXTRACT(MONTH FROM expense_date)::int AS month,
        SUM(amount)::float AS amount
      FROM expenses
      WHERE user_id = $1
      AND EXTRACT(YEAR FROM expense_date) = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY EXTRACT(MONTH FROM expense_date)
      ORDER BY month;
      `,
      [dbUserId]
    );

    const monthlyAmounts = Array.from({ length: 12 }, (_, index) => {
      const monthNumber = index + 1;
      const found = monthlyResult.rows.find(
        (row) => Number(row.month) === monthNumber
      );

      return found ? Number(found.amount) : 0;
    });

    const maxMonthlyAmount = Math.max(...monthlyAmounts, 1);
    const graphTotal = monthlyAmounts.reduce((sum, amount) => sum + amount, 0);

    const monthSpend = monthlyAmounts.map((amount, index) => ({
      label: monthLabels[index],
      amount,
      value: Math.round((amount / maxMonthlyAmount) * 100),
    }));

    return res.json({
      metrics: {
        todayExpense,
        pendingPayment,
        todaySavings: 0,
        walletBalance,
      },

      expenseTracker: {
        totalSpentToday: todayExpense,
        categories: expenseCategories,
      },

      walletHealth: {
        availableBalance: walletBalance,
        receivable,
      },

      monthlySpend: {
        graphTotal,
        months: monthSpend,
      },

      ranking: {
        title: "Level 1 Saver",
        rankText: "#1",
        subtitle: "among your active rooms today",
        rows: [
          {
            rank: "01",
            name: "You",
            saved: 0,
            active: true,
          },
        ],
      },
    });
  } catch (error) {
    console.error("Dashboard summary failed:", error);

    return res.status(500).json({
      message: "Failed to load dashboard summary",
    });
  }
});

export default router;