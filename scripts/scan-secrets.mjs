import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".vite",
]);
const suspiciousPatterns = [
  /-----BEGIN PRIVATE KEY-----/,
  /DATABASE_URL\s*=\s*postgresql:\/\/[^\s]+/i,
  /xsmtpsib-[A-Za-z0-9_-]+/,
  /rzp_(test|live)_[A-Za-z0-9]+/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /CLOUDINARY_API_SECRET\s*=\s*[^\s]+/i,
  /RAZORPAY_KEY_SECRET\s*=\s*[^\s]+/i,
];

const allowedFiles = new Set([
  ".env.example",
  "server/.env.example",
  "SECURITY_SECRET_ROTATION.md",
  "scripts/scan-secrets.mjs",
]);

let findings = 0;

function scanFile(path) {
  const rel = relative(root, path).replaceAll("\\\\", "/");
  if (allowedFiles.has(rel)) return;
  const content = readFileSync(path, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (suspiciousPatterns.some((pattern) => pattern.test(line))) {
      findings += 1;
      console.log(`${rel}:${index + 1}: possible secret`);
    }
  });
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!stat.isFile() || stat.size > 1_000_000) continue;
    scanFile(fullPath);
  }
}

walk(root);

if (findings > 0) {
  console.error(`\nFound ${findings} possible secret occurrence(s). Rotate any exposed secrets and remove them before deploy.`);
  process.exit(1);
}

console.log("No obvious secrets found in tracked project files.");
