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
export async function verifyFirebaseToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Missing authorization token",
            });
        }
        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await firebaseAuthCircuitBreaker.execute(() => adminAuth.verifyIdToken(token));
        req.user = decodedToken;
        next();
    }
    catch (error) {
        console.error("Firebase token verification failed:", error);
        if (isDependencyUnavailable(error)) {
            return res.status(503).json({
                message: "Authentication service is temporarily unavailable",
            });
        }
        return res.status(401).json({
            message: "Invalid or expired token",
        });
    }
}
