import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ReceiptText,
  ShieldCheck,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";

import logo from "../../assets/Logo.png";
import "../../styles/AuthPages.css";
import { FacebookIcon, GoogleIcon } from "./SocialIcons";
import LoadingSkeleton from "../../components/LoadingSkeleton";
import { useAuth, type SocialProvider } from "../../context/useAuth";
import { getFirebaseErrorMessage } from "../../utils/firebaseError";

export default function Signup() {
  const navigate = useNavigate();
  const { signupWithEmail, loginWithProvider } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSocialSignup = async (provider: SocialProvider) => {
    setError("");

    try {
      setLoading(true);
      await loginWithProvider(provider, true);
      navigate("/dashboard", { replace: true });
    } catch (signupError) {
      setError(getFirebaseErrorMessage(signupError));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill all fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);
      await signupWithEmail(name.trim(), email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (signupError) {
      setError(getFirebaseErrorMessage(signupError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="signup-title">
        <div className="auth-nav">
          <button
            className="auth-back"
            type="button"
            onClick={() => navigate("/")}
            aria-label="Back to home"
            disabled={loading}
          >
            <ArrowLeft size={18} />
          </button>

          <p>
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>

        <div className="auth-card auth-card-signup">
          <Link to="/" className="auth-brand" aria-label="SplitVerse home">
            <img src={logo} alt="SplitVerse logo" />
            <span>SplitVerse</span>
          </Link>

          <div className="auth-heading">
            <span className="auth-kicker">Create account</span>
            <h1 id="signup-title">Start splitting smarter.</h1>
            <p>Create rooms, assign exact items, and keep settlement history.</p>
          </div>

          <form onSubmit={handleSignup} className="auth-form">
            <label className="auth-field">
              <span>Full name</span>
              <div className="auth-input-shell">
                <UserRound size={18} />
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  disabled={loading}
                />
              </div>
            </label>

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
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
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

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <LoadingSkeleton light /> : "Create account"}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="auth-social" aria-label="Social signup options">
            <div className="auth-divider">
              <span />
              <p>or sign up with</p>
              <span />
            </div>

            <div className="auth-social-row">
              <button
                type="button"
                className="auth-social-btn google"
                onClick={() => handleSocialSignup("google")}
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
                onClick={() => handleSocialSignup("facebook")}
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
        <h2>Fair splits before the bill gets awkward.</h2>
        <p>
          Invite friends into focused rooms, assign the exact bill items, and
          keep the settlement trail easy to read.
        </p>
      </div>

      <div className="preview-stack" aria-hidden="true">
        <div className="preview-card preview-card-main">
          <div className="preview-card-header">
            <div>
              <span>Hostel 403</span>
              <strong>Rs. 8,240</strong>
            </div>
            <ShieldCheck size={22} />
          </div>

          <div className="preview-meter">
            <span style={{ width: "74%" }} />
          </div>

          <div className="preview-row">
            <UsersRound size={18} />
            <span>5 members</span>
            <strong>Active</strong>
          </div>
          <div className="preview-row">
            <ReceiptText size={18} />
            <span>Groceries, rent, meals</span>
            <strong>Tracked</strong>
          </div>
          <div className="preview-row">
            <WalletCards size={18} />
            <span>Settled this week</span>
            <strong className="positive">Rs. 3,600</strong>
          </div>
        </div>

        <div className="preview-card preview-card-mini">
          <span>Next step</span>
          <strong>Add friends</strong>
          <p>Build the room first, then split each receipt item by item.</p>
        </div>
      </div>
    </section>
  );
}
