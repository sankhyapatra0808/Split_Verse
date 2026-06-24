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

export const db = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
  max: getNumberEnv("DB_POOL_MAX", 10),
  idleTimeoutMillis: getNumberEnv("DB_IDLE_TIMEOUT_MS", 30_000),
  connectionTimeoutMillis: getNumberEnv("DB_CONNECTION_TIMEOUT_MS", 10_000),
  keepAlive: true,
});

db.on("error", (error) => {
  console.error("Unexpected Neon/Postgres pool error:", error);
});

export async function testDbConnection() {
  const result = await db.query("SELECT NOW() AS now");
  return result.rows[0];
}
