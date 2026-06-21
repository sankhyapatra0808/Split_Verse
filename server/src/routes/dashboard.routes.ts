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

    const pendingSplitDuesResult = await db.query(
      `
      SELECT
        COALESCE(SUM(split_room_items.amount)::float, 0) AS pending_payment
      FROM split_room_items
      JOIN split_room_members
        ON split_room_members.id = split_room_items.assigned_member_id
      JOIN split_rooms
        ON split_rooms.id = split_room_items.room_id
      WHERE (
        split_room_members.user_id = $1
        OR LOWER(COALESCE(split_room_members.email, '')) = LOWER($2)
      )
      AND split_rooms.owner_user_id <> $1
      AND split_room_items.collected_at IS NULL;
      `,
      [dbUserId, dbUserEmail],
    );

    const receivableSplitDuesResult = await db.query(
      `
      SELECT
        COALESCE(SUM(split_room_items.amount)::float, 0) AS receivable
      FROM split_room_items
      JOIN split_room_members
        ON split_room_members.id = split_room_items.assigned_member_id
      JOIN split_rooms
        ON split_rooms.id = split_room_items.room_id
      WHERE split_rooms.owner_user_id = $1
      AND NOT (
        split_room_members.user_id = $1
        OR LOWER(COALESCE(split_room_members.email, '')) = LOWER($2)
      )
      AND split_room_items.collected_at IS NULL;
      `,
      [dbUserId, dbUserEmail],
    );

    const pendingSplitPayment = Number(
      pendingSplitDuesResult.rows[0].pending_payment,
    );

    const receivableSplitAmount = Number(
      receivableSplitDuesResult.rows[0].receivable,
    );

    const summaryResult = await db.query(
      `
      SELECT
        COALESCE((
          SELECT SUM(e.amount)::float
          FROM expenses e
          WHERE e.user_id = $1
          AND e.expense_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
          AND NOT (
            e.category = 'Shared room'
            AND EXISTS (
              SELECT 1
              FROM split_rooms room
              INNER JOIN split_room_items item
                ON item.room_id = room.id
              INNER JOIN split_room_members member
                ON member.id = item.assigned_member_id
              WHERE room.owner_user_id = $1
              AND e.title = room.name || ': ' || item.title
              AND e.amount = item.amount
              AND NOT (
                member.user_id = $1
                OR LOWER(COALESCE(member.email, '')) = LOWER($2)
              )
            )
          )
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
        ), 0) AS wallet_balance,

        EXTRACT(MONTH FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)::int AS current_month_number;
      `,
      [dbUserId, dbUserEmail],
    );

    const summary = summaryResult.rows[0];

    const todayExpense = Number(summary.today_expense);
    const walletBalance = Number(summary.wallet_balance);
    const currentMonthNumber = Number(summary.current_month_number);

    const timeSlotResult = await db.query(
      `
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM (e.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) >= 0
           AND EXTRACT(HOUR FROM (e.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) < 6
            THEN '12 AM - 6 AM'

          WHEN EXTRACT(HOUR FROM (e.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) >= 6
           AND EXTRACT(HOUR FROM (e.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) < 12
            THEN '6 AM - 12 PM'

          WHEN EXTRACT(HOUR FROM (e.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) >= 12
           AND EXTRACT(HOUR FROM (e.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) < 18
            THEN '12 PM - 6 PM'

          ELSE '6 PM - 12 AM'
        END AS label,

        SUM(e.amount)::float AS amount
      FROM expenses e
      WHERE e.user_id = $1
      AND e.expense_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      AND NOT (
        e.category = 'Shared room'
        AND EXISTS (
          SELECT 1
          FROM split_rooms room
          INNER JOIN split_room_items item
            ON item.room_id = room.id
          INNER JOIN split_room_members member
            ON member.id = item.assigned_member_id
          WHERE room.owner_user_id = $1
          AND e.title = room.name || ': ' || item.title
          AND e.amount = item.amount
          AND NOT (
            member.user_id = $1
            OR LOWER(COALESCE(member.email, '')) = LOWER($2)
          )
        )
      )
      GROUP BY label;
      `,
      [dbUserId, dbUserEmail],
    );

    const timeSlots = timeSlotResult.rows.map((row) => ({
      label: row.label,
      amount: Number(row.amount),
    }));

    const monthlyResult = await db.query(
      `
      SELECT
        EXTRACT(MONTH FROM e.expense_date)::int AS month,
        SUM(e.amount)::float AS amount
      FROM expenses e
      WHERE e.user_id = $1
      AND EXTRACT(YEAR FROM e.expense_date) = EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)
      AND NOT (
        e.category = 'Shared room'
        AND EXISTS (
          SELECT 1
          FROM split_rooms room
          INNER JOIN split_room_items item
            ON item.room_id = room.id
          INNER JOIN split_room_members member
            ON member.id = item.assigned_member_id
          WHERE room.owner_user_id = $1
          AND e.title = room.name || ': ' || item.title
          AND e.amount = item.amount
          AND NOT (
            member.user_id = $1
            OR LOWER(COALESCE(member.email, '')) = LOWER($2)
          )
        )
      )
      GROUP BY EXTRACT(MONTH FROM e.expense_date)
      ORDER BY month;
      `,
      [dbUserId, dbUserEmail],
    );

    const monthlyPeakResult = await db.query(
      `
      WITH daily_monthly_spend AS (
        SELECT
          EXTRACT(MONTH FROM e.expense_date)::int AS month,
          EXTRACT(DAY FROM e.expense_date)::int AS day,
          SUM(e.amount)::float AS amount
        FROM expenses e
        WHERE e.user_id = $1
        AND EXTRACT(YEAR FROM e.expense_date) = EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)
        AND NOT (
          e.category = 'Shared room'
          AND EXISTS (
            SELECT 1
            FROM split_rooms room
            INNER JOIN split_room_items item
              ON item.room_id = room.id
            INNER JOIN split_room_members member
              ON member.id = item.assigned_member_id
            WHERE room.owner_user_id = $1
            AND e.title = room.name || ': ' || item.title
            AND e.amount = item.amount
            AND NOT (
              member.user_id = $1
              OR LOWER(COALESCE(member.email, '')) = LOWER($2)
            )
          )
        )
        GROUP BY
          EXTRACT(MONTH FROM e.expense_date),
          EXTRACT(DAY FROM e.expense_date)
      ),
      ranked_days AS (
        SELECT
          month,
          day,
          ROW_NUMBER() OVER (
            PARTITION BY month
            ORDER BY amount DESC, day ASC
          ) AS day_rank
        FROM daily_monthly_spend
      )
      SELECT month, day AS peak_day
      FROM ranked_days
      WHERE day_rank = 1
      ORDER BY month;
      `,
      [dbUserId, dbUserEmail],
    );

    const monthlyAmounts = Array.from({ length: 12 }, (_, index) => {
      const monthNumber = index + 1;

      const found = monthlyResult.rows.find(
        (row) => Number(row.month) === monthNumber,
      );

      return found ? Number(found.amount) : 0;
    });

    const maxMonthlyAmount = Math.max(...monthlyAmounts, 1);
    const graphTotal = monthlyAmounts.reduce((sum, amount) => sum + amount, 0);
    const currentMonthIndex = Math.max(0, Math.min(11, currentMonthNumber - 1));
    const currentMonthTotal = monthlyAmounts[currentMonthIndex] ?? 0;
    const currentMonthLabel = monthLabels[currentMonthIndex] ?? "This month";
    const peakDaysByMonth = new Map(
      monthlyPeakResult.rows.map((row) => [
        Number(row.month),
        Number(row.peak_day),
      ]),
    );

    const months = monthlyAmounts.map((amount, index) => ({
      label: monthLabels[index],
      amount,
      value: Math.round((amount / maxMonthlyAmount) * 100),
      peakDay: peakDaysByMonth.get(index + 1),
    }));

    return res.json({
      metrics: {
        todayExpense,
        pendingPayment: pendingSplitPayment,
        walletBalance,
      },

      expenseTracker: {
        totalSpentToday: todayExpense,
        timeSlots,
      },

      walletHealth: {
        availableBalance: walletBalance,
        receivable: receivableSplitAmount,
      },

      monthlySpend: {
        graphTotal,
        currentMonthTotal,
        currentMonthLabel,
        months,
      },
      spendingInsight: {
        text:
          currentMonthTotal > 0
            ? "Expenditure updates from your saved expenses."
            : "No expenses recorded for this month yet.",
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
