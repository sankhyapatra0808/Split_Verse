import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing in server/.env");
}

function getNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const queryTimeoutMs = getNumberEnv("DB_QUERY_TIMEOUT_MS", 30_000);
const statementTimeoutMs = getNumberEnv("DB_STATEMENT_TIMEOUT_MS", 30_000);
const connectionTimeoutMs = getNumberEnv("DB_CONNECTION_TIMEOUT_MS", 30_000);
const idleTimeoutMs = getNumberEnv("DB_IDLE_TIMEOUT_MS", 60_000);
const poolMax = getNumberEnv("DB_POOL_MAX", 10);
const maxUses = getNumberEnv("DB_POOL_MAX_USES", 7500);

export const db = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
  max: poolMax,
  idleTimeoutMillis: idleTimeoutMs,
  connectionTimeoutMillis: connectionTimeoutMs,
  query_timeout: queryTimeoutMs,
  statement_timeout: statementTimeoutMs,
  keepAlive: true,
  maxUses,
});

db.on("error", (error) => {
  console.error("Unexpected Neon/Postgres pool error:", error);
});

function isTransientDbError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  return (
    message.includes("timeout") ||
    message.includes("terminated") ||
    message.includes("connection") ||
    ["57P01", "57P02", "57P03", "08000", "08003", "08006", "53300"].includes(code)
  );
}

export async function queryWithRetry<T = any>(
  text: string,
  values?: unknown[],
  attempts = 2,
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await db.query<T>(text, values);
    } catch (error) {
      lastError = error;

      if (attempt >= attempts || !isTransientDbError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }

  throw lastError;
}

export async function testDbConnection() {
  const result = await queryWithRetry<{ now: Date }>("SELECT NOW() AS now");
  return result.rows[0];
}

export async function warmDatabaseConnection() {
  try {
    await queryWithRetry("SELECT 1", [], 2);
    console.log("✅ Database connection warmed");
  } catch (error) {
    console.error("⚠️ Database warm-up failed:", error);
  }
}
