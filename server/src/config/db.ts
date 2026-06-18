import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing in server/.env");
}

export const db = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function testDbConnection() {
  const result = await db.query("SELECT NOW() AS now");
  return result.rows[0];
}