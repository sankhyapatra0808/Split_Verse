import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";

import logo from "../../assets/Logo-v2.png";
import "../../styles/AuthPages.css";
import { GoogleIcon } from "./SocialIcons";
import { useAuth } from "../../context/useAuth";
import type { EmailLoginOtpSession } from "../../lib/api";
import { getFirebaseErrorMessage } from "../../utils/firebaseError";
import { withTopProgress } from "../../utils/topProgress";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

const maxDailyLoginAttempts = 5;
const loginAttemptStoragePrefix = "splitverse-login-attempts";

function getLoginAttemptDay() {
  return new Date().toLocaleDateString("en-CA");
}

function getLoginAttemptKey(email: string) {
  return `${loginAttemptStoragePrefix}:${email.toLowerCase()}:${getLoginAttemptDay()}`;
}

function getLoginAttemptCount(email: string) {
  return Number(window.localStorage.getItem(getLoginAttemptKey(email)) || 0);
}

function recordFailedLoginAttempt(email: string) {
  const nextCount = getLoginAttemptCount(email) + 1;
  window.localStorage.setItem(getLoginAttemptKey(email), String(nextCount));

  return nextCount;
}

function clearLoginAttempts(email: string) {
  window.localStorage.removeItem(getLoginAttemptKey(email));
}

function isFirebaseAuthError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code).startsWith("auth/")
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    completeEmailLoginWithOtp,
    loginWithProvider,
    startEmailLoginOtp,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSession, setOtpSession] = useState<EmailLoginOtpSession | null>(
    null,
  );
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const from =
    (location.state as LocationState | null)?.from?.pathname || "/dashboard";
  const otpActive = Boolean(otpSession);

  const resetOtpStep = () => {
    setOtp("");
    setOtpSession(null);
    setStatus("");
  };

  const handleSocialLogin = async (provider: "google") => {
    setError("");
    setStatus("");

    try {
      setLoading(true);
      await withTopProgress(() => loginWithProvider(provider, remember));
      navigate(from, { replace: true });
    } catch (loginError) {
      setError(getFirebaseErrorMessage(loginError));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");

    const trimmedEmail = email.trim();

    if (otpSession) {
      const sanitizedOtp = otp.replace(/\D/g, "");

      if (sanitizedOtp.length !== 6) {
        setError("Enter the 6-digit login code.");
        return;
      }

      try {
        setLoading(true);
        await withTopProgress(() =>
          completeEmailLoginWithOtp(
            trimmedEmail,
            password,
            remember,
            otpSession.sessionId,
            sanitizedOtp,
          ),
        );
        clearLoginAttempts(trimmedEmail);
        navigate(from, { replace: true });
      } catch (loginError) {
        setError(getFirebaseErrorMessage(loginError));
      } finally {
        setLoading(false);
      }

      return;
    }

    if (!trimmedEmail || !password) {
      setError("Please enter email and password.");
      return;
    }

    if (getLoginAttemptCount(trimmedEmail) >= maxDailyLoginAttempts) {
      setError("Too many login attempts today. Please try again tomorrow.");
      return;
    }

    try {
      setLoading(true);
      const session = await withTopProgress(() =>
        startEmailLoginOtp(trimmedEmail, password, remember),
      );
      setOtpSession(session);
      setOtp("");
      setStatus(
        `We sent a 6-digit login code to ${session.email}. It expires in 10 minutes.`,
      );
    } catch (loginError) {
      if (!isFirebaseAuthError(loginError)) {
        setError(getFirebaseErrorMessage(loginError));
        return;
      }

      const attempts = recordFailedLoginAttempt(trimmedEmail);
      const attemptsLeft = Math.max(0, maxDailyLoginAttempts - attempts);

      setError(
        attemptsLeft > 0
          ? `${getFirebaseErrorMessage(loginError)} ${attemptsLeft} login attempt${
              attemptsLeft === 1 ? "" : "s"
            } left today.`
          : "Too many login attempts today. Please try again tomorrow.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError("");
    setStatus("");

    try {
      setLoading(true);
      const session = await withTopProgress(() =>
        startEmailLoginOtp(email.trim(), password, remember),
      );
      setOtpSession(session);
      setOtp("");
      setStatus(`We sent a new 6-digit login code to ${session.email}.`);
    } catch (resendError) {
      setError(getFirebaseErrorMessage(resendError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="auth-nav">
          <button
            className="auth-back"
            type="button"
            onClick={() => navigate("/")}
            aria-label="Back to home"
          >
            <ArrowLeft size={18} />
          </button>

          <p>
            New here? <Link to="/signup">Sign up</Link>
          </p>
        </div>

        <div className="auth-card">
          <Link to="/" className="auth-brand" aria-label="SplitVerse home">
            <img src={logo} alt="SplitVerse logo" />
            <span>SplitVerse</span>
          </Link>

          <div className="auth-heading">
            <span className="auth-kicker">Secure access</span>
            <h1 id="login-title">Log in to SplitVerse.</h1>
            <p>
              {otpActive
                ? "Enter the code from your email to finish signing in."
                : "Review room balances, pending dues, and recent settlements."}
            </p>
          </div>

          <form onSubmit={handleLogin} className="auth-form">
            <label className="auth-field">
              <span>Email address</span>
              <div className="auth-input-shell">
                <Mail size={18} />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    resetOtpStep();
                  }}
                  autoComplete="email"
                  disabled={loading || otpActive}
                />
              </div>
            </label>

            <label className="auth-field">
              <span>Password</span>
              <div className="auth-input-shell">
                <LockKeyhole size={18} />
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    resetOtpStep();
                  }}
                  autoComplete="current-password"
                  disabled={loading || otpActive}
                />
                <button
                  type="button"
                  className="auth-icon-btn"
                  onClick={() => setShowPass((current) => !current)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                  disabled={loading || otpActive}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {otpActive && (
              <label className="auth-field">
                <span>Email login code</span>
                <div className="auth-input-shell otp-input-shell">
                  <ShieldCheck size={18} />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={otp}
                    onChange={(event) =>
                      setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    autoComplete="one-time-code"
                    disabled={loading}
                  />
                </div>
              </label>
            )}

            {!otpActive && (
              <div className="auth-options">
                <label className="remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                    disabled={loading}
                  />
                  <span aria-hidden="true" />
                  Remember me
                </label>

                <Link to="/forgot-password">Forgot password?</Link>
              </div>
            )}

            {otpActive && (
              <div className="auth-options otp-actions">
                <button
                  type="button"
                  className="auth-text-button"
                  onClick={handleResendOtp}
                  disabled={loading}
                >
                  Resend code
                </button>
                <button
                  type="button"
                  className="auth-text-button"
                  onClick={resetOtpStep}
                  disabled={loading}
                >
                  Change email
                </button>
              </div>
            )}

            {status && <p className="auth-status">{status}</p>}
            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading
                ? otpActive
                  ? "Verifying code"
                  : "Sending code"
                : otpActive
                  ? "Verify and log in"
                  : "Send login code"}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="auth-social" aria-label="Google login option">
            <div className="auth-divider">
              <span />
              <p>or continue with</p>
              <span />
            </div>

            <div className="auth-social-row single">
              <button
                type="button"
                className="auth-social-btn google"
                onClick={() => handleSocialLogin("google")}
                disabled={loading}
              >
                <span>
                  <GoogleIcon />
                </span>
                Continue with Google
              </button>
            </div>
          </div>
        </div>
      </section>

      <AuthVisual />
    </main>
  );
}

function AuthVisual() {
  return (
    <section className="auth-visual" aria-label="SplitVerse product preview">
      <div className="auth-visual-copy">
        <span className="auth-kicker auth-kicker-dark">Room ledger</span>
        <h2>Every shared cost, settled with calm.</h2>
        <p>
          Split exact items, track who owes whom, and record manual payments in
          one focused money room.
        </p>
      </div>

      <div className="preview-stack" aria-hidden="true">
        <div className="preview-card preview-card-main">
          <div className="preview-card-header">
            <div>
              <span>Dinner table</span>
              <strong>Rs. 4,820</strong>
            </div>
            <ShieldCheck size={22} />
          </div>

          <div className="preview-meter">
            <span style={{ width: "68%" }} />
          </div>

          <div className="preview-row">
            <UsersRound size={18} />
            <span>7 members</span>
            <strong>2 pending</strong>
          </div>
          <div className="preview-row">
            <ReceiptText size={18} />
            <span>18 item splits</span>
            <strong>Ready</strong>
          </div>
          <div className="preview-row">
            <WalletCards size={18} />
            <span>You get back</span>
            <strong className="positive">Rs. 1,180</strong>
          </div>
        </div>

        <div className="preview-card preview-card-mini">
          <span>Settlement</span>
          <strong>Rs. 640</strong>
          <p>Due from two friends after tax and shared sides.</p>
        </div>
      </div>
    </section>
  );
}
