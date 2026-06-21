import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";

import logo from "../../assets/Logo.png";
import "../../styles/AuthPages.css";
import { useAuth } from "../../context/useAuth";
import { getFirebaseErrorMessage } from "../../utils/firebaseError";
import { withTopProgress } from "../../utils/topProgress";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);
      await withTopProgress(() => resetPassword(email.trim()));
      setMessage("Password reset link sent. Please check your inbox.");
    } catch (resetError) {
      setError(getFirebaseErrorMessage(resetError));
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
            <p>Enter your registered email and we will send a reset link.</p>
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
                />
              </div>
            </label>

            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-success">{message}</p>}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "Sending reset link" : "Send reset link"}
              <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
