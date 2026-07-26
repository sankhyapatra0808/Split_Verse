import { adminAuth } from "../config/firebaseAdmin.js";
import { CircuitBreaker, CircuitBreakerOpenError, DependencyConcurrencyLimitError, DependencyTimeoutError, } from "../utils/circuitBreaker.js";
const firebaseAuthTimeoutMs = Number(process.env.FIREBASE_AUTH_TIMEOUT_MS || 3000);
const firebaseAuthMaxConcurrent = Number(process.env.FIREBASE_AUTH_MAX_CONCURRENT || 50);
const firebaseAuthFailureThreshold = Number(process.env.FIREBASE_AUTH_FAILURE_THRESHOLD || 5);
const firebaseAuthRecoveryTimeoutMs = Number(process.env.FIREBASE_AUTH_RECOVERY_TIMEOUT_MS || 15000);
const firebaseAuthSuccessThreshold = Number(process.env.FIREBASE_AUTH_SUCCESS_THRESHOLD || 2);
function getFirebaseErrorCode(error) {
    return typeof error === "object" && error !== null && "code" in error
        ? String(error.code ?? "")
        : "";
}
function isFirebaseDependencyFailure(error) {
    const code = getFirebaseErrorCode(error).toLowerCase();
    return (code.includes("internal") ||
        code.includes("network") ||
        code.includes("timeout") ||
        code.includes("unavailable"));
}
const firebaseAuthCircuitBreaker = new CircuitBreaker({
    name: "firebase-auth",
    timeoutMs: firebaseAuthTimeoutMs,
    maxConcurrent: firebaseAuthMaxConcurrent,
    failureThreshold: firebaseAuthFailureThreshold,
    recoveryTimeoutMs: firebaseAuthRecoveryTimeoutMs,
    successThreshold: firebaseAuthSuccessThreshold,
    shouldRecordFailure: isFirebaseDependencyFailure,
});
export function getFirebaseAuthDependencyHealth() {
    return {
        timeoutMs: firebaseAuthTimeoutMs,
        maxConcurrent: firebaseAuthMaxConcurrent,
        circuitBreaker: firebaseAuthCircuitBreaker.getSnapshot(),
    };
}
function isDependencyUnavailable(error) {
    return (error instanceof CircuitBreakerOpenError ||
        error instanceof DependencyConcurrencyLimitError ||
        error instanceof DependencyTimeoutError ||
        isFirebaseDependencyFailure(error));
}
function getBearerToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return "";
    }
    return authHeader.slice("Bearer ".length).trim();
}
export function isSplitVerseAuthorizedSession(token) {
    const provider = String(token.firebase?.sign_in_provider || "");
    if (provider === "password") {
        const allowLegacyPasswordSessions = process.env.NODE_ENV !== "production" &&
            process.env.ALLOW_LEGACY_PASSWORD_SESSIONS === "true";
        return allowLegacyPasswordSessions;
    }
    if (provider === "custom") {
        return token.splitverseOtpVerified === true;
    }
    // Federated providers such as Google already complete their provider's
    // authentication flow and do not use the email-password OTP challenge.
    return Boolean(provider);
}
async function verifyToken(req, res, next, options) {
    try {
        const token = getBearerToken(req);
        if (!token) {
            return res.status(401).json({
                code: "AUTH_TOKEN_MISSING",
                message: "Missing authorization token",
            });
        }
        const decodedToken = (await firebaseAuthCircuitBreaker.execute(() => adminAuth.verifyIdToken(token)));
        if (options.requireSplitVerseSession &&
            !isSplitVerseAuthorizedSession(decodedToken)) {
            return res.status(401).json({
                code: "LOGIN_OTP_REQUIRED",
                message: "Complete email OTP verification before continuing.",
            });
        }
        req.user = decodedToken;
        next();
    }
    catch (error) {
        console.error("Firebase token verification failed:", error);
        if (isDependencyUnavailable(error)) {
            return res.status(503).json({
                code: "AUTH_SERVICE_UNAVAILABLE",
                message: "Authentication service is temporarily unavailable",
            });
        }
        return res.status(401).json({
            code: "AUTH_TOKEN_INVALID",
            message: "Invalid or expired token",
        });
    }
}
/**
 * Verifies a genuine Firebase token without requiring the SplitVerse OTP claim.
 * This is intentionally limited to bootstrap routes such as user sync and the
 * password-credential-to-OTP exchange.
 */
export function verifyFirebaseCredentialToken(req, res, next) {
    return verifyToken(req, res, next, { requireSplitVerseSession: false });
}
/** Verifies both Firebase authenticity and SplitVerse session authorization. */
export function verifyFirebaseToken(req, res, next) {
    return verifyToken(req, res, next, { requireSplitVerseSession: true });
}
export function requireRecentAuthentication(maxAgeMs = 10 * 60 * 1000) {
    return (req, res, next) => {
        const authTimeSeconds = Number(req.user?.auth_time || 0);
        const otpVerifiedAtSeconds = Number(req.user?.splitverseOtpVerifiedAt || 0);
        const effectiveAuthTimeSeconds = Math.max(authTimeSeconds, otpVerifiedAtSeconds);
        if (!Number.isFinite(effectiveAuthTimeSeconds) ||
            effectiveAuthTimeSeconds <= 0 ||
            Date.now() - effectiveAuthTimeSeconds * 1000 > maxAgeMs) {
            return res.status(401).json({
                code: "RECENT_AUTH_REQUIRED",
                message: "Sign in again before completing this security-sensitive action.",
            });
        }
        next();
    };
}
