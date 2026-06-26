import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";

import logo from "../../assets/Logo-v2.png";
import "../../styles/AuthPages.css";
import { requestPasswordResetOtp } from "../../lib/api";
import { withTopProgress } from "../../utils/topProgress";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);
      const response = await withTopProgress(() =>
        requestPasswordResetOtp(trimmedEmail),
      );
      setMessage(response.message);
      navigate(`/reset-password?email=${encodeURIComponent(trimmedEmail)}`);
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Could not send password reset code. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="forgot-title">
        <div className="auth-nav">
          <button
            className="auth-back"
            type="button"
            onClick={() => navigate("/login")}
            aria-label="Back to login"
            disabled={loading}
          >
            <ArrowLeft size={18} />
          </button>

          <p>
            Remembered it? <Link to="/login">Log in</Link>
          </p>
        </div>

        <div className="auth-card">
          <Link to="/" className="auth-brand" aria-label="SplitVerse home">
            <img src={logo} alt="SplitVerse logo" />
            <span>SplitVerse</span>
          </Link>

          <div className="auth-heading">
            <span className="auth-kicker">Account recovery</span>
            <h1 id="forgot-title">Reset your password.</h1>
            <p>
              Enter your registered email. We will send a 6-digit password
              reset code to your inbox.
            </p>
          </div>

          <form onSubmit={handleReset} className="auth-form">
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
                  disabled={loading}
                />
              </div>
            </label>

            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-success">{message}</p>}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "Sending reset code" : "Send reset code"}
              <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
