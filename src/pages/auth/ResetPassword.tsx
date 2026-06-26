import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";

import logo from "../../assets/Logo-v2.png";
import "../../styles/AuthPages.css";
import { resetPasswordWithOtp } from "../../lib/api";
import { withTopProgress } from "../../utils/topProgress";

function getPasswordStrength(password: string) {
  let score = 0;

  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (!password) {
    return { label: "Password strength", level: "empty", score: 0 };
  }

  if (score <= 2) {
    return { label: "Weak password", level: "weak", score };
  }

  if (score <= 4) {
    return { label: "Good password", level: "good", score };
  }

  return { label: "Strong password", level: "strong", score };
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState(
    () => searchParams.get("email")?.trim().toLowerCase() || "",
  );
  const [otp, setOtp] = useState("");
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const passwordStrength = getPasswordStrength(newPassword);

  async function handlePasswordReset(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const trimmedEmail = email.trim().toLowerCase();
    const sanitizedOtp = otp.replace(/\D/g, "");

    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (sanitizedOtp.length !== 6) {
      setError("Enter the 6-digit password reset code sent to your email.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Re-entered password does not match.");
      return;
    }

    try {
      setSaving(true);
      const response = await withTopProgress(() =>
        resetPasswordWithOtp({
          email: trimmedEmail,
          otp: sanitizedOtp,
          password: newPassword,
          confirmPassword,
        }),
      );
      setMessage(response.message);
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Could not reset password. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="reset-title">
        <div className="auth-nav">
          <button
            className="auth-back"
            type="button"
            onClick={() => navigate("/login")}
            aria-label="Back to login"
            disabled={saving}
          >
            <ArrowLeft size={18} />
          </button>

          <p>
            Back to <Link to="/login">log in</Link>
          </p>
        </div>

        <div className="auth-card">
          <Link to="/" className="auth-brand" aria-label="SplitVerse home">
            <img src={logo} alt="SplitVerse logo" />
            <span>SplitVerse</span>
          </Link>

          <div className="auth-heading">
            <span className="auth-kicker">New password</span>
            <h1 id="reset-title">Create a new password.</h1>
            <p>
              Enter the code from your email, then set and re-enter your new
              password.
            </p>
          </div>

          <form onSubmit={handlePasswordReset} className="auth-form">
            <label className="auth-field">
              <span>Email address</span>
              <div className="auth-input-shell">
                <Mail size={18} />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  disabled={saving || Boolean(message)}
                />
              </div>
            </label>

            <label className="auth-field">
              <span>Password reset code</span>
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
                  disabled={saving || Boolean(message)}
                />
              </div>
            </label>

            <label className="auth-field">
              <span>New password</span>
              <div className="auth-input-shell">
                <LockKeyhole size={18} />
                <input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={saving || Boolean(message)}
                />
                <button
                  type="button"
                  className="auth-icon-btn"
                  onClick={() => setShowNewPassword((current) => !current)}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                  disabled={saving || Boolean(message)}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div
                className={`password-strength-meter ${passwordStrength.level}`}
                aria-live="polite"
              >
                <span>
                  <i
                    style={{
                      width:
                        passwordStrength.score === 0
                          ? "0%"
                          : `${Math.max(passwordStrength.score, 1) * 20}%`,
                    }}
                  />
                </span>
                <small>{passwordStrength.label}</small>
              </div>
            </label>

            <label className="auth-field">
              <span>Re-enter new password</span>
              <div className="auth-input-shell">
                <ShieldCheck size={18} />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={saving || Boolean(message)}
                />
                <button
                  type="button"
                  className="auth-icon-btn"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                  disabled={saving || Boolean(message)}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-success">{message}</p>}

            {message ? (
              <button
                type="button"
                className="auth-submit"
                onClick={() => navigate("/login", { replace: true })}
              >
                Go to login
                <ArrowRight size={18} />
              </button>
            ) : (
              <button type="submit" className="auth-submit" disabled={saving}>
                {saving ? "Updating password" : "Update password"}
                <ArrowRight size={18} />
              </button>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}
