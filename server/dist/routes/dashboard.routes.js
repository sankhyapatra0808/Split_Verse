import express from "express";
import { db } from "../config/db.js";
import { verifyFirebaseToken, } from "../middleware/verifyFirebaseToken.js";
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
router.get("/summary", verifyFirebaseToken, async (req, res) => {
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }
        const userResult = await db.query(`
      SELECT id, email
      FROM users
      WHERE firebase_uid = $1;
      `, [firebaseUser.uid]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                message: "User not found in database",
            });
        }
        const dbUserId = userResult.rows[0].id;
        const dbUserEmail = userResult.rows[0].email;
        const adjustedSplitSettlementResult = await db.query(`
      WITH settled AS (
        SELECT
          item_id,
          COALESCE(SUM(amount)::float, 0) AS settled_amount
        FROM split_room_item_settlements
        GROUP BY item_id
      ),
      debt_lines AS (
        SELECT
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
          END AS signed_amount
        FROM debt_lines
        WHERE pending_amount > 0
      ),
      pair_totals AS (
        SELECT
          user_a,
          user_b,
          SUM(signed_amount)::float AS net_amount
        FROM pair_lines
        GROUP BY user_a, user_b
      ),
      net_rows AS (
        SELECT
          CASE WHEN net_amount > 0 THEN user_a ELSE user_b END AS from_user_id,
          CASE WHEN net_amount > 0 THEN user_b ELSE user_a END AS to_user_id,
          ABS(net_amount)::float AS amount
        FROM pair_totals
        WHERE ABS(net_amount) >= 0.01
      )
      SELECT
        COALESCE(
          SUM(CASE WHEN from_user_id = $1 THEN amount ELSE 0 END),
          0
        )::float AS pending_payment,
        COALESCE(
          SUM(CASE WHEN to_user_id = $1 THEN amount ELSE 0 END),
          0
        )::float AS receivable
      FROM net_rows;
      `, [dbUserId]);
        const pendingSplitPayment = Number(adjustedSplitSettlementResult.rows[0].pending_payment);
        const receivableSplitAmount = Number(adjustedSplitSettlementResult.rows[0].receivable);
        const summaryResult = await db.query(`
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
      `, [dbUserId, dbUserEmail]);
        const summary = summaryResult.rows[0];
        const todayExpense = Number(summary.today_expense);
        const walletBalance = Number(summary.wallet_balance);
        const currentMonthNumber = Number(summary.current_month_number);
        const timeSlotResult = await db.query(`
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
      `, [dbUserId, dbUserEmail]);
        const timeSlots = timeSlotResult.rows.map((row) => ({
            label: row.label,
            amount: Number(row.amount),
        }));
        const monthlyResult = await db.query(`
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
      `, [dbUserId, dbUserEmail]);
        const monthlyPeakResult = await db.query(`
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
      `, [dbUserId, dbUserEmail]);
        const monthlyAmounts = Array.from({ length: 12 }, (_, index) => {
            const monthNumber = index + 1;
            const found = monthlyResult.rows.find((row) => Number(row.month) === monthNumber);
            return found ? Number(found.amount) : 0;
        });
        const maxMonthlyAmount = Math.max(...monthlyAmounts, 1);
        const graphTotal = monthlyAmounts.reduce((sum, amount) => sum + amount, 0);
        const currentMonthIndex = Math.max(0, Math.min(11, currentMonthNumber - 1));
        const currentMonthTotal = monthlyAmounts[currentMonthIndex] ?? 0;
        const currentMonthLabel = monthLabels[currentMonthIndex] ?? "This month";
        const peakDaysByMonth = new Map(monthlyPeakResult.rows.map((row) => [
            Number(row.month),
            Number(row.peak_day),
        ]));
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
                text: currentMonthTotal > 0
                    ? "Expenditure updates from your saved expenses."
                    : "No expenses recorded for this month yet.",
            },
        });
    }
    catch (error) {
        console.error("Dashboard summary failed:", error);
        return res.status(500).json({
            message: "Failed to load dashboard summary",
        });
    }
});
export default router;
