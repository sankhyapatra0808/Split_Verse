import authRoutes from "./routes/auth.routes.js";
import express from "express";
import path from "node:path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { testDbConnection, db, warmDatabaseConnection } from "./config/db.js";
import { ensurePerformanceIndexes, ensurePerformanceIndexesInBackground, } from "./db/performanceIndexes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import exchangeRatesRoutes from "./routes/exchangeRates.routes.js";
import publicPagesRoutes from "./routes/publicPages.routes.js";
import expenseRoutes from "./routes/expenses.routes.js";
import splitRoomRoutes from "./routes/splitRooms.routes.js";
import friendRoutes, { getAcceptPageCacheStats, } from "./routes/friends.routes.js";
import transactionRoutes from "./routes/transactions.routes.js";
import walletRoutes from "./routes/wallet.routes.js";
import paymentRoutes, { razorpayWebhookHandler } from "./routes/payments.routes.js";
import { registerLiveClient } from "./liveEvents.js";
import { compressResponses } from "./middleware/compressResponses.js";
import { getFirebaseAuthDependencyHealth, verifyFirebaseToken, } from "./middleware/verifyFirebaseToken.js";
const app = express();
const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const CLIENT_URLS = (process.env.CLIENT_URLS ||
    [
        CLIENT_URL,
        "http://localhost:5173",
        "https://split-verse.vercel.app",
        "https://split-verse-ww7n.vercel.app",
    ].join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const allowedOrigins = new Set(CLIENT_URLS);
function isAllowedVercelPreview(origin) {
    try {
        const url = new URL(origin);
        return (url.protocol === "https:" &&
            url.hostname.endsWith(".vercel.app") &&
            url.hostname.startsWith("split-verse"));
    }
    catch {
        return false;
    }
}
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || "100kb";
const setupRoutesEnabled = process.env.ENABLE_SETUP_ROUTES === "true";
const setupRouteSecret = process.env.SETUP_ROUTE_SECRET || "";
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
const corsOptions = {
    origin(origin, callback) {
        if (!origin) {
            callback(null, true);
            return;
        }
        if (allowedOrigins.has(origin) || isAllowedVercelPreview(origin)) {
            callback(null, true);
            return;
        }
        console.warn(`CORS blocked origin: ${origin}`);
        callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
const apiLimiter = rateLimit({
    windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    limit: Number(process.env.API_RATE_LIMIT_MAX || 700),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many requests. Please slow down." },
});
const authLimiter = rateLimit({
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 80),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many auth attempts. Please try again later." },
});
function protectSetupRoutes(req, res, next) {
    if (!setupRoutesEnabled) {
        return res.status(404).json({ message: "Not found" });
    }
    if (!setupRouteSecret || req.header("x-setup-secret") !== setupRouteSecret) {
        return res.status(403).json({ message: "Setup route is protected" });
    }
    next();
}
app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);
app.use(compressResponses());
// Keep this only as a fallback for old local profile-photo URLs. New uploads go to Cloudinary.
app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), {
    immutable: true,
    maxAge: "7d",
}));
app.post("/api/payments/razorpay/webhook", express.raw({ type: "application/json", limit: process.env.RAZORPAY_WEBHOOK_BODY_LIMIT || "1mb" }), razorpayWebhookHandler);
app.use(express.json({ limit: jsonBodyLimit }));
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
        dependencies: {
            firebaseAuth: getFirebaseAuthDependencyHealth(),
        },
        renderCaches: {
            friendAcceptPage: getAcceptPageCacheStats(),
        },
    });
});
app.get("/api/db-test", async (_req, res) => {
    try {
        const result = await testDbConnection();
        res.json({
            status: "connected",
            databaseTime: result.now,
        });
    }
    catch (error) {
        console.error("Database connection failed:", error);
        res.status(500).json({
            status: "error",
            message: "Database connection failed",
        });
    }
});
app.get("/api/live/events", verifyFirebaseToken, async (req, res) => {
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const userResult = await db.query(`
      SELECT id
      FROM users
      WHERE firebase_uid = $1;
      `, [firebaseUser.uid]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: "User not found in database" });
        }
        registerLiveClient(userResult.rows[0].id, res);
    }
    catch (error) {
        console.error("Live update stream failed:", error);
        if (!res.headersSent) {
            return res.status(500).json({
                message: "Failed to open live update stream",
            });
        }
        res.end();
    }
});
app.post("/api/setup/users-table", protectSetupRoutes, async (_req, res) => {
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
    }
    catch (error) {
        console.error("Users table setup failed:", error);
        res.status(500).json({
            status: "error",
            message: "Users table setup failed",
        });
    }
});
app.post("/api/setup/app-tables", protectSetupRoutes, async (_req, res) => {
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

      CREATE TABLE IF NOT EXISTS split_rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        category TEXT,
        payment_status TEXT NOT NULL DEFAULT 'no_one_paid',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE split_rooms
        ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'no_one_paid';

      CREATE TABLE IF NOT EXISTS split_room_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES split_rooms(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        display_name TEXT,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'member',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS split_room_members_room_email_idx
        ON split_room_members (room_id, LOWER(email))
        WHERE email IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS split_room_members_room_user_idx
        ON split_room_members (room_id, user_id)
        WHERE user_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS split_room_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES split_rooms(id) ON DELETE CASCADE,
        assigned_member_id UUID NOT NULL REFERENCES split_room_members(id) ON DELETE CASCADE,
        created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
        collected_at TIMESTAMP,
        expense_id UUID,
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE split_room_items
        ADD COLUMN IF NOT EXISTS collected_at TIMESTAMP;

      ALTER TABLE split_room_items
        ADD COLUMN IF NOT EXISTS expense_id UUID;

      CREATE TABLE IF NOT EXISTS friend_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_email TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        accepted_at TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_unique_pending_idx
        ON friend_requests (requester_user_id, LOWER(recipient_email))
        WHERE status = 'pending';

      CREATE TABLE IF NOT EXISTS friendships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_one_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_two_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT friendships_distinct_users CHECK (user_one_id <> user_two_id),
        CONSTRAINT friendships_unique_pair UNIQUE (user_one_id, user_two_id)
      );
    `);
        await ensurePerformanceIndexes();
        res.json({
            status: "success",
            message: "App tables and performance indexes are ready",
        });
    }
    catch (error) {
        console.error("App tables setup failed:", error);
        res.status(500).json({
            status: "error",
            message: "App tables setup failed",
        });
    }
});
app.post("/api/setup/performance-indexes", protectSetupRoutes, async (_req, res) => {
    try {
        await ensurePerformanceIndexes();
        res.json({
            status: "success",
            message: "Performance indexes are ready",
        });
    }
    catch (error) {
        console.error("Performance index setup failed:", error);
        res.status(500).json({
            status: "error",
            message: "Performance index setup failed",
        });
    }
});
ensurePerformanceIndexesInBackground();
app.use("/api/exchange-rates", exchangeRatesRoutes);
app.use("/api/public-pages", publicPagesRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/split-rooms", splitRoomRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/payments", paymentRoutes);
void warmDatabaseConnection();
app.listen(PORT, () => {
    console.log(`SplitVerse backend running on http://localhost:${PORT}`);
});
