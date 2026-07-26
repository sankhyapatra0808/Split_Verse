import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import argon2 from "argon2";
import type { QueryResult, QueryResultRow } from "pg";
import { z } from "zod";
import { db } from "../config/db.js";
import { adminAuth } from "../config/firebaseAdmin.js";
import { isEmailConfigured, sendTransactionalEmail } from "../utils/email.js";
import {
  type AuthRequest,
  requireRecentAuthentication,
  verifyFirebaseCredentialToken,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";
import {
  parseRequestBody,
  sendValidationError,
} from "../middleware/validateRequest.js";
import {
  sendWalletPinError,
  verifyWalletPinForUser,
} from "../utils/walletPin.js";
import { verifyFirebaseEmailPassword } from "../utils/firebasePasswordAuth.js";

const router = express.Router();
const deleteAccountConfirmationText = "/DeleteAccount";
const loginOtpLength = 6;
const loginOtpExpiryMs = Number(
  process.env.LOGIN_OTP_EXPIRY_MS || 10 * 60 * 1000,
);
const maxLoginOtpAttempts = Number(process.env.LOGIN_OTP_MAX_ATTEMPTS || 5);
const loginOtpMaxRequests = Number(process.env.LOGIN_OTP_MAX_REQUESTS || 5);
const loginOtpRequestWindowMinutes = Number(
  process.env.LOGIN_OTP_REQUEST_WINDOW_MINUTES || 15,
);
const loginOtpMaxResends = Number(process.env.LOGIN_OTP_MAX_RESENDS || 3);
const loginOtpResendCooldownMs = Number(
  process.env.LOGIN_OTP_RESEND_COOLDOWN_MS || 30 * 1000,
);
const loginOtpPepper = process.env.LOGIN_OTP_PEPPER?.trim() || "";
const profileIdentityOtpLength = 6;
const profileIdentityOtpExpiryMs = 10 * 60 * 1000;
const profileIdentityOtpMaxAttempts = 5;
const profileIdentityOtpMaxRequests = 3;
const profileIdentityOtpRequestWindowMinutes = 15;
const supportedAppCurrencies = new Set([
  "INR",
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "JPY",
  "AED",
  "AUD",
  "SGD",
  "CHF",
  "CNY",
]);
const supportedAppLanguages = new Set([
  "en",
  "hi",
  "bn",
  "fr",
  "es",
  "de",
  "ar",
  "ja",
  "zh",
  "pt",
]);
const walletPinLengthMessage = "Wallet PIN must be 4 to 6 digits";
const walletPinMaxFailedAttempts = Number(
  process.env.WALLET_PIN_MAX_FAILED_ATTEMPTS || 5,
);
const walletPinLockMs = Number(
  process.env.WALLET_PIN_LOCK_MS || 15 * 60 * 1000,
);
const walletPinResetOtpLength = 6;
const walletPinResetOtpExpiryMs = Number(
  process.env.WALLET_PIN_RESET_OTP_EXPIRY_MS || 10 * 60 * 1000,
);
const walletPinResetOtpMaxAttempts = Number(
  process.env.WALLET_PIN_RESET_OTP_MAX_ATTEMPTS || 5,
);
const walletPinResetOtpMaxRequests = Number(
  process.env.WALLET_PIN_RESET_OTP_MAX_REQUESTS || 3,
);
const walletPinResetOtpWindowMinutes = Number(
  process.env.WALLET_PIN_RESET_OTP_WINDOW_MINUTES || 15,
);
const walletPinOtpPepper =
  process.env.WALLET_PIN_RESET_OTP_PEPPER?.trim() ||
  (process.env.NODE_ENV === "production"
    ? ""
    : "splitverse-development-wallet-pin-otp-pepper");

const passwordResetOtpLength = 6;
const passwordResetOtpExpiryMs = Number(
  process.env.PASSWORD_RESET_OTP_EXPIRY_MS || 10 * 60 * 1000,
);
const passwordResetOtpMaxAttempts = Number(
  process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS || 5,
);
const passwordResetOtpMaxRequests = Number(
  process.env.PASSWORD_RESET_OTP_MAX_REQUESTS || 3,
);
const passwordResetOtpWindowMinutes = Number(
  process.env.PASSWORD_RESET_OTP_WINDOW_MINUTES || 15,
);
const passwordResetOtpPepper =
  process.env.PASSWORD_RESET_OTP_PEPPER?.trim() ||
  (process.env.NODE_ENV === "production"
    ? ""
    : "splitverse-development-password-reset-otp-pepper");

const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY?.trim();
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
const cloudinaryProfileFolder =
  process.env.CLOUDINARY_PROFILE_FOLDER?.trim() || "splitverse/profile-photos";
const isCloudinaryConfigured = Boolean(
  cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret,
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: cloudinaryCloudName,
    api_key: cloudinaryApiKey,
    api_secret: cloudinaryApiSecret,
    secure: true,
  });
}

const walletPinValueSchema = z
  .string()
  .trim()
  .regex(/^\d{4,6}$/, walletPinLengthMessage)
  .superRefine((pin, context) => {
    const strengthIssue = getWalletPinStrengthIssue(pin);

    if (strengthIssue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: strengthIssue,
      });
    }
  });

const walletPinSchema = z
  .object({
    pin: walletPinValueSchema,
    currentPin: z
      .string()
      .trim()
      .regex(/^\d{4,6}$/, walletPinLengthMessage)
      .optional(),
    username: z
      .string()
      .trim()
      .transform((value) => normalizeUsername(value))
      .refine(
        (value) => /^[a-z0-9_]{3,30}$/.test(value),
        "Username must be 3 to 30 characters using lowercase letters, numbers, or underscores",
      )
      .optional(),
  })
  .strict();

const verifyWalletPinSchema = z
  .object({
    pin: z
      .string()
      .trim()
      .regex(/^\d{4,6}$/, walletPinLengthMessage),
  })
  .strict();

const walletPinResetOtpRequestSchema = z.object({}).strict();

const walletPinResetSchema = z
  .object({
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit OTP sent to your email"),
    pin: walletPinValueSchema,
  })
  .strict();

const passwordResetEmailSchema = z
  .string({ message: "Email address is required" })
  .trim()
  .email("Enter a valid email address")
  .max(254, "Email address is too long")
  .transform((value) => value.toLowerCase());

const passwordResetPasswordSchema = z
  .string({ message: "New password is required" })
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password is too long");

const passwordResetRequestSchema = z
  .object({
    email: passwordResetEmailSchema,
  })
  .strict();

const passwordResetConfirmSchema = z
  .object({
    email: passwordResetEmailSchema,
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit password reset code"),
    password: passwordResetPasswordSchema,
    confirmPassword: passwordResetPasswordSchema,
  })
  .strict()
  .refine((value) => value.password === value.confirmPassword, {
    message: "Re-entered password does not match",
    path: ["confirmPassword"],
  });

const maxProfilePhotoSizeBytes = 3 * 1024 * 1024;
const allowedProfilePhotoMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function detectProfilePhotoMimeType(buffer: Buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  const gifHeader = buffer.subarray(0, 6).toString("ascii");
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return "image/gif";
  }

  return null;
}

const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxProfilePhotoSizeBytes,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedProfilePhotoMimeTypes.has(file.mimetype)) {
      callback(new Error("Only JPG, PNG, WEBP, or GIF images are allowed"));
      return;
    }

    callback(null, true);
  },
});

const usernameValueSchema = z
  .string({ message: "Username is required" })
  .trim()
  .transform((value) => normalizeUsername(value))
  .refine(
    (value) => /^[a-z0-9_]{3,30}$/.test(value),
    "Username must be 3 to 30 characters using lowercase letters, numbers, or underscores",
  );

const usernameAvailabilitySchema = z
  .object({
    username: usernameValueSchema,
  })
  .strict();

const syncUserSchema = z
  .object({
    username: usernameValueSchema.optional(),
    requireUsername: z.boolean().optional().default(false),
    deferUsernameSetup: z.boolean().optional().default(false),
  })
  .strict();

const loginOtpRequestSchema = z
  .object({
    identifier: z
      .string({ message: "Username or email is required" })
      .trim()
      .min(1, "Username or email is required")
      .max(254, "Username or email is too long")
      .optional(),
    email: z
      .string()
      .trim()
      .min(1, "Email address is required")
      .max(254, "Email address is too long")
      .optional(),
    password: z
      .string({ message: "Password is required" })
      .min(1, "Password is required")
      .max(128, "Password is too long"),
  })
  .strict()
  .refine((value) => Boolean(value.identifier || value.email), {
    message: "Username or email is required",
    path: ["identifier"],
  })
  .transform((value) => ({
    identifier: String(value.identifier || value.email || "").trim(),
    password: value.password,
  }));

const loginOtpVerifySchema = z
  .object({
    sessionId: z.string().trim().uuid("Login session is invalid"),
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit login code"),
  })
  .strict();

const loginOtpResendSchema = z
  .object({
    sessionId: z.string().trim().uuid("Login session is invalid"),
  })
  .strict();

const profileIdentityChangeRequestSchema = z
  .object({
    field: z.enum(["name", "email"]),
    value: z.string().trim().min(1, "New value is required").max(254),
  })
  .strict();

const profileIdentityChangeConfirmSchema = z
  .object({
    requestId: z.string().trim().uuid("Verification request is invalid"),
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit verification code"),
  })
  .strict();

type Queryable = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ) => Promise<QueryResult<T>>;
};

function getWalletPinStrengthIssue(pin: string) {
  if (/^(\d)\1+$/.test(pin)) {
    return "Use a stronger wallet PIN. Repeated digits are too easy to guess.";
  }

  const commonPins = new Set([
    "0000",
    "1111",
    "2222",
    "3333",
    "4444",
    "5555",
    "6666",
    "7777",
    "8888",
    "9999",
    "1234",
    "4321",
    "12345",
    "54321",
    "123456",
    "654321",
    "1122",
    "1212",
    "2580",
  ]);

  if (commonPins.has(pin)) {
    return "Use a stronger wallet PIN. This PIN is too common.";
  }

  const digits = pin.split("").map(Number);
  const increasing = digits.every(
    (digit, index) => index === 0 || digit === digits[index - 1] + 1,
  );
  const decreasing = digits.every(
    (digit, index) => index === 0 || digit === digits[index - 1] - 1,
  );

  if (increasing || decreasing) {
    return "Use a stronger wallet PIN. Sequential digits are too easy to guess.";
  }

  return "";
}

function assertOtpPepperConfigured(secret: string, feature: string) {
  const sufficientlyStrong = secret.length >= 32;

  if (sufficientlyStrong || process.env.NODE_ENV !== "production") return;

  throw Object.assign(new Error(`${feature} is temporarily unavailable.`), {
    statusCode: 503,
    code: "OTP_SECURITY_NOT_CONFIGURED",
  });
}

function createWalletPinResetOtp() {
  return crypto
    .randomInt(
      10 ** (walletPinResetOtpLength - 1),
      10 ** walletPinResetOtpLength,
    )
    .toString();
}

function hashWalletPinResetOtp(otp: string, userId: string) {
  return crypto
    .createHmac("sha256", walletPinOtpPepper)
    .update(`${userId}:${otp}`)
    .digest("hex");
}

function createPasswordResetOtp() {
  return crypto
    .randomInt(10 ** (passwordResetOtpLength - 1), 10 ** passwordResetOtpLength)
    .toString();
}

function hashPasswordResetOtp(otp: string, firebaseUid: string, email: string) {
  return crypto
    .createHmac("sha256", passwordResetOtpPepper)
    .update(`${firebaseUid}:${email.toLowerCase()}:${otp}`)
    .digest("hex");
}

function getFirebaseAdminErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

async function getAuthUserProfile(client: Queryable, userId: string) {
  const result = await client.query(
    `
    SELECT
      id,
      firebase_uid,
      name,
      email,
      photo_url,
      profile_photo_url,
      avatar_mode,
      app_currency,
      app_language,
      (wallet_pin_hash IS NOT NULL) AS has_wallet_pin,
      CASE
        WHEN avatar_mode = 'initials' THEN NULL
        ELSE COALESCE(profile_photo_url, photo_url)
      END AS display_photo_url,
      provider,
      created_at,
      updated_at
    FROM users
    WHERE id = $1;
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendWalletPinResetOtpEmail({
  email,
  otp,
  name,
}: {
  email: string;
  otp: string;
  name: string | null;
}) {
  if (!isEmailConfigured()) {
    return "not_configured";
  }

  const safeName = escapeHtml(name?.trim() || "there");
  const emailResult = await sendTransactionalEmail({
    to: email,
    subject: "Reset your SplitVerse wallet PIN",
    text: `Your SplitVerse wallet PIN reset code is ${otp}. It expires in 10 minutes. If you did not request this, change your account password.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0b0d;">
        <h1 style="font-size:24px;margin:0 0 12px;">Reset your wallet PIN</h1>
        <p style="font-size:15px;line-height:1.5;margin:0 0 18px;">
          Hi ${safeName}, use this code to reset your SplitVerse wallet PIN. It expires in 10 minutes.
        </p>
        <div style="display:inline-block;padding:14px 18px;border-radius:14px;background:#f7f7f7;border:1px solid #dee1e6;font-size:28px;font-weight:800;letter-spacing:8px;">
          ${otp}
        </div>
        <p style="font-size:13px;line-height:1.5;margin:18px 0 0;color:#5b616e;">
          If you did not request this OTP, ignore it and change your login password.
        </p>
      </div>
    `,
  });

  if (!emailResult.ok) {
    console.error("Wallet PIN reset OTP email failed:", emailResult);
    return emailResult.reason;
  }

  return "sent";
}

async function sendPasswordResetOtpEmail({
  email,
  otp,
}: {
  email: string;
  otp: string;
}) {
  if (!isEmailConfigured()) {
    return "not_configured";
  }

  const emailResult = await sendTransactionalEmail({
    to: email,
    subject: "Reset your SplitVerse password",
    text: `Your SplitVerse password reset code is ${otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0b0d;">
        <h1 style="font-size:24px;margin:0 0 12px;">Reset your SplitVerse password</h1>
        <p style="font-size:15px;line-height:1.5;margin:0 0 18px;">
          Use this code to create a new SplitVerse login password. It expires in 10 minutes.
        </p>
        <div style="display:inline-block;padding:14px 18px;border-radius:14px;background:#f7f7f7;border:1px solid #dee1e6;font-size:28px;font-weight:800;letter-spacing:8px;">
          ${otp}
        </div>
        <p style="font-size:13px;line-height:1.5;margin:18px 0 0;color:#5b616e;">
          If you did not request this password reset, ignore this email.
        </p>
      </div>
    `,
  });

  if (!emailResult.ok) {
    console.error(
      "Password reset OTP email failed through Brevo SMTP:",
      emailResult,
    );
    return emailResult.reason;
  }

  return "sent";
}

function assertLoginOtpConfigured() {
  if (loginOtpPepper.length >= 32 || process.env.NODE_ENV !== "production") {
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw Object.assign(new Error("Email login is temporarily unavailable."), {
      statusCode: 503,
      code: "LOGIN_OTP_NOT_CONFIGURED",
    });
  }
}

function createLoginOtp() {
  return crypto
    .randomInt(10 ** (loginOtpLength - 1), 10 ** loginOtpLength)
    .toString();
}

function hashLoginOtp(otp: string, sessionId: string, firebaseUid: string) {
  const pepper = loginOtpPepper || "splitverse-development-login-otp-pepper";

  return crypto
    .createHmac("sha256", pepper)
    .update(`${sessionId}:${firebaseUid}:${otp}`)
    .digest("hex");
}

function timingSafeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function resolveLoginEmail(identifier: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const looksLikeUsername =
    normalizedIdentifier.startsWith("@") ||
    !normalizedIdentifier.includes("@");

  if (!looksLikeUsername) {
    const parsedEmail = z.string().email().safeParse(normalizedIdentifier);

    if (parsedEmail.success) {
      return parsedEmail.data;
    }
  } else {
    const username = normalizeUsername(normalizedIdentifier);

    if (/^[a-z0-9_]{3,30}$/.test(username)) {
      const result = await db.query<{ email: string }>(
        `
        SELECT email
        FROM users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1;
        `,
        [username],
      );

      if (result.rows[0]?.email) {
        return result.rows[0].email.toLowerCase();
      }
    }
  }

  throw Object.assign(new Error("Incorrect username, email, or password."), {
    statusCode: 401,
    code: "INVALID_LOGIN_CREDENTIALS",
  });
}

function createProfileIdentityOtp() {
  return crypto
    .randomInt(
      10 ** (profileIdentityOtpLength - 1),
      10 ** profileIdentityOtpLength,
    )
    .toString();
}

function hashProfileIdentityOtp(
  otp: string,
  requestId: string,
  userId: string,
  changeType: "name" | "email",
) {
  const pepper = loginOtpPepper || "splitverse-development-login-otp-pepper";

  return crypto
    .createHmac("sha256", pepper)
    .update(`${requestId}:${userId}:${changeType}:${otp}`)
    .digest("hex");
}

async function sendProfileIdentityOtpEmail({
  currentEmail,
  otp,
  changeType,
}: {
  currentEmail: string;
  otp: string;
  changeType: "name" | "email";
}) {
  if (!isEmailConfigured()) {
    return "not_configured" as const;
  }

  const label = changeType === "name" ? "account name" : "registered email";
  const emailResult = await sendTransactionalEmail({
    to: currentEmail,
    subject: `Confirm your SplitVerse ${label} change`,
    text: `Your SplitVerse verification code is ${otp}. It expires in 10 minutes. Use it only to confirm the requested ${label} change.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0b0d;">
        <h1 style="font-size:24px;margin:0 0 12px;">Confirm your ${label} change</h1>
        <p style="font-size:15px;line-height:1.5;margin:0 0 18px;">
          Enter this one-time code in SplitVerse to confirm the change. It expires in 10 minutes.
        </p>
        <div style="font-size:30px;font-weight:800;letter-spacing:0.18em;padding:16px 18px;border-radius:14px;background:#f3f6ff;color:#0052ff;text-align:center;">
          ${otp}
        </div>
        <p style="font-size:13px;line-height:1.5;margin:18px 0 0;color:#667085;">
          If you did not request this change, do not share this code and review your account security.
        </p>
      </div>
    `,
  });

  if (!emailResult.ok) {
    console.error("Profile identity OTP email failed:", emailResult);
    return emailResult.reason;
  }

  return "sent" as const;
}

function maskEmailAddress(email: string) {
  const [localPart, domain = ""] = email.split("@");
  const visibleLocal = localPart.slice(0, Math.min(2, localPart.length));
  const hiddenLength = Math.max(2, localPart.length - visibleLocal.length);

  return `${visibleLocal}${"*".repeat(hiddenLength)}@${domain}`;
}

function normalizeAvatarMode(value: unknown) {
  return value === "initials" ? "initials" : "photo";
}

function normalizeUsername(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

function buildUsernameBase(name: string, email: string) {
  const source = name.trim() || email.split("@")[0] || "user";
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

  if (normalized.length >= 3) {
    return normalized;
  }

  return `user_${normalized || "sv"}`.slice(0, 24);
}

async function generateAvailableUsername(
  preferredBase: string,
  excludeUserId: string | null = null,
) {
  const base = buildUsernameBase(preferredBase, preferredBase);

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const suffixText = suffix === 0 ? "" : `_${suffix}`;
    const candidate = `${base.slice(0, 30 - suffixText.length)}${suffixText}`;
    const existing = await db.query(
      `
      SELECT 1
      FROM users
      WHERE LOWER(username) = LOWER($1)
      AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1;
      `,
      [candidate, excludeUserId],
    );

    if (existing.rows.length === 0) {
      return candidate;
    }
  }

  const randomSuffix = crypto.randomBytes(4).toString("hex");
  return `${base.slice(0, 21)}_${randomSuffix}`;
}

function normalizeProfilePhotoUrl(value: unknown) {
  const photoUrl = String(value ?? "").trim();

  if (!photoUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(photoUrl);

    const httpAllowed =
      process.env.NODE_ENV !== "production" && parsedUrl.protocol === "http:";

    if (parsedUrl.protocol !== "https:" && !httpAllowed) {
      return null;
    }

    return parsedUrl.toString().slice(0, 2048);
  } catch {
    return null;
  }
}

function normalizeAppCurrency(value: unknown) {
  const currency = String(value ?? "")
    .trim()
    .toUpperCase();

  return supportedAppCurrencies.has(currency) ? currency : null;
}

function normalizeAppLanguage(value: unknown) {
  const language = String(value ?? "")
    .trim()
    .toLowerCase();

  return supportedAppLanguages.has(language) ? language : null;
}

function hasOwnBodyField(body: unknown, ...keys: string[]) {
  if (!body || typeof body !== "object") {
    return false;
  }

  return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function uploadProfilePhotoToCloudinary(
  file: Express.Multer.File,
  userId: string,
) {
  if (!isCloudinaryConfigured) {
    throw Object.assign(
      new Error(
        "Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in server/.env.",
      ),
      { statusCode: 503 },
    );
  }

  return new Promise<string>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: cloudinaryProfileFolder,
        public_id: `${userId}-${crypto.randomBytes(8).toString("hex")}`,
        resource_type: "image",
        overwrite: false,
        transformation: [
          {
            width: 512,
            height: 512,
            crop: "fill",
            gravity: "face",
            quality: "auto",
            fetch_format: "auto",
          },
        ],
      },
      (error, result?: UploadApiResponse) => {
        if (error || !result?.secure_url) {
          reject(error || new Error("Cloudinary did not return a secure URL"));
          return;
        }

        resolve(result.secure_url);
      },
    );

    uploadStream.end(file.buffer);
  });
}

async function sendLoginOtpEmail({
  email,
  otp,
}: {
  email: string;
  otp: string;
}) {
  if (!isEmailConfigured()) {
    return "not_configured";
  }

  const emailResult = await sendTransactionalEmail({
    to: email,
    subject: "Your SplitVerse login code",
    text: `Your SplitVerse login code is ${otp}. It expires in 10 minutes. If you did not try to sign in, you can ignore this email.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0b0d;">
        <h1 style="font-size:24px;margin:0 0 12px;">SplitVerse login code</h1>

        <p style="font-size:15px;line-height:1.5;margin:0 0 18px;">
          Use this code to finish signing in to SplitVerse. It expires in 10 minutes.
        </p>

        <div style="display:inline-block;padding:14px 18px;border-radius:14px;background:#f7f7f7;border:1px solid #dee1e6;font-size:28px;font-weight:800;letter-spacing:8px;">
          ${otp}
        </div>

        <p style="font-size:13px;line-height:1.5;margin:18px 0 0;color:#5b616e;">
          If you did not try to sign in, you can ignore this email.
        </p>
      </div>
    `,
  });

  if (!emailResult.ok) {
    console.error("Login OTP email failed through Brevo SMTP:", emailResult);
    return emailResult.reason;
  }

  return "sent";
}

router.post("/username/availability", async (req, res) => {
  try {
    const { username } = parseRequestBody(
      usernameAvailabilitySchema,
      req.body,
    );
    const result = await db.query(
      `
      SELECT 1
      FROM users
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1;
      `,
      [username],
    );

    return res.json({
      username,
      available: result.rows.length === 0,
    });
  } catch (error) {
    if (sendValidationError(res, error)) {
      return;
    }

    console.error("Check username availability failed:", error);
    return res.status(500).json({
      message: "Could not check username availability",
    });
  }
});

router.post("/email-login-otp/request", async (req, res) => {
  try {
    assertLoginOtpConfigured();
    const { identifier, password } = parseRequestBody(
      loginOtpRequestSchema,
      req.body,
    );
    const email = await resolveLoginEmail(identifier);
    const credential = await verifyFirebaseEmailPassword(email, password);

    const requestCountResult = await db.query<{ request_count: number }>(
      `
      SELECT COUNT(*)::int AS request_count
      FROM email_login_otp_sessions
      WHERE firebase_uid = $1
      AND created_at > NOW() - ($2::int * INTERVAL '1 minute');
      `,
      [credential.uid, loginOtpRequestWindowMinutes],
    );

    if (
      Number(requestCountResult.rows[0]?.request_count || 0) >=
      loginOtpMaxRequests
    ) {
      return res.status(429).json({
        code: "LOGIN_OTP_RATE_LIMITED",
        message: "Too many login code requests. Please try again later.",
      });
    }

    const sessionId = crypto.randomUUID();
    const otp = createLoginOtp();
    const expiresAt = new Date(Date.now() + loginOtpExpiryMs);
    const emailStatus = await sendLoginOtpEmail({
      email: credential.email,
      otp,
    });

    if (emailStatus !== "sent") {
      return res.status(503).json({
        code: "LOGIN_OTP_DELIVERY_FAILED",
        message:
          emailStatus === "not_configured"
            ? "Email login is temporarily unavailable."
            : "Could not send the login code. Please try again.",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `
        UPDATE email_login_otp_sessions
        SET consumed_at = NOW()
        WHERE firebase_uid = $1
        AND consumed_at IS NULL;
        `,
        [credential.uid],
      );
      await client.query(
        `
        INSERT INTO email_login_otp_sessions (
          id,
          firebase_uid,
          email,
          otp_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5);
        `,
        [
          sessionId,
          credential.uid,
          credential.email,
          hashLoginOtp(otp, sessionId, credential.uid),
          expiresAt,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return res.status(201).json({
      sessionId,
      email: credential.email,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    if (sendValidationError(res, error)) {
      return;
    }

    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      Number.isInteger(Number((error as { statusCode?: unknown }).statusCode))
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 500;
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(
            (error as { code?: unknown }).code || "LOGIN_OTP_REQUEST_FAILED",
          )
        : "LOGIN_OTP_REQUEST_FAILED";

    if (statusCode >= 500) {
      console.error("Request login OTP failed:", error);
    }

    return res.status(statusCode).json({
      code,
      message:
        statusCode === 401
          ? "Incorrect username, email, or password."
          : statusCode === 429
            ? "Too many sign-in attempts. Please try again later."
            : statusCode >= 500
              ? "Email login is temporarily unavailable."
              : error instanceof Error
                ? error.message
                : "Could not request login code.",
    });
  }
});

router.post("/email-login-otp/resend", async (req, res) => {
  const client = await db.connect();

  try {
    assertLoginOtpConfigured();
    const { sessionId } = parseRequestBody(loginOtpResendSchema, req.body);

    await client.query("BEGIN");
    const sessionResult = await client.query<{
      id: string;
      firebase_uid: string;
      email: string;
      resend_count: number;
      last_sent_at: Date | string;
      expires_at: Date | string;
      consumed_at: Date | string | null;
    }>(
      `
      SELECT
        id,
        firebase_uid,
        email,
        resend_count,
        last_sent_at,
        expires_at,
        consumed_at
      FROM email_login_otp_sessions
      WHERE id = $1
      FOR UPDATE;
      `,
      [sessionId],
    );
    const session = sessionResult.rows[0];

    if (!session || session.consumed_at) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        code: "LOGIN_OTP_SESSION_EXPIRED",
        message: "Login code expired. Please start sign-in again.",
      });
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE email_login_otp_sessions SET consumed_at = NOW() WHERE id = $1;`,
        [session.id],
      );
      await client.query("COMMIT");
      return res.status(410).json({
        code: "LOGIN_OTP_SESSION_EXPIRED",
        message: "Login code expired. Please start sign-in again.",
      });
    }

    if (Number(session.resend_count) >= loginOtpMaxResends) {
      await client.query("ROLLBACK");
      return res.status(429).json({
        code: "LOGIN_OTP_RESEND_LIMITED",
        message: "Too many resend requests. Please start sign-in again.",
      });
    }

    const elapsedSinceLastSend =
      Date.now() - new Date(session.last_sent_at).getTime();

    if (elapsedSinceLastSend < loginOtpResendCooldownMs) {
      await client.query("ROLLBACK");
      return res.status(429).json({
        code: "LOGIN_OTP_RESEND_COOLDOWN",
        message: "Please wait before requesting another login code.",
        retryAfterSeconds: Math.ceil(
          (loginOtpResendCooldownMs - elapsedSinceLastSend) / 1000,
        ),
      });
    }

    const otp = createLoginOtp();
    const emailStatus = await sendLoginOtpEmail({ email: session.email, otp });

    if (emailStatus !== "sent") {
      await client.query("ROLLBACK");
      return res.status(503).json({
        code: "LOGIN_OTP_DELIVERY_FAILED",
        message: "Could not send a new login code. Please try again.",
      });
    }

    const expiresAt = new Date(Date.now() + loginOtpExpiryMs);
    await client.query(
      `
      UPDATE email_login_otp_sessions
      SET
        otp_hash = $2,
        failed_attempts = 0,
        resend_count = resend_count + 1,
        last_sent_at = NOW(),
        expires_at = $3
      WHERE id = $1;
      `,
      [
        session.id,
        hashLoginOtp(otp, session.id, session.firebase_uid),
        expiresAt,
      ],
    );
    await client.query("COMMIT");

    return res.json({
      sessionId: session.id,
      email: session.email,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);

    if (sendValidationError(res, error)) {
      return;
    }

    console.error("Resend login OTP failed:", error);
    return res.status(500).json({
      code: "LOGIN_OTP_RESEND_FAILED",
      message: "Could not resend the login code. Please try again.",
    });
  } finally {
    client.release();
  }
});

router.post("/email-login-otp/verify", async (req, res) => {
  const client = await db.connect();

  try {
    assertLoginOtpConfigured();
    const { sessionId, otp } = parseRequestBody(loginOtpVerifySchema, req.body);

    await client.query("BEGIN");
    const sessionResult = await client.query<{
      id: string;
      firebase_uid: string;
      email: string;
      otp_hash: string;
      failed_attempts: number;
      expires_at: Date | string;
      consumed_at: Date | string | null;
    }>(
      `
      SELECT
        id,
        firebase_uid,
        email,
        otp_hash,
        failed_attempts,
        expires_at,
        consumed_at
      FROM email_login_otp_sessions
      WHERE id = $1
      FOR UPDATE;
      `,
      [sessionId],
    );
    const session = sessionResult.rows[0];

    if (!session || session.consumed_at) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        code: "LOGIN_OTP_SESSION_EXPIRED",
        message: "Login code expired. Please request a new code.",
      });
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE email_login_otp_sessions SET consumed_at = NOW() WHERE id = $1;`,
        [session.id],
      );
      await client.query("COMMIT");
      return res.status(410).json({
        code: "LOGIN_OTP_SESSION_EXPIRED",
        message: "Login code expired. Please request a new code.",
      });
    }

    if (Number(session.failed_attempts) >= maxLoginOtpAttempts) {
      await client.query(
        `UPDATE email_login_otp_sessions SET consumed_at = NOW() WHERE id = $1;`,
        [session.id],
      );
      await client.query("COMMIT");
      return res.status(423).json({
        code: "LOGIN_OTP_ATTEMPTS_EXCEEDED",
        message: "Too many incorrect codes. Please start sign-in again.",
      });
    }

    const submittedHash = hashLoginOtp(otp, session.id, session.firebase_uid);
    const matches = timingSafeEqualHex(submittedHash, session.otp_hash);

    if (!matches) {
      const nextAttempts = Number(session.failed_attempts || 0) + 1;
      const consume = nextAttempts >= maxLoginOtpAttempts;
      await client.query(
        `
        UPDATE email_login_otp_sessions
        SET
          failed_attempts = $2,
          consumed_at = CASE WHEN $3::boolean THEN NOW() ELSE consumed_at END
        WHERE id = $1;
        `,
        [session.id, nextAttempts, consume],
      );
      await client.query("COMMIT");

      return res.status(consume ? 423 : 401).json({
        code: consume ? "LOGIN_OTP_ATTEMPTS_EXCEEDED" : "LOGIN_OTP_INCORRECT",
        message: consume
          ? "Too many incorrect codes. Please start sign-in again."
          : "Incorrect login code.",
        attemptsRemaining: Math.max(maxLoginOtpAttempts - nextAttempts, 0),
      });
    }

    const verifiedAt = Math.floor(Date.now() / 1000);
    const customToken = await adminAuth.createCustomToken(
      session.firebase_uid,
      {
        splitverseOtpVerified: true,
        splitverseOtpVerifiedAt: verifiedAt,
        splitverseLoginSessionId: session.id,
      },
    );

    await client.query(
      `UPDATE email_login_otp_sessions SET consumed_at = NOW() WHERE id = $1;`,
      [session.id],
    );
    await client.query("COMMIT");

    return res.json({
      verified: true,
      customToken,
      email: session.email,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);

    if (sendValidationError(res, error)) {
      return;
    }

    console.error("Verify login OTP failed:", error);
    return res.status(500).json({
      code: "LOGIN_OTP_VERIFY_FAILED",
      message: "Could not verify the login code. Please try again.",
    });
  } finally {
    client.release();
  }
});

router.post("/password-reset/request", async (req, res) => {
  try {
    assertOtpPepperConfigured(passwordResetOtpPepper, "Password reset");
    const { email } = parseRequestBody(passwordResetRequestSchema, req.body);

    if (!isEmailConfigured()) {
      return res.status(503).json({
        message:
          "Password reset email delivery is not configured. Add Brevo SMTP settings in server/.env.",
      });
    }

    let firebaseUser;

    try {
      firebaseUser = await adminAuth.getUserByEmail(email);
    } catch (error) {
      if (getFirebaseAdminErrorCode(error) === "auth/user-not-found") {
        return res.json({
          message:
            "If this email has a SplitVerse account, a password reset code has been sent.",
          expiresInSeconds: Math.floor(passwordResetOtpExpiryMs / 1000),
        });
      }

      throw error;
    }

    const requestCountResult = await db.query(
      `
      SELECT COUNT(*)::int AS request_count
      FROM password_reset_otps
      WHERE LOWER(email) = LOWER($1)
      AND created_at >= NOW() - ($2::int * INTERVAL '1 minute');
      `,
      [email, passwordResetOtpWindowMinutes],
    );
    const requestCount = Number(requestCountResult.rows[0]?.request_count ?? 0);

    if (requestCount >= passwordResetOtpMaxRequests) {
      return res.status(429).json({
        message: "Too many password reset requests. Please try again later.",
      });
    }

    const otp = createPasswordResetOtp();
    const otpHash = hashPasswordResetOtp(otp, firebaseUser.uid, email);
    const expiresAt = new Date(Date.now() + passwordResetOtpExpiryMs);
    const emailStatus = await sendPasswordResetOtpEmail({ email, otp });

    if (emailStatus !== "sent") {
      return res.status(503).json({
        message:
          emailStatus === "not_configured"
            ? "Password reset email delivery is not configured. Add Brevo SMTP settings in server/.env."
            : "Could not send the password reset email. Please try again.",
      });
    }

    await db.query(
      `
      WITH consume_previous_codes AS (
        UPDATE password_reset_otps
        SET consumed_at = NOW()
        WHERE LOWER(email) = LOWER($1)
        AND consumed_at IS NULL
        RETURNING id
      )
      INSERT INTO password_reset_otps (
        email,
        firebase_uid,
        otp_hash,
        expires_at
      )
      VALUES ($1, $2, $3, $4);
      `,
      [email, firebaseUser.uid, otpHash, expiresAt],
    );

    return res.status(201).json({
      message:
        "Password reset code sent. Check your email inbox or spam folder.",
      expiresInSeconds: Math.floor(passwordResetOtpExpiryMs / 1000),
    });
  } catch (error) {
    if (sendValidationError(res, error)) {
      return;
    }

    console.error("Request password reset failed:", error);

    return res.status(500).json({
      message: "Failed to request password reset",
    });
  }
});

router.post("/password-reset/confirm", async (req, res) => {
  const client = await db.connect();

  try {
    assertOtpPepperConfigured(passwordResetOtpPepper, "Password reset");
    const { email, otp, password } = parseRequestBody(
      passwordResetConfirmSchema,
      req.body,
    );

    await client.query("BEGIN");

    const otpResult = await client.query(
      `
      SELECT
        id,
        email,
        firebase_uid,
        otp_hash,
        attempts,
        expires_at <= NOW() AS is_expired
      FROM password_reset_otps
      WHERE LOWER(email) = LOWER($1)
      AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE;
      `,
      [email],
    );

    const otpRow = otpResult.rows[0];

    if (!otpRow) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message:
          "Password reset code expired or not found. Request a new code.",
      });
    }

    if (Number(otpRow.attempts) >= passwordResetOtpMaxAttempts) {
      await client.query(
        `
        UPDATE password_reset_otps
        SET consumed_at = NOW()
        WHERE id = $1;
        `,
        [otpRow.id],
      );
      await client.query("COMMIT");

      return res.status(429).json({
        message: "Too many incorrect codes. Request a new password reset code.",
      });
    }

    if (otpRow.is_expired) {
      await client.query(
        `
        UPDATE password_reset_otps
        SET consumed_at = NOW()
        WHERE id = $1;
        `,
        [otpRow.id],
      );
      await client.query("COMMIT");

      return res.status(410).json({
        message: "Password reset code expired. Request a new code.",
      });
    }

    const expectedHash = hashPasswordResetOtp(otp, otpRow.firebase_uid, email);
    const matches = timingSafeEqualHex(expectedHash, otpRow.otp_hash);

    if (!matches) {
      await client.query(
        `
        UPDATE password_reset_otps
        SET attempts = attempts + 1
        WHERE id = $1;
        `,
        [otpRow.id],
      );
      await client.query("COMMIT");

      return res.status(401).json({
        message: "Incorrect password reset code",
      });
    }

    await adminAuth.updateUser(otpRow.firebase_uid, { password });
    await adminAuth
      .revokeRefreshTokens(otpRow.firebase_uid)
      .catch(() => undefined);

    await client.query(
      `
      UPDATE password_reset_otps
      SET consumed_at = NOW()
      WHERE id = $1;
      `,
      [otpRow.id],
    );
    await client.query("COMMIT");

    return res.json({
      message: "Password changed successfully. You can now log in again.",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);

    if (sendValidationError(res, error)) {
      return;
    }

    console.error("Confirm password reset failed:", error);

    return res.status(500).json({
      message: "Failed to reset password",
    });
  } finally {
    client.release();
  }
});

router.post(
  "/sync-user",
  verifyFirebaseCredentialToken,
  async (req: AuthRequest, res) => {
    try {
      const {
        username: requestedUsername,
        requireUsername,
        deferUsernameSetup,
      } = parseRequestBody(syncUserSchema, req.body ?? {});
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const firebaseUid = firebaseUser.uid;
      const email = firebaseUser.email;

      if (!email) {
        return res.status(400).json({
          message: "Firebase user email is missing",
        });
      }

      const name = firebaseUser.name || email.split("@")[0];
      const photoUrl = firebaseUser.picture || null;
      const provider = firebaseUser.firebase?.sign_in_provider || "unknown";
      const existingUserResult = await db.query<{ id: string; username: string | null }>(
        `SELECT id, username FROM users WHERE firebase_uid = $1 LIMIT 1;`,
        [firebaseUid],
      );
      const existingUser = existingUserResult.rows[0];

      if (!existingUser?.username && !requestedUsername && requireUsername) {
        return res.status(400).json({
          code: "USERNAME_REQUIRED",
          message:
            "Choose your permanent username before creating your account.",
        });
      }

      const canDeferUsernameSetup =
        deferUsernameSetup &&
        ["google", "google.com"].includes(String(provider || ""));
      const username =
        existingUser?.username ||
        requestedUsername ||
        (canDeferUsernameSetup
          ? null
          : await generateAvailableUsername(
              buildUsernameBase(name, email),
              existingUser?.id ?? null,
            ));

      const result = await db.query(
        `
      INSERT INTO users (
        firebase_uid,
        name,
        email,
        photo_url,
        provider,
        username,
        avatar_mode,
        app_currency,
        app_language
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'photo', 'INR', 'en')
      ON CONFLICT (firebase_uid)
      DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        photo_url = EXCLUDED.photo_url,
        provider = EXCLUDED.provider,
        updated_at = NOW()
      RETURNING
        *,
        (wallet_pin_hash IS NOT NULL) AS has_wallet_pin,
        CASE
          WHEN avatar_mode = 'initials' THEN NULL
          ELSE COALESCE(profile_photo_url, photo_url)
        END AS display_photo_url;
      `,
        [firebaseUid, name, email, photoUrl, provider, username],
      );

      return res.json({
        message: "User synced successfully",
        user: result.rows[0],
      });
    } catch (error) {
      if (sendValidationError(res, error)) {
        return;
      }

      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        String((error as { code?: unknown }).code) === "23505"
      ) {
        return res.status(409).json({
          code: "USERNAME_TAKEN",
          message: "That username is already taken.",
        });
      }

      console.error("Sync user failed:", error);

      return res.status(500).json({
        message: "Failed to sync user",
      });
    }
  },
);

router.get("/me", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const result = await db.query(
      `
      SELECT
        id,
        firebase_uid,
        name,
        username,
        email,
        photo_url,
        profile_photo_url,
        avatar_mode,
        app_currency,
        app_language,
        (wallet_pin_hash IS NOT NULL) AS has_wallet_pin,
        CASE
          WHEN avatar_mode = 'initials' THEN NULL
          ELSE COALESCE(profile_photo_url, photo_url)
        END AS display_photo_url,
        provider,
        created_at,
        updated_at
      FROM users
      WHERE firebase_uid = $1;
      `,
      [firebaseUser.uid],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found in database",
      });
    }

    return res.json({
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Get current user failed:", error);

    return res.status(500).json({
      message: "Failed to get current user",
    });
  }
});

router.post(
  "/profile-photo",
  verifyFirebaseToken,
  (req, res, next) => {
    profilePhotoUpload.single("photo")(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        return res.status(400).json({
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "Profile photo must be 3 MB or smaller"
              : "Could not upload profile photo",
        });
      }

      if (error) {
        return res.status(400).json({
          message:
            error instanceof Error
              ? error.message
              : "Could not upload profile photo",
        });
      }

      return next();
    });
  },
  async (req: AuthRequest, res) => {
    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const file = req.file;

      if (!file) {
        return res.status(400).json({
          message: "Choose a profile photo to upload",
        });
      }

      const detectedMimeType = detectProfilePhotoMimeType(file.buffer);

      if (
        !detectedMimeType ||
        !allowedProfilePhotoMimeTypes.has(detectedMimeType)
      ) {
        return res.status(400).json({
          message:
            "The selected file is not a valid JPG, PNG, WEBP, or GIF image",
        });
      }

      file.mimetype = detectedMimeType;
      const profilePhotoUrl = await uploadProfilePhotoToCloudinary(
        file,
        firebaseUser.uid,
      );
      const result = await db.query(
        `
        UPDATE users
        SET
          avatar_mode = 'photo',
          profile_photo_url = $2,
          updated_at = NOW()
        WHERE firebase_uid = $1
        RETURNING
          id,
          firebase_uid,
          name,
          email,
          photo_url,
          profile_photo_url,
          avatar_mode,
          app_currency,
          app_language,
          (wallet_pin_hash IS NOT NULL) AS has_wallet_pin,
          CASE
            WHEN avatar_mode = 'initials' THEN NULL
            ELSE COALESCE(profile_photo_url, photo_url)
          END AS display_photo_url,
          provider,
          created_at,
          updated_at;
        `,
        [firebaseUser.uid, profilePhotoUrl],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "User not found in database",
        });
      }

      return res.status(201).json({
        message: "Profile photo uploaded",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Upload profile photo failed:", error);

      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : 500;

      const safeStatusCode =
        Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 600
          ? statusCode
          : 500;

      return res.status(safeStatusCode).json({
        message:
          safeStatusCode >= 500
            ? "Profile photo upload is temporarily unavailable. Please try again."
            : error instanceof Error
              ? error.message
              : "Failed to upload profile photo",
      });
    }
  },
);


router.post(
  "/profile/identity-change/request",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      assertLoginOtpConfigured();
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { field, value } = parseRequestBody(
        profileIdentityChangeRequestSchema,
        req.body,
      );
      const userResult = await db.query<{
        id: string;
        name: string | null;
        email: string;
      }>(
        `
        SELECT id, name, email
        FROM users
        WHERE firebase_uid = $1
        LIMIT 1;
        `,
        [firebaseUser.uid],
      );
      const currentUser = userResult.rows[0];

      if (!currentUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      let pendingValue = value.trim();

      if (field === "name") {
        if (pendingValue.length < 2 || pendingValue.length > 80) {
          return res.status(400).json({
            message: "Name must be between 2 and 80 characters.",
          });
        }

        if (pendingValue === String(currentUser.name || "").trim()) {
          return res.status(400).json({
            message: "Enter a different name before requesting verification.",
          });
        }
      } else {
        const parsedEmail = z
          .string()
          .trim()
          .email("Enter a valid email address")
          .max(254, "Email address is too long")
          .safeParse(pendingValue.toLowerCase());

        if (!parsedEmail.success) {
          return res.status(400).json({
            message: parsedEmail.error.issues[0]?.message || "Enter a valid email address",
          });
        }

        pendingValue = parsedEmail.data;

        if (pendingValue === currentUser.email.toLowerCase()) {
          return res.status(400).json({
            message: "Enter a different email address before requesting verification.",
          });
        }

        const emailInUse = await db.query(
          `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1;`,
          [pendingValue],
        );

        if (emailInUse.rows.length > 0) {
          return res.status(409).json({
            message: "That email address is already linked to another account.",
          });
        }
      }

      const requestCountResult = await db.query<{ request_count: number }>(
        `
        SELECT COUNT(*)::int AS request_count
        FROM profile_identity_change_otps
        WHERE user_id = $1
        AND created_at > NOW() - ($2::int * INTERVAL '1 minute');
        `,
        [currentUser.id, profileIdentityOtpRequestWindowMinutes],
      );

      if (
        Number(requestCountResult.rows[0]?.request_count || 0) >=
        profileIdentityOtpMaxRequests
      ) {
        return res.status(429).json({
          code: "PROFILE_IDENTITY_OTP_RATE_LIMITED",
          message: "Too many verification requests. Please try again later.",
        });
      }

      const requestId = crypto.randomUUID();
      const otp = createProfileIdentityOtp();
      const expiresAt = new Date(Date.now() + profileIdentityOtpExpiryMs);
      const emailStatus = await sendProfileIdentityOtpEmail({
        currentEmail: currentUser.email,
        otp,
        changeType: field,
      });

      if (emailStatus !== "sent") {
        return res.status(503).json({
          code: "PROFILE_IDENTITY_OTP_DELIVERY_FAILED",
          message:
            emailStatus === "not_configured"
              ? "Email verification is temporarily unavailable."
              : "Could not send the verification code. Please try again.",
        });
      }

      const client = await db.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          `
          UPDATE profile_identity_change_otps
          SET consumed_at = NOW()
          WHERE user_id = $1
          AND change_type = $2
          AND consumed_at IS NULL;
          `,
          [currentUser.id, field],
        );
        await client.query(
          `
          INSERT INTO profile_identity_change_otps (
            id,
            user_id,
            change_type,
            pending_value,
            otp_hash,
            expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6);
          `,
          [
            requestId,
            currentUser.id,
            field,
            pendingValue,
            hashProfileIdentityOtp(otp, requestId, currentUser.id, field),
            expiresAt,
          ],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }

      return res.status(201).json({
        requestId,
        field,
        currentEmailHint: maskEmailAddress(currentUser.email),
        expiresAt: expiresAt.toISOString(),
        message: "Verification code sent to your current registered email.",
      });
    } catch (error) {
      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Request profile identity change failed:", error);
      return res.status(500).json({
        message: "Could not request the account change verification code.",
      });
    }
  },
);

router.post(
  "/profile/identity-change/confirm",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();
    let firebaseUidForRollback = "";
    let firebaseRollback:
      | { field: "name"; oldValue: string | null }
      | { field: "email"; oldValue: string }
      | null = null;

    try {
      assertLoginOtpConfigured();
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      firebaseUidForRollback = firebaseUser.uid;

      const { requestId, otp } = parseRequestBody(
        profileIdentityChangeConfirmSchema,
        req.body,
      );

      await client.query("BEGIN");
      const requestResult = await client.query<{
        id: string;
        user_id: string;
        firebase_uid: string;
        current_name: string | null;
        current_email: string;
        change_type: "name" | "email";
        pending_value: string;
        otp_hash: string;
        attempts: number;
        expires_at: Date | string;
        consumed_at: Date | string | null;
      }>(
        `
        SELECT
          request.id,
          request.user_id,
          account.firebase_uid,
          account.name AS current_name,
          account.email AS current_email,
          request.change_type,
          request.pending_value,
          request.otp_hash,
          request.attempts,
          request.expires_at,
          request.consumed_at
        FROM profile_identity_change_otps request
        JOIN users account ON account.id = request.user_id
        WHERE request.id = $1
        AND account.firebase_uid = $2
        FOR UPDATE;
        `,
        [requestId, firebaseUser.uid],
      );
      const changeRequest = requestResult.rows[0];

      if (!changeRequest || changeRequest.consumed_at) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "This verification request is no longer available.",
        });
      }

      if (new Date(changeRequest.expires_at).getTime() <= Date.now()) {
        await client.query(
          `UPDATE profile_identity_change_otps SET consumed_at = NOW() WHERE id = $1;`,
          [requestId],
        );
        await client.query("COMMIT");
        return res.status(410).json({
          message: "This verification code has expired. Request a new code.",
        });
      }

      if (Number(changeRequest.attempts) >= profileIdentityOtpMaxAttempts) {
        await client.query(
          `UPDATE profile_identity_change_otps SET consumed_at = NOW() WHERE id = $1;`,
          [requestId],
        );
        await client.query("COMMIT");
        return res.status(429).json({
          message: "Too many incorrect verification attempts. Request a new code.",
        });
      }

      const expectedHash = hashProfileIdentityOtp(
        otp,
        requestId,
        changeRequest.user_id,
        changeRequest.change_type,
      );

      if (!timingSafeEqualHex(expectedHash, changeRequest.otp_hash)) {
        const nextAttempts = Number(changeRequest.attempts) + 1;
        await client.query(
          `
          UPDATE profile_identity_change_otps
          SET attempts = $2,
              consumed_at = CASE WHEN $2 >= $3 THEN NOW() ELSE consumed_at END
          WHERE id = $1;
          `,
          [requestId, nextAttempts, profileIdentityOtpMaxAttempts],
        );
        await client.query("COMMIT");
        return res.status(401).json({
          message:
            nextAttempts >= profileIdentityOtpMaxAttempts
              ? "Too many incorrect attempts. Request a new verification code."
              : "Incorrect verification code.",
        });
      }

      if (changeRequest.change_type === "name") {
        firebaseRollback = {
          field: "name",
          oldValue: changeRequest.current_name,
        };
        await adminAuth.updateUser(changeRequest.firebase_uid, {
          displayName: changeRequest.pending_value,
        });
        await client.query(
          `
          UPDATE users
          SET name = $2, updated_at = NOW()
          WHERE id = $1;
          `,
          [changeRequest.user_id, changeRequest.pending_value],
        );
        await client.query(
          `
          UPDATE split_room_members
          SET display_name = $2
          WHERE user_id = $1;
          `,
          [changeRequest.user_id, changeRequest.pending_value],
        );
      } else {
        const newEmail = changeRequest.pending_value.toLowerCase();
        const emailInUse = await client.query(
          `
          SELECT 1
          FROM users
          WHERE LOWER(email) = LOWER($1)
          AND id <> $2
          LIMIT 1;
          `,
          [newEmail, changeRequest.user_id],
        );

        if (emailInUse.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            message: "That email address is already linked to another account.",
          });
        }

        firebaseRollback = {
          field: "email",
          oldValue: changeRequest.current_email,
        };
        await adminAuth.updateUser(changeRequest.firebase_uid, {
          email: newEmail,
          emailVerified: false,
        });
        await client.query(
          `
          UPDATE users
          SET email = $2, updated_at = NOW()
          WHERE id = $1;
          `,
          [changeRequest.user_id, newEmail],
        );
        await client.query(
          `
          UPDATE friend_requests
          SET recipient_email = $2
          WHERE recipient_user_id = $1
          OR LOWER(recipient_email) = LOWER($3);
          `,
          [changeRequest.user_id, newEmail, changeRequest.current_email],
        );
        await client.query(
          `
          UPDATE split_room_members
          SET email = $2
          WHERE user_id = $1
          OR LOWER(COALESCE(email, '')) = LOWER($3);
          `,
          [changeRequest.user_id, newEmail, changeRequest.current_email],
        );
      }

      await client.query(
        `UPDATE profile_identity_change_otps SET consumed_at = NOW() WHERE id = $1;`,
        [requestId],
      );
      await client.query("COMMIT");

      const updatedUserResult = await db.query(
        `
        SELECT
          id,
          firebase_uid,
          name,
          username,
          email,
          photo_url,
          profile_photo_url,
          avatar_mode,
          app_currency,
          app_language,
          (wallet_pin_hash IS NOT NULL) AS has_wallet_pin,
          CASE
            WHEN avatar_mode = 'initials' THEN NULL
            ELSE COALESCE(profile_photo_url, photo_url)
          END AS display_photo_url,
          provider,
          created_at,
          updated_at
        FROM users
        WHERE id = $1;
        `,
        [changeRequest.user_id],
      );

      return res.json({
        message:
          changeRequest.change_type === "name"
            ? "Account name updated successfully."
            : "Registered email updated successfully.",
        field: changeRequest.change_type,
        user: updatedUserResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);

      if (firebaseRollback) {
        if (firebaseRollback.field === "name") {
          await adminAuth
            .updateUser(firebaseUidForRollback, {
              displayName: firebaseRollback.oldValue || undefined,
            })
            .catch(() => undefined);
        } else {
          await adminAuth
            .updateUser(firebaseUidForRollback, {
              email: firebaseRollback.oldValue,
            })
            .catch(() => undefined);
        }
      }

      if (sendValidationError(res, error)) {
        return;
      }

      const firebaseCode =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";

      if (firebaseCode === "auth/email-already-exists") {
        return res.status(409).json({
          message: "That email address is already linked to another account.",
        });
      }

      console.error("Confirm profile identity change failed:", error);
      return res.status(500).json({
        message: "Could not complete the account identity change.",
      });
    } finally {
      client.release();
    }
  },
);

router.patch("/profile", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const avatarModeSupplied = hasOwnBodyField(
      req.body,
      "avatarMode",
      "avatar_mode",
    );
    const profilePhotoSupplied = hasOwnBodyField(
      req.body,
      "profilePhotoUrl",
      "profile_photo_url",
    );
    const appCurrencySupplied = hasOwnBodyField(
      req.body,
      "appCurrency",
      "app_currency",
    );
    const appLanguageSupplied = hasOwnBodyField(
      req.body,
      "appLanguage",
      "app_language",
    );
    const usernameSupplied = hasOwnBodyField(req.body, "username");

    if (usernameSupplied) {
      return res.status(403).json({
        code: "USERNAME_IMMUTABLE",
        message:
          "Your SplitVerse username is permanent and cannot be changed after signup.",
      });
    }

    const avatarMode = avatarModeSupplied
      ? normalizeAvatarMode(req.body?.avatarMode ?? req.body?.avatar_mode)
      : null;
    const rawProfilePhotoUrl =
      req.body?.profilePhotoUrl ?? req.body?.profile_photo_url;
    const profilePhotoUrl = profilePhotoSupplied
      ? normalizeProfilePhotoUrl(rawProfilePhotoUrl)
      : null;
    const appCurrency = appCurrencySupplied
      ? normalizeAppCurrency(req.body?.appCurrency ?? req.body?.app_currency)
      : null;
    const appLanguage = appLanguageSupplied
      ? normalizeAppLanguage(req.body?.appLanguage ?? req.body?.app_language)
      : null;
    if (profilePhotoSupplied && rawProfilePhotoUrl && !profilePhotoUrl) {
      return res.status(400).json({
        message: "Profile photo must be a valid http or https image URL",
      });
    }

    if (appCurrencySupplied && !appCurrency) {
      return res.status(400).json({
        message: "Unsupported application currency",
      });
    }

    if (appLanguageSupplied && !appLanguage) {
      return res.status(400).json({
        message: "Unsupported application language",
      });
    }

    const result = await db.query(
      `
      UPDATE users
      SET
        avatar_mode = COALESCE($2::text, avatar_mode),
        profile_photo_url = CASE
          WHEN $3::boolean THEN $4::text
          ELSE profile_photo_url
        END,
        app_currency = COALESCE($5::text, app_currency),
        app_language = COALESCE($6::text, app_language),
        updated_at = NOW()
      WHERE firebase_uid = $1
      RETURNING
        id,
        firebase_uid,
        name,
        username,
        email,
        photo_url,
        profile_photo_url,
        avatar_mode,
        app_currency,
        app_language,
        (wallet_pin_hash IS NOT NULL) AS has_wallet_pin,
        CASE
          WHEN avatar_mode = 'initials' THEN NULL
          ELSE COALESCE(profile_photo_url, photo_url)
        END AS display_photo_url,
        provider,
        created_at,
        updated_at;
      `,
      [
        firebaseUser.uid,
        avatarMode,
        profilePhotoSupplied,
        profilePhotoUrl,
        appCurrency,
        appLanguage,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found in database",
      });
    }

    return res.json({
      message: "Profile settings updated",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Update profile settings failed:", error);

    return res.status(500).json({
      message: "Failed to update profile settings",
    });
  }
});

router.post(
  "/wallet-pin",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { pin, currentPin, username: requestedUsername } =
        parseRequestBody(walletPinSchema, req.body);

      await client.query("BEGIN");

      const userResult = await client.query<{
        id: string;
        wallet_pin_hash: string | null;
        username: string | null;
        provider: string | null;
      }>(
        `
      SELECT id, wallet_pin_hash, username, provider
      FROM users
      WHERE firebase_uid = $1
      FOR UPDATE;
      `,
        [firebaseUser.uid],
      );

      const user = userResult.rows[0];

      if (!user) {
        await client.query("ROLLBACK");

        return res.status(404).json({ message: "User not found in database" });
      }

      const isGoogleUser = ["google", "google.com"].includes(
        String(user.provider || ""),
      );

      if (!user.username && isGoogleUser && !requestedUsername) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          code: "USERNAME_REQUIRED",
          message: "Choose your permanent username to complete Google signup.",
        });
      }

      if (user.username && requestedUsername && requestedUsername !== user.username) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          code: "USERNAME_IMMUTABLE",
          message: "Your SplitVerse username is permanent and cannot be changed.",
        });
      }

      if (!user.username && requestedUsername && !isGoogleUser) {
        await client.query("ROLLBACK");

        return res.status(403).json({
          code: "USERNAME_SETUP_NOT_ALLOWED",
          message: "Username setup through this step is available only for Google signup.",
        });
      }

      if (user.wallet_pin_hash) {
        if (!currentPin) {
          await client.query("ROLLBACK");

          return res
            .status(400)
            .json({ message: "Old wallet PIN is required" });
        }

        try {
          await verifyWalletPinForUser(client, user.id, currentPin);
        } catch (pinError) {
          await client.query("COMMIT");

          if (sendWalletPinError(res, pinError)) {
            return;
          }

          throw pinError;
        }

        const sameAsOldPin = await argon2.verify(user.wallet_pin_hash, pin);

        if (sameAsOldPin) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            message: "New wallet PIN cannot be the same as the old PIN",
          });
        }
      }

      const nextHash = await argon2.hash(pin);

      await client.query(
        `
      UPDATE users
      SET
        username = COALESCE(username, $3),
        wallet_pin_hash = $2,
        wallet_pin_failed_attempts = 0,
        wallet_pin_locked_until = NULL,
        wallet_pin_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = $1;
      `,
        [user.id, nextHash, requestedUsername ?? null],
      );

      const updatedUser = await getAuthUserProfile(client, user.id);

      await client.query("COMMIT");

      return res.json({
        message: user.wallet_pin_hash
          ? "Wallet PIN changed successfully"
          : "Wallet PIN saved",
        user: updatedUser,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);

      if (sendValidationError(res, error) || sendWalletPinError(res, error)) {
        return;
      }

      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        String((error as { code?: unknown }).code) === "23505"
      ) {
        return res.status(409).json({
          code: "USERNAME_TAKEN",
          message: "That username is already taken. Choose another one.",
        });
      }

      console.error("Save wallet PIN failed:", error);

      return res.status(500).json({ message: "Failed to save wallet PIN" });
    } finally {
      client.release();
    }
  },
);

router.post(
  "/wallet-pin/verify",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { pin } = parseRequestBody(verifyWalletPinSchema, req.body);

      await client.query("BEGIN");

      const userResult = await client.query<{
        id: string;
        wallet_pin_hash: string | null;
        wallet_pin_failed_attempts: number;
        wallet_pin_locked_until: Date | string | null;
      }>(
        `
      SELECT
        id,
        wallet_pin_hash,
        wallet_pin_failed_attempts,
        wallet_pin_locked_until
      FROM users
      WHERE firebase_uid = $1
      FOR UPDATE;
      `,
        [firebaseUser.uid],
      );

      const user = userResult.rows[0];

      if (!user) {
        await client.query("ROLLBACK");

        return res.status(404).json({ message: "User not found in database" });
      }

      if (!user.wallet_pin_hash) {
        await client.query("ROLLBACK");

        return res.status(400).json({ message: "Set a wallet PIN first" });
      }

      const lockedUntil = user.wallet_pin_locked_until
        ? new Date(user.wallet_pin_locked_until).getTime()
        : 0;

      if (lockedUntil > Date.now()) {
        await client.query("ROLLBACK");

        return res.status(423).json({
          message: "Wallet PIN is temporarily locked. Try again later.",
          lockedUntil: new Date(lockedUntil).toISOString(),
        });
      }

      const pinMatches = await argon2.verify(user.wallet_pin_hash, pin);

      if (!pinMatches) {
        const nextAttempts = Number(user.wallet_pin_failed_attempts || 0) + 1;
        const shouldLock = nextAttempts >= walletPinMaxFailedAttempts;
        const lockedUntilValue = shouldLock
          ? new Date(Date.now() + walletPinLockMs)
          : null;

        await client.query(
          `
        UPDATE users
        SET
          wallet_pin_failed_attempts = $2,
          wallet_pin_locked_until = $3,
          updated_at = NOW()
        WHERE id = $1;
        `,
          [user.id, nextAttempts, lockedUntilValue],
        );

        await client.query("COMMIT");

        return res.status(401).json({
          message: shouldLock
            ? "Too many wrong wallet PIN attempts. Wallet PIN is temporarily locked."
            : "Incorrect wallet PIN",
          attemptsRemaining: Math.max(
            walletPinMaxFailedAttempts - nextAttempts,
            0,
          ),
          lockedUntil: lockedUntilValue?.toISOString(),
        });
      }

      await client.query(
        `
      UPDATE users
      SET
        wallet_pin_failed_attempts = 0,
        wallet_pin_locked_until = NULL,
        updated_at = NOW()
      WHERE id = $1;
      `,
        [user.id],
      );

      await client.query("COMMIT");

      return res.json({ verified: true });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);

      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Verify wallet PIN failed:", error);

      return res.status(500).json({ message: "Failed to verify wallet PIN" });
    } finally {
      client.release();
    }
  },
);

router.post(
  "/wallet-pin/reset-otp/request",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      assertOtpPepperConfigured(walletPinOtpPepper, "Wallet PIN reset");
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      parseRequestBody(walletPinResetOtpRequestSchema, req.body);

      const userResult = await client.query<{
        id: string;
        name: string | null;
        email: string;
        wallet_pin_hash: string | null;
      }>(
        `
        SELECT id, name, email, wallet_pin_hash
        FROM users
        WHERE firebase_uid = $1;
        `,
        [firebaseUser.uid],
      );

      const user = userResult.rows[0];

      if (!user) {
        return res.status(404).json({ message: "User not found in database" });
      }

      if (!user.wallet_pin_hash) {
        return res.status(400).json({
          message: "Set your wallet PIN first before using reset.",
        });
      }

      await client.query(
        `
        UPDATE wallet_pin_reset_otps
        SET consumed_at = NOW()
        WHERE user_id = $1
        AND consumed_at IS NULL
        AND expires_at <= NOW();
        `,
        [user.id],
      );

      const requestCountResult = await client.query<{ request_count: number }>(
        `
        SELECT COUNT(*)::int AS request_count
        FROM wallet_pin_reset_otps
        WHERE user_id = $1
        AND created_at > NOW() - ($2::int * INTERVAL '1 minute');
        `,
        [user.id, walletPinResetOtpWindowMinutes],
      );

      if (
        Number(requestCountResult.rows[0].request_count) >=
        walletPinResetOtpMaxRequests
      ) {
        return res.status(429).json({
          message: "Too many reset OTP requests. Please try again later.",
        });
      }

      const otp = createWalletPinResetOtp();
      const emailStatus = await sendWalletPinResetOtpEmail({
        email: user.email,
        name: user.name,
        otp,
      });

      if (emailStatus !== "sent") {
        return res.status(503).json({
          message:
            emailStatus === "not_configured"
              ? "Email OTP delivery is not configured. Add Brevo SMTP settings in server/.env."
              : "Could not send wallet PIN reset OTP. Please try again.",
        });
      }

      await client.query("BEGIN");

      await client.query(
        `
        UPDATE wallet_pin_reset_otps
        SET consumed_at = NOW()
        WHERE user_id = $1
        AND consumed_at IS NULL;
        `,
        [user.id],
      );

      await client.query(
        `
        INSERT INTO wallet_pin_reset_otps (
          user_id,
          otp_hash,
          expires_at
        )
        VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 millisecond'));
        `,
        [
          user.id,
          hashWalletPinResetOtp(otp, user.id),
          walletPinResetOtpExpiryMs,
        ],
      );

      await client.query("COMMIT");

      return res.status(201).json({
        message: "Wallet PIN reset OTP sent to your registered email.",
        expiresInSeconds: Math.floor(walletPinResetOtpExpiryMs / 1000),
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);

      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Request wallet PIN reset OTP failed:", error);

      return res.status(500).json({
        message: "Failed to request wallet PIN reset OTP",
      });
    } finally {
      client.release();
    }
  },
);

router.post(
  "/wallet-pin/reset",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      assertOtpPepperConfigured(walletPinOtpPepper, "Wallet PIN reset");
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { otp, pin } = parseRequestBody(walletPinResetSchema, req.body);

      await client.query("BEGIN");

      const userResult = await client.query<{
        id: string;
        wallet_pin_hash: string | null;
      }>(
        `
        SELECT id, wallet_pin_hash
        FROM users
        WHERE firebase_uid = $1
        FOR UPDATE;
        `,
        [firebaseUser.uid],
      );

      const user = userResult.rows[0];

      if (!user) {
        await client.query("ROLLBACK");

        return res.status(404).json({ message: "User not found in database" });
      }

      const otpResult = await client.query<{
        id: string;
        otp_hash: string;
        expires_at: Date | string;
        failed_attempts: number;
        is_expired: boolean;
      }>(
        `
        SELECT
          id,
          otp_hash,
          expires_at,
          failed_attempts,
          expires_at <= NOW() AS is_expired
        FROM wallet_pin_reset_otps
        WHERE user_id = $1
        AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE;
        `,
        [user.id],
      );

      const otpRow = otpResult.rows[0];

      if (!otpRow) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "Reset OTP expired. Please request a new OTP.",
        });
      }

      if (otpRow.is_expired) {
        await client.query(
          `UPDATE wallet_pin_reset_otps SET consumed_at = NOW() WHERE id = $1;`,
          [otpRow.id],
        );
        await client.query("COMMIT");

        return res.status(410).json({
          message: "Reset OTP expired. Please request a new OTP.",
        });
      }

      if (Number(otpRow.failed_attempts) >= walletPinResetOtpMaxAttempts) {
        await client.query("ROLLBACK");

        return res.status(423).json({
          message: "Too many wrong OTP attempts. Please request a new OTP.",
        });
      }

      const submittedOtpHash = hashWalletPinResetOtp(otp, user.id);
      const otpMatches = timingSafeEqualHex(otpRow.otp_hash, submittedOtpHash);

      if (!otpMatches) {
        const nextAttempts = Number(otpRow.failed_attempts || 0) + 1;
        await client.query(
          `
          UPDATE wallet_pin_reset_otps
          SET failed_attempts = $2
          WHERE id = $1;
          `,
          [otpRow.id, nextAttempts],
        );
        await client.query("COMMIT");

        return res
          .status(nextAttempts >= walletPinResetOtpMaxAttempts ? 423 : 401)
          .json({
            message:
              nextAttempts >= walletPinResetOtpMaxAttempts
                ? "Too many wrong OTP attempts. Please request a new OTP."
                : "Incorrect OTP",
            attemptsRemaining: Math.max(
              walletPinResetOtpMaxAttempts - nextAttempts,
              0,
            ),
          });
      }

      if (user.wallet_pin_hash) {
        const sameAsOldPin = await argon2.verify(user.wallet_pin_hash, pin);

        if (sameAsOldPin) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            message: "New wallet PIN cannot be the same as the old PIN",
          });
        }
      }

      const nextHash = await argon2.hash(pin);

      await client.query(
        `
        UPDATE users
        SET
          wallet_pin_hash = $2,
          wallet_pin_failed_attempts = 0,
          wallet_pin_locked_until = NULL,
          wallet_pin_updated_at = NOW(),
          updated_at = NOW()
        WHERE id = $1;
        `,
        [user.id, nextHash],
      );

      await client.query(
        `
        UPDATE wallet_pin_reset_otps
        SET consumed_at = NOW()
        WHERE id = $1;
        `,
        [otpRow.id],
      );

      const updatedUser = await getAuthUserProfile(client, user.id);

      await client.query("COMMIT");

      return res.json({
        message: "Wallet PIN reset successfully",
        user: updatedUser,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);

      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Reset wallet PIN failed:", error);

      return res.status(500).json({ message: "Failed to reset wallet PIN" });
    } finally {
      client.release();
    }
  },
);

router.delete(
  "/account",
  verifyFirebaseToken,
  requireRecentAuthentication(),
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      if (req.body?.confirmationText !== deleteAccountConfirmationText) {
        return res.status(400).json({
          message: `Type ${deleteAccountConfirmationText} to delete your account`,
        });
      }

      const userResult = await client.query(
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

      const balanceResult = await client.query(
        `
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN type = 'credit' THEN amount
              WHEN type = 'debit' THEN -amount
              ELSE 0
            END
          )::float,
          0
        ) AS wallet_balance
      FROM wallet_transactions
      WHERE user_id = $1;
      `,
        [dbUserId],
      );
      const walletBalance = Number(balanceResult.rows[0].wallet_balance);

      if (Math.abs(walletBalance) > 0.0001) {
        return res.status(409).json({
          message:
            "Withdraw or settle your wallet balance before deleting your account",
        });
      }

      const pendingDuesResult = await client.query(
        `
      SELECT
        COALESCE(SUM(amount), 0)::float AS pending_dues
      FROM split_room_items item
      INNER JOIN split_room_members member
        ON member.id = item.assigned_member_id
      INNER JOIN split_rooms room
        ON room.id = item.room_id
      WHERE item.collected_at IS NULL
      AND (
        member.user_id = $1
        OR LOWER(COALESCE(member.email, '')) = LOWER($2)
        OR (
          room.owner_user_id = $1
          AND NOT (
            member.user_id = $1
            OR LOWER(COALESCE(member.email, '')) = LOWER($2)
          )
        )
      );
      `,
        [dbUserId, dbUserEmail],
      );
      const pendingDues = Number(pendingDuesResult.rows[0].pending_dues);

      const pendingSettlementsResult = await client.query(
        `
      SELECT COUNT(*)::int AS pending_settlement_count
      FROM settlements
      WHERE status = 'pending'
      AND (from_user_id = $1 OR to_user_id = $1);
      `,
        [dbUserId],
      );
      const pendingSettlementCount = Number(
        pendingSettlementsResult.rows[0].pending_settlement_count,
      );

      if (pendingDues > 0 || pendingSettlementCount > 0) {
        return res.status(409).json({
          message: "Clear all pending dues before deleting your account",
        });
      }

      await client.query("BEGIN");

      await client.query(
        `
      DELETE FROM friend_requests
      WHERE LOWER(recipient_email) = LOWER($1);
      `,
        [dbUserEmail],
      );

      await client.query(
        `
      DELETE FROM split_room_members
      WHERE user_id = $1
      OR LOWER(COALESCE(email, '')) = LOWER($2);
      `,
        [dbUserId, dbUserEmail],
      );

      await client.query(
        `
      DELETE FROM users
      WHERE id = $1;
      `,
        [dbUserId],
      );

      await client.query("COMMIT");

      await adminAuth.deleteUser(firebaseUser.uid);

      return res.json({
        message: "Account deleted successfully",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Delete account failed:", error);

      return res.status(500).json({
        message: "Failed to delete account",
      });
    } finally {
      client.release();
    }
  },
);

export default router;
