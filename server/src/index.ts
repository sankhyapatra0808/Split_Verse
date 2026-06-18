import authRoutes from "./routes/auth.routes.js";
import express from "express";
import cors from "cors";
import { testDbConnection, db } from "./config/db.js";
import dashboardRoutes from "./routes/dashboard.routes.js";


const app = express();

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "SplitVerse backend is running",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "splitverse-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/db-test", async (_req, res) => {
  try {
    const result = await testDbConnection();

    res.json({
      status: "connected",
      databaseTime: result.now,
    });
  } catch (error) {
    console.error("Database connection failed:", error);

    res.status(500).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});

app.post("/api/setup/users-table", async (_req, res) => {
  try {
    await db.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firebase_uid TEXT UNIQUE NOT NULL,
        name TEXT,
        email TEXT UNIQUE NOT NULL,
        photo_url TEXT,
        provider TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    res.json({
      status: "success",
      message: "Users table is ready",
    });
  } catch (error) {
    console.error("Users table setup failed:", error);

    res.status(500).json({
      status: "error",
      message: "Users table setup failed",
    });
  }
});

app.post("/api/setup/app-tables", async (_req, res) => {
  try {
    await db.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS expenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        category TEXT,
        amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
        expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
        amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settlements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    res.json({
      status: "success",
      message: "App tables are ready",
    });
  } catch (error) {
    console.error("App tables setup failed:", error);

    res.status(500).json({
      status: "error",
      message: "App tables setup failed",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.listen(PORT, () => {
  console.log(`SplitVerse backend running on http://localhost:${PORT}`);
});