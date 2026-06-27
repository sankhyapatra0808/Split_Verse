import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../config/db.js";
const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
async function pathExists(value) {
    try {
        await fs.access(value);
        return true;
    }
    catch {
        return false;
    }
}
async function getMigrationsDir() {
    const compiledDir = path.join(currentDir, "migrations");
    if (await pathExists(compiledDir)) {
        return compiledDir;
    }
    const sourceDir = path.join(process.cwd(), "src", "db", "migrations");
    if (await pathExists(sourceDir)) {
        return sourceDir;
    }
    throw new Error(`Migration folder not found. Checked: ${compiledDir} and ${sourceDir}`);
}
async function ensureMigrationTable() {
    await db.query(`
    CREATE TABLE IF NOT EXISTS _splitverse_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}
async function getAppliedMigrations() {
    const result = await db.query(`
    SELECT name
    FROM _splitverse_migrations
    ORDER BY name ASC;
  `);
    return new Set(result.rows.map((row) => row.name));
}
async function runMigration(fileName, sql) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(`
      INSERT INTO _splitverse_migrations (name)
      VALUES ($1)
      ON CONFLICT (name) DO NOTHING;
      `, [fileName]);
        await client.query("COMMIT");
        console.log(`✅ Applied migration: ${fileName}`);
    }
    catch (error) {
        await client.query("ROLLBACK");
        console.error(`❌ Migration failed: ${fileName}`);
        throw error;
    }
    finally {
        client.release();
    }
}
async function main() {
    const migrationsDir = await getMigrationsDir();
    const files = (await fs.readdir(migrationsDir))
        .filter((file) => file.endsWith(".sql"))
        .sort((left, right) => left.localeCompare(right));
    if (files.length === 0) {
        console.log("No migration files found.");
        return;
    }
    await ensureMigrationTable();
    const applied = await getAppliedMigrations();
    for (const file of files) {
        if (applied.has(file)) {
            console.log(`⏭️  Skipping already applied migration: ${file}`);
            continue;
        }
        const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
        await runMigration(file, sql);
    }
    console.log("✅ SplitVerse migrations are up to date.");
}
main()
    .catch((error) => {
    console.error("Migration runner failed:", error);
    process.exitCode = 1;
})
    .finally(async () => {
    await db.end();
});
