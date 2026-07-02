import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import "../styles/PublicInfoPage.css";

export default function NotFound() {
  const { user } = useAuth();
  const primaryHref = user ? "/dashboard" : "/";
  const primaryLabel = user ? "Back to dashboard" : "Back to SplitVerse";

  return (
    <main className="public-info-page">
      <nav className="public-info-nav" aria-label="Public page navigation">
        <Link className="public-info-brand" to="/">
          SplitVerse
        </Link>
        <div className="public-info-nav-links">
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/support">Support</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/security">Security</Link>
        </div>
        <Link className="public-info-back" to={primaryHref}>
          {primaryLabel}
        </Link>
      </nav>

      <section className="public-info-hero">
        <div>
          <span>404</span>
          <h1>Page not found.</h1>
          <p>
            The page you opened does not exist or may have moved. Use the links above
            to get back to a safe SplitVerse page.
          </p>
        </div>
      </section>
    </main>
  );
}
