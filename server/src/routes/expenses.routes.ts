import express from "express";
import { db } from "../config/db.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";
import { sendLiveUpdate } from "../liveEvents.js";

const router = express.Router();
const maxExpensesPerDay = 10;

router.post("/", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const { title, category, amount, expenseDate } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        message: "Expense title is required",
      });
    }

    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({
        message: "Expense amount must be greater than 0",
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

    const expensesCreatedTodayResult = await db.query(
      `
      SELECT COUNT(*)::int AS expense_count
      FROM expenses
      WHERE user_id = $1
      AND created_at::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
      `,
      [dbUserId],
    );
    const expensesCreatedToday = Number(
      expensesCreatedTodayResult.rows[0].expense_count,
    );

    if (expensesCreatedToday >= maxExpensesPerDay) {
      return res.status(429).json({
        message: "You can add up to 10 expenses per day",
      });
    }

    const expenseResult = await db.query(
      `
      INSERT INTO expenses (
        user_id,
        title,
        category,
        amount,
        expense_date
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        COALESCE($5::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)
      )
      RETURNING
        id,
        title,
        category,
        amount::float,
        expense_date,
        created_at;
      `,
      [
        dbUserId,
        String(title).trim(),
        category ? String(category).trim() : "Other",
        numericAmount,
        expenseDate || null,
      ]
    );

    sendLiveUpdate([dbUserId], {
      type: "money",
      reason: "expense-created",
    });

    return res.status(201).json({
      message: "Expense created successfully",
      expense: expenseResult.rows[0],
    });
  } catch (error) {
    console.error("Create expense failed:", error);

    return res.status(500).json({
      message: "Failed to create expense",
    });
  }
});

export default router;
