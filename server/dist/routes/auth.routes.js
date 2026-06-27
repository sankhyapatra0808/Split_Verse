import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "../config/db.js";
import { adminAuth } from "../config/firebaseAdmin.js";
import { isEmailConfigured, sendTransactionalEmail } from "../utils/email.js";
import { verifyFirebaseToken, } from "../middleware/verifyFirebaseToken.js";
import { parseRequestBody, sendValidationError } from "../middleware/validateRequest.js";
import { sendWalletPinError, verifyWalletPinForUser, } from "../utils/walletPin.js";
const router = express.Router();
const deleteAccountConfirmationText = "/DeleteAccount";
const loginOtpLength = 6;
const loginOtpExpiryMs = 10 * 60 * 1000;
const maxLoginOtpAttempts = 5;
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
const walletPinMaxFailedAttempts = Number(process.env.WALLET_PIN_MAX_FAILED_ATTEMPTS || 5);
const walletPinLockMs = Number(process.env.WALLET_PIN_LOCK_MS || 15 * 60 * 1000);
const walletPinResetOtpLength = 6;
const walletPinResetOtpExpiryMs = Number(process.env.WALLET_PIN_RESET_OTP_EXPIRY_MS || 10 * 60 * 1000);
const walletPinResetOtpMaxAttempts = Number(process.env.WALLET_PIN_RESET_OTP_MAX_ATTEMPTS || 5);
const walletPinResetOtpMaxRequests = Number(process.env.WALLET_PIN_RESET_OTP_MAX_REQUESTS || 3);
const walletPinResetOtpWindowMinutes = Number(process.env.WALLET_PIN_RESET_OTP_WINDOW_MINUTES || 15);
const walletPinOtpPepper = process.env.WALLET_PIN_OTP_PEPPER ||
    process.env.RAZORPAY_WEBHOOK_SECRET ||
    process.env.SETUP_ROUTE_SECRET ||
    "splitverse-local-wallet-pin-otp-pepper";
const passwordResetOtpLength = 6;
const passwordResetOtpExpiryMs = Number(process.env.PASSWORD_RESET_OTP_EXPIRY_MS || 10 * 60 * 1000);
const passwordResetOtpMaxAttempts = Number(process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS || 5);
const passwordResetOtpMaxRequests = Number(process.env.PASSWORD_RESET_OTP_MAX_REQUESTS || 3);
const passwordResetOtpWindowMinutes = Number(process.env.PASSWORD_RESET_OTP_WINDOW_MINUTES || 15);
const passwordResetOtpPepper = process.env.PASSWORD_RESET_OTP_PEPPER ||
    walletPinOtpPepper ||
    "splitverse-local-password-reset-otp-pepper";
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY?.trim();
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
const cloudinaryProfileFolder = process.env.CLOUDINARY_PROFILE_FOLDER?.trim() || "splitverse/profile-photos";
const isCloudinaryConfigured = Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret);
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
})
    .strict();
const verifyWalletPinSchema = z
    .object({
    pin: z.string().trim().regex(/^\d{4,6}$/, walletPinLengthMessage),
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
    .min(6, "Password must be at least 6 characters")
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
const loginOtpSessions = new Map();
function getWalletPinStrengthIssue(pin) {
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
    const increasing = digits.every((digit, index) => index === 0 || digit === digits[index - 1] + 1);
    const decreasing = digits.every((digit, index) => index === 0 || digit === digits[index - 1] - 1);
    if (increasing || decreasing) {
        return "Use a stronger wallet PIN. Sequential digits are too easy to guess.";
    }
    return "";
}
function createWalletPinResetOtp() {
    return crypto
        .randomInt(10 ** (walletPinResetOtpLength - 1), 10 ** walletPinResetOtpLength)
        .toString();
}
function hashWalletPinResetOtp(otp, userId) {
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
function hashPasswordResetOtp(otp, firebaseUid, email) {
    return crypto
        .createHmac("sha256", passwordResetOtpPepper)
        .update(`${firebaseUid}:${email.toLowerCase()}:${otp}`)
        .digest("hex");
}
function getFirebaseAdminErrorCode(error) {
    return typeof error === "object" && error !== null && "code" in error
        ? String(error.code ?? "")
        : "";
}
async function getAuthUserProfile(client, userId) {
    const result = await client.query(`
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
    `, [userId]);
    return result.rows[0] ?? null;
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
async function sendWalletPinResetOtpEmail({ email, otp, name, }) {
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
async function sendPasswordResetOtpEmail({ email, otp, }) {
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
        console.error("Password reset OTP email failed through Brevo SMTP:", emailResult);
        return emailResult.reason;
    }
    return "sent";
}
function cleanupExpiredLoginOtpSessions() {
    const now = Date.now();
    loginOtpSessions.forEach((session, sessionId) => {
        if (session.expiresAt <= now) {
            loginOtpSessions.delete(sessionId);
        }
    });
}
function createLoginOtp() {
    return crypto
        .randomInt(10 ** (loginOtpLength - 1), 10 ** loginOtpLength)
        .toString();
}
function hashLoginOtp(otp) {
    return crypto.createHash("sha256").update(otp).digest("hex");
}
function timingSafeEqualHex(left, right) {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return (leftBuffer.length === rightBuffer.length &&
        crypto.timingSafeEqual(leftBuffer, rightBuffer));
}
function normalizeAvatarMode(value) {
    return value === "initials" ? "initials" : "photo";
}
function normalizeProfilePhotoUrl(value) {
    const photoUrl = String(value ?? "").trim();
    if (!photoUrl) {
        return null;
    }
    try {
        const parsedUrl = new URL(photoUrl);
        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
            return null;
        }
        return parsedUrl.toString().slice(0, 2048);
    }
    catch {
        return null;
    }
}
function normalizeAppCurrency(value) {
    const currency = String(value ?? "")
        .trim()
        .toUpperCase();
    return supportedAppCurrencies.has(currency) ? currency : null;
}
function normalizeAppLanguage(value) {
    const language = String(value ?? "")
        .trim()
        .toLowerCase();
    return supportedAppLanguages.has(language) ? language : null;
}
function hasOwnBodyField(body, ...keys) {
    if (!body || typeof body !== "object") {
        return false;
    }
    return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}
function uploadProfilePhotoToCloudinary(file, userId) {
    if (!isCloudinaryConfigured) {
        throw Object.assign(new Error("Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in server/.env."), { statusCode: 503 });
    }
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream({
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
        }, (error, result) => {
            if (error || !result?.secure_url) {
                reject(error || new Error("Cloudinary did not return a secure URL"));
                return;
            }
            resolve(result.secure_url);
        });
        uploadStream.end(file.buffer);
    });
}
async function sendLoginOtpEmail({ email, otp, }) {
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
router.post("/email-login-otp/request", verifyFirebaseToken, async (req, res) => {
    try {
        cleanupExpiredLoginOtpSessions();
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }
        if (firebaseUser.firebase?.sign_in_provider !== "password") {
            return res.status(400).json({
                message: "OTP login is only available for email and password sign-in",
            });
        }
        if (!firebaseUser.email) {
            return res.status(400).json({
                message: "Firebase user email is missing",
            });
        }
        const otp = createLoginOtp();
        const emailStatus = await sendLoginOtpEmail({
            email: firebaseUser.email,
            otp,
        });
        if (emailStatus !== "sent") {
            return res.status(503).json({
                message: emailStatus === "not_configured"
                    ? "Email OTP delivery is not configured. Add Brevo SMTP settings in server/.env."
                    : "Could not send the login OTP email. Please try again.",
            });
        }
        const sessionId = crypto.randomUUID();
        const expiresAt = Date.now() + loginOtpExpiryMs;
        loginOtpSessions.set(sessionId, {
            firebaseUid: firebaseUser.uid,
            email: firebaseUser.email,
            otpHash: hashLoginOtp(otp),
            expiresAt,
            attempts: 0,
        });
        return res.status(201).json({
            sessionId,
            email: firebaseUser.email,
            expiresAt: new Date(expiresAt).toISOString(),
        });
    }
    catch (error) {
        console.error("Request login OTP failed:", error);
        return res.status(500).json({
            message: "Failed to request login OTP",
        });
    }
});
router.post("/email-login-otp/verify", (req, res) => {
    cleanupExpiredLoginOtpSessions();
    const sessionId = String(req.body?.sessionId ?? "");
    const otp = String(req.body?.otp ?? "").replace(/\D/g, "");
    if (!sessionId || otp.length !== loginOtpLength) {
        return res.status(400).json({
            message: "Enter the 6-digit login code",
        });
    }
    const session = loginOtpSessions.get(sessionId);
    if (!session) {
        return res.status(404).json({
            message: "Login code expired. Please request a new code.",
        });
    }
    if (session.attempts >= maxLoginOtpAttempts) {
        loginOtpSessions.delete(sessionId);
        return res.status(429).json({
            message: "Too many incorrect codes. Please request a new code.",
        });
    }
    const matches = timingSafeEqualHex(hashLoginOtp(otp), session.otpHash);
    if (!matches) {
        session.attempts += 1;
        return res.status(401).json({
            message: "Incorrect login code",
        });
    }
    loginOtpSessions.delete(sessionId);
    return res.json({
        verified: true,
    });
});
router.post("/password-reset/request", async (req, res) => {
    try {
        const { email } = parseRequestBody(passwordResetRequestSchema, req.body);
        if (!isEmailConfigured()) {
            return res.status(503).json({
                message: "Password reset email delivery is not configured. Add Brevo SMTP settings in server/.env.",
            });
        }
        let firebaseUser;
        try {
            firebaseUser = await adminAuth.getUserByEmail(email);
        }
        catch (error) {
            if (getFirebaseAdminErrorCode(error) === "auth/user-not-found") {
                return res.json({
                    message: "If this email has a SplitVerse account, a password reset code has been sent.",
                    expiresInSeconds: Math.floor(passwordResetOtpExpiryMs / 1000),
                });
            }
            throw error;
        }
        const requestCountResult = await db.query(`
      SELECT COUNT(*)::int AS request_count
      FROM password_reset_otps
      WHERE LOWER(email) = LOWER($1)
      AND created_at >= NOW() - ($2::int * INTERVAL '1 minute');
      `, [email, passwordResetOtpWindowMinutes]);
        const requestCount = Number(requestCountResult.rows[0]?.request_count ?? 0);
        if (requestCount >= passwordResetOtpMaxRequests) {
            return res.status(429).json({
                message: "Too many password reset requests. Please try again later.",
            });
        }
        const otp = createPasswordResetOtp();
        const otpHash = hashPasswordResetOtp(otp, firebaseUser.uid, email);
        const expiresAt = new Date(Date.now() + passwordResetOtpExpiryMs);
        await db.query(`
      INSERT INTO password_reset_otps (
        email,
        firebase_uid,
        otp_hash,
        expires_at
      )
      VALUES ($1, $2, $3, $4);
      `, [email, firebaseUser.uid, otpHash, expiresAt]);
        const emailStatus = await sendPasswordResetOtpEmail({ email, otp });
        if (emailStatus !== "sent") {
            return res.status(503).json({
                message: emailStatus === "not_configured"
                    ? "Password reset email delivery is not configured. Add Brevo SMTP settings in server/.env."
                    : "Could not send the password reset email. Please try again.",
            });
        }
        return res.status(201).json({
            message: "Password reset code sent. Check your email inbox or spam folder.",
            expiresInSeconds: Math.floor(passwordResetOtpExpiryMs / 1000),
        });
    }
    catch (error) {
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
        const { email, otp, password } = parseRequestBody(passwordResetConfirmSchema, req.body);
        await client.query("BEGIN");
        const otpResult = await client.query(`
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
      `, [email]);
        const otpRow = otpResult.rows[0];
        if (!otpRow) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Password reset code expired or not found. Request a new code.",
            });
        }
        if (Number(otpRow.attempts) >= passwordResetOtpMaxAttempts) {
            await client.query(`
        UPDATE password_reset_otps
        SET consumed_at = NOW()
        WHERE id = $1;
        `, [otpRow.id]);
            await client.query("COMMIT");
            return res.status(429).json({
                message: "Too many incorrect codes. Request a new password reset code.",
            });
        }
        if (otpRow.is_expired) {
            await client.query(`
        UPDATE password_reset_otps
        SET consumed_at = NOW()
        WHERE id = $1;
        `, [otpRow.id]);
            await client.query("COMMIT");
            return res.status(410).json({
                message: "Password reset code expired. Request a new code.",
            });
        }
        const expectedHash = hashPasswordResetOtp(otp, otpRow.firebase_uid, email);
        const matches = timingSafeEqualHex(expectedHash, otpRow.otp_hash);
        if (!matches) {
            await client.query(`
        UPDATE password_reset_otps
        SET attempts = attempts + 1
        WHERE id = $1;
        `, [otpRow.id]);
            await client.query("COMMIT");
            return res.status(401).json({
                message: "Incorrect password reset code",
            });
        }
        await adminAuth.updateUser(otpRow.firebase_uid, { password });
        await adminAuth.revokeRefreshTokens(otpRow.firebase_uid).catch(() => undefined);
        await client.query(`
      UPDATE password_reset_otps
      SET consumed_at = NOW()
      WHERE id = $1;
      `, [otpRow.id]);
        await client.query("COMMIT");
        return res.json({
            message: "Password changed successfully. You can now log in again.",
        });
    }
    catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (sendValidationError(res, error)) {
            return;
        }
        console.error("Confirm password reset failed:", error);
        return res.status(500).json({
            message: "Failed to reset password",
        });
    }
    finally {
        client.release();
    }
});
router.post("/sync-user", verifyFirebaseToken, async (req, res) => {
    try {
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
        const result = await db.query(`
      INSERT INTO users (
        firebase_uid,
        name,
        email,
        photo_url,
        provider,
        avatar_mode,
        app_currency,
        app_language
      )
      VALUES ($1, $2, $3, $4, $5, 'photo', 'INR', 'en')
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
      `, [firebaseUid, name, email, photoUrl, provider]);
        return res.json({
            message: "User synced successfully",
            user: result.rows[0],
        });
    }
    catch (error) {
        console.error("Sync user failed:", error);
        return res.status(500).json({
            message: "Failed to sync user",
        });
    }
});
router.get("/me", verifyFirebaseToken, async (req, res) => {
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }
        const result = await db.query(`
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
      WHERE firebase_uid = $1;
      `, [firebaseUser.uid]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User not found in database",
            });
        }
        return res.json({
            user: result.rows[0],
        });
    }
    catch (error) {
        console.error("Get current user failed:", error);
        return res.status(500).json({
            message: "Failed to get current user",
        });
    }
});
router.post("/profile-photo", verifyFirebaseToken, (req, res, next) => {
    profilePhotoUpload.single("photo")(req, res, (error) => {
        if (error instanceof multer.MulterError) {
            return res.status(400).json({
                message: error.code === "LIMIT_FILE_SIZE"
                    ? "Profile photo must be 3 MB or smaller"
                    : "Could not upload profile photo",
            });
        }
        if (error) {
            return res.status(400).json({
                message: error instanceof Error
                    ? error.message
                    : "Could not upload profile photo",
            });
        }
        return next();
    });
}, async (req, res) => {
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
        const profilePhotoUrl = await uploadProfilePhotoToCloudinary(file, firebaseUser.uid);
        const result = await db.query(`
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
        `, [firebaseUser.uid, profilePhotoUrl]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User not found in database",
            });
        }
        return res.status(201).json({
            message: "Profile photo uploaded",
            user: result.rows[0],
        });
    }
    catch (error) {
        console.error("Upload profile photo failed:", error);
        const statusCode = typeof error === "object" && error !== null && "statusCode" in error
            ? Number(error.statusCode)
            : 500;
        return res.status(Number.isFinite(statusCode) ? statusCode : 500).json({
            message: error instanceof Error
                ? error.message
                : "Failed to upload profile photo",
        });
    }
});
router.patch("/profile", verifyFirebaseToken, async (req, res) => {
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }
        const avatarModeSupplied = hasOwnBodyField(req.body, "avatarMode", "avatar_mode");
        const profilePhotoSupplied = hasOwnBodyField(req.body, "profilePhotoUrl", "profile_photo_url");
        const appCurrencySupplied = hasOwnBodyField(req.body, "appCurrency", "app_currency");
        const appLanguageSupplied = hasOwnBodyField(req.body, "appLanguage", "app_language");
        const avatarMode = avatarModeSupplied
            ? normalizeAvatarMode(req.body?.avatarMode ?? req.body?.avatar_mode)
            : null;
        const rawProfilePhotoUrl = req.body?.profilePhotoUrl ?? req.body?.profile_photo_url;
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
        const result = await db.query(`
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
      `, [
            firebaseUser.uid,
            avatarMode,
            profilePhotoSupplied,
            profilePhotoUrl,
            appCurrency,
            appLanguage,
        ]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User not found in database",
            });
        }
        return res.json({
            message: "Profile settings updated",
            user: result.rows[0],
        });
    }
    catch (error) {
        console.error("Update profile settings failed:", error);
        return res.status(500).json({
            message: "Failed to update profile settings",
        });
    }
});
router.post("/wallet-pin", verifyFirebaseToken, async (req, res) => {
    const client = await db.connect();
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const { pin, currentPin } = parseRequestBody(walletPinSchema, req.body);
        await client.query("BEGIN");
        const userResult = await client.query(`
      SELECT id, wallet_pin_hash
      FROM users
      WHERE firebase_uid = $1
      FOR UPDATE;
      `, [firebaseUser.uid]);
        const user = userResult.rows[0];
        if (!user) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "User not found in database" });
        }
        if (user.wallet_pin_hash) {
            if (!currentPin) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Old wallet PIN is required" });
            }
            try {
                await verifyWalletPinForUser(client, user.id, currentPin);
            }
            catch (pinError) {
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
        await client.query(`
      UPDATE users
      SET
        wallet_pin_hash = $2,
        wallet_pin_failed_attempts = 0,
        wallet_pin_locked_until = NULL,
        wallet_pin_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = $1;
      `, [user.id, nextHash]);
        const updatedUser = await getAuthUserProfile(client, user.id);
        await client.query("COMMIT");
        return res.json({
            message: user.wallet_pin_hash
                ? "Wallet PIN changed successfully"
                : "Wallet PIN saved",
            user: updatedUser,
        });
    }
    catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (sendValidationError(res, error) || sendWalletPinError(res, error)) {
            return;
        }
        console.error("Save wallet PIN failed:", error);
        return res.status(500).json({ message: "Failed to save wallet PIN" });
    }
    finally {
        client.release();
    }
});
router.post("/wallet-pin/verify", verifyFirebaseToken, async (req, res) => {
    const client = await db.connect();
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const { pin } = parseRequestBody(verifyWalletPinSchema, req.body);
        await client.query("BEGIN");
        const userResult = await client.query(`
      SELECT
        id,
        wallet_pin_hash,
        wallet_pin_failed_attempts,
        wallet_pin_locked_until
      FROM users
      WHERE firebase_uid = $1
      FOR UPDATE;
      `, [firebaseUser.uid]);
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
            await client.query(`
        UPDATE users
        SET
          wallet_pin_failed_attempts = $2,
          wallet_pin_locked_until = $3,
          updated_at = NOW()
        WHERE id = $1;
        `, [user.id, nextAttempts, lockedUntilValue]);
            await client.query("COMMIT");
            return res.status(401).json({
                message: shouldLock
                    ? "Too many wrong wallet PIN attempts. Wallet PIN is temporarily locked."
                    : "Incorrect wallet PIN",
                attemptsRemaining: Math.max(walletPinMaxFailedAttempts - nextAttempts, 0),
                lockedUntil: lockedUntilValue?.toISOString(),
            });
        }
        await client.query(`
      UPDATE users
      SET
        wallet_pin_failed_attempts = 0,
        wallet_pin_locked_until = NULL,
        updated_at = NOW()
      WHERE id = $1;
      `, [user.id]);
        await client.query("COMMIT");
        return res.json({ verified: true });
    }
    catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (sendValidationError(res, error)) {
            return;
        }
        console.error("Verify wallet PIN failed:", error);
        return res.status(500).json({ message: "Failed to verify wallet PIN" });
    }
    finally {
        client.release();
    }
});
router.post("/wallet-pin/reset-otp/request", verifyFirebaseToken, async (req, res) => {
    const client = await db.connect();
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        parseRequestBody(walletPinResetOtpRequestSchema, req.body);
        const userResult = await client.query(`
        SELECT id, name, email, wallet_pin_hash
        FROM users
        WHERE firebase_uid = $1;
        `, [firebaseUser.uid]);
        const user = userResult.rows[0];
        if (!user) {
            return res.status(404).json({ message: "User not found in database" });
        }
        if (!user.wallet_pin_hash) {
            return res.status(400).json({
                message: "Set your wallet PIN first before using reset.",
            });
        }
        await client.query(`
        UPDATE wallet_pin_reset_otps
        SET consumed_at = NOW()
        WHERE user_id = $1
        AND consumed_at IS NULL
        AND expires_at <= NOW();
        `, [user.id]);
        const requestCountResult = await client.query(`
        SELECT COUNT(*)::int AS request_count
        FROM wallet_pin_reset_otps
        WHERE user_id = $1
        AND created_at > NOW() - ($2::int * INTERVAL '1 minute');
        `, [user.id, walletPinResetOtpWindowMinutes]);
        if (Number(requestCountResult.rows[0].request_count) >= walletPinResetOtpMaxRequests) {
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
                message: emailStatus === "not_configured"
                    ? "Email OTP delivery is not configured. Add Brevo SMTP settings in server/.env."
                    : "Could not send wallet PIN reset OTP. Please try again.",
            });
        }
        await client.query("BEGIN");
        await client.query(`
        UPDATE wallet_pin_reset_otps
        SET consumed_at = NOW()
        WHERE user_id = $1
        AND consumed_at IS NULL;
        `, [user.id]);
        await client.query(`
        INSERT INTO wallet_pin_reset_otps (
          user_id,
          otp_hash,
          expires_at
        )
        VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 millisecond'));
        `, [user.id, hashWalletPinResetOtp(otp, user.id), walletPinResetOtpExpiryMs]);
        await client.query("COMMIT");
        return res.status(201).json({
            message: "Wallet PIN reset OTP sent to your registered email.",
            expiresInSeconds: Math.floor(walletPinResetOtpExpiryMs / 1000),
        });
    }
    catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (sendValidationError(res, error)) {
            return;
        }
        console.error("Request wallet PIN reset OTP failed:", error);
        return res.status(500).json({
            message: "Failed to request wallet PIN reset OTP",
        });
    }
    finally {
        client.release();
    }
});
router.post("/wallet-pin/reset", verifyFirebaseToken, async (req, res) => {
    const client = await db.connect();
    try {
        const firebaseUser = req.user;
        if (!firebaseUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const { otp, pin } = parseRequestBody(walletPinResetSchema, req.body);
        await client.query("BEGIN");
        const userResult = await client.query(`
        SELECT id, wallet_pin_hash
        FROM users
        WHERE firebase_uid = $1
        FOR UPDATE;
        `, [firebaseUser.uid]);
        const user = userResult.rows[0];
        if (!user) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "User not found in database" });
        }
        const otpResult = await client.query(`
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
        `, [user.id]);
        const otpRow = otpResult.rows[0];
        if (!otpRow) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Reset OTP expired. Please request a new OTP.",
            });
        }
        if (otpRow.is_expired) {
            await client.query(`UPDATE wallet_pin_reset_otps SET consumed_at = NOW() WHERE id = $1;`, [otpRow.id]);
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
            await client.query(`
          UPDATE wallet_pin_reset_otps
          SET failed_attempts = $2
          WHERE id = $1;
          `, [otpRow.id, nextAttempts]);
            await client.query("COMMIT");
            return res.status(nextAttempts >= walletPinResetOtpMaxAttempts ? 423 : 401).json({
                message: nextAttempts >= walletPinResetOtpMaxAttempts
                    ? "Too many wrong OTP attempts. Please request a new OTP."
                    : "Incorrect OTP",
                attemptsRemaining: Math.max(walletPinResetOtpMaxAttempts - nextAttempts, 0),
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
        await client.query(`
        UPDATE users
        SET
          wallet_pin_hash = $2,
          wallet_pin_failed_attempts = 0,
          wallet_pin_locked_until = NULL,
          wallet_pin_updated_at = NOW(),
          updated_at = NOW()
        WHERE id = $1;
        `, [user.id, nextHash]);
        await client.query(`
        UPDATE wallet_pin_reset_otps
        SET consumed_at = NOW()
        WHERE id = $1;
        `, [otpRow.id]);
        const updatedUser = await getAuthUserProfile(client, user.id);
        await client.query("COMMIT");
        return res.json({
            message: "Wallet PIN reset successfully",
            user: updatedUser,
        });
    }
    catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (sendValidationError(res, error)) {
            return;
        }
        console.error("Reset wallet PIN failed:", error);
        return res.status(500).json({ message: "Failed to reset wallet PIN" });
    }
    finally {
        client.release();
    }
});
router.delete("/account", verifyFirebaseToken, async (req, res) => {
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
        const userResult = await client.query(`
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
        const balanceResult = await client.query(`
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
      `, [dbUserId]);
        const walletBalance = Number(balanceResult.rows[0].wallet_balance);
        if (Math.abs(walletBalance) > 0.0001) {
            return res.status(409).json({
                message: "Withdraw or settle your wallet balance before deleting your account",
            });
        }
        const pendingDuesResult = await client.query(`
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
      `, [dbUserId, dbUserEmail]);
        const pendingDues = Number(pendingDuesResult.rows[0].pending_dues);
        const pendingSettlementsResult = await client.query(`
      SELECT COUNT(*)::int AS pending_settlement_count
      FROM settlements
      WHERE status = 'pending'
      AND (from_user_id = $1 OR to_user_id = $1);
      `, [dbUserId]);
        const pendingSettlementCount = Number(pendingSettlementsResult.rows[0].pending_settlement_count);
        if (pendingDues > 0 || pendingSettlementCount > 0) {
            return res.status(409).json({
                message: "Clear all pending dues before deleting your account",
            });
        }
        await client.query("BEGIN");
        await client.query(`
      DELETE FROM friend_requests
      WHERE LOWER(recipient_email) = LOWER($1);
      `, [dbUserEmail]);
        await client.query(`
      DELETE FROM split_room_members
      WHERE user_id = $1
      OR LOWER(COALESCE(email, '')) = LOWER($2);
      `, [dbUserId, dbUserEmail]);
        await client.query(`
      DELETE FROM users
      WHERE id = $1;
      `, [dbUserId]);
        await client.query("COMMIT");
        await adminAuth.deleteUser(firebaseUser.uid);
        return res.json({
            message: "Account deleted successfully",
        });
    }
    catch (error) {
        await client.query("ROLLBACK");
        console.error("Delete account failed:", error);
        return res.status(500).json({
            message: "Failed to delete account",
        });
    }
    finally {
        client.release();
    }
});
export default router;
