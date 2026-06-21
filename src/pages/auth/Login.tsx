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

import logo from "../../assets/Logo.png";
import "../../styles/AuthPages.css";
import { FacebookIcon, GoogleIcon } from "./SocialIcons";
import LoadingSkeleton from "../../components/LoadingSkeleton";
import { useAuth, type SocialProvider } from "../../context/useAuth";
import { getFirebaseErrorMessage } from "../../utils/firebaseError";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithEmail, loginWithProvider } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from =
    (location.state as LocationState | null)?.from?.pathname || "/dashboard";

  const handleSocialLogin = async (provider: SocialProvider) => {
    setError("");

    try {
      setLoading(true);
      await loginWithProvider(provider, remember);
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

    if (!email.trim() || !password) {
      setError("Please enter email and password.");
      return;
    }

    try {
      setLoading(true);
      await loginWithEmail(email.trim(), password, remember);
      navigate(from, { replace: true });
    } catch (loginError) {
      setError(getFirebaseErrorMessage(loginError));
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
            <p>Review room balances, pending dues, and recent settlements.</p>
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
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  disabled={loading}
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
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="auth-icon-btn"
                  onClick={() => setShowPass((current) => !current)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                  disabled={loading}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

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

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <LoadingSkeleton light /> : "Log in"}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="auth-social" aria-label="Social login options">
            <div className="auth-divider">
              <span />
              <p>or continue with</p>
              <span />
            </div>

            <div className="auth-social-row">
              <button
                type="button"
                className="auth-social-btn google"
                onClick={() => handleSocialLogin("google")}
                disabled={loading}
              >
                <span>
                  <GoogleIcon />
                </span>
                Google
              </button>
              <button
                type="button"
                className="auth-social-btn facebook"
                onClick={() => handleSocialLogin("facebook")}
                disabled
              >
                <span>
                  <FacebookIcon />
                </span>
                Facebook
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
