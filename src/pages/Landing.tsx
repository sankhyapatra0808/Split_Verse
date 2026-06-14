import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  IndianRupee,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
} from "lucide-react";

import "../styles/Landing.css";

const featurePills = [
  "Item-wise split",
  "Expense rooms",
  "Friends",
  "Wallet",
  "Balances",
  "Reminders",
  "Savings score",
  "Transactions",
];

const features = [
  {
    icon: ReceiptText,
    title: "Item-wise bill splitting",
    text: "Assign biryani, pizza, drinks, tax, and service charges to the exact people who consumed them.",
  },
  {
    icon: UsersRound,
    title: "Friends and rooms",
    text: "Add friends, create restaurant/trip/hostel rooms, invite members, and split expenses together.",
  },
  {
    icon: WalletCards,
    title: "Wallet-style tracking",
    text: "Track paid, received, pending, and manually settled payments without acting like a real bank wallet.",
  },
  {
    icon: BellRing,
    title: "Smart reminders",
    text: "Send friendly payment reminders and keep pending settlements visible without awkward follow-ups.",
  },
  {
    icon: IndianRupee,
    title: "Clear balances",
    text: "See who owes you, who you owe, room-wise balances, and simplified settlement suggestions.",
  },
  {
    icon: ShieldCheck,
    title: "Professional money UI",
    text: "Clean, serious, responsive, glassmorphic design built for trust because the product handles money.",
  },
];

const steps = [
  "Add friends",
  "Create room",
  "Add expense",
  "Assign items",
  "Settle dues",
  "Earn score",
];

export default function Landing() {
  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <span className="brand-spark">✦</span>
          </span>

          <span className="brand-text">
            Split<span>Spark</span>
          </span>
        </Link>
        <div className="nav-actions">
          <Link to="/login" className="nav-login">
            Login
          </Link>
          <Link to="/signup" className="nav-cta">
            Get Started
          </Link>
        </div>
      </nav>

      <section className="hero-section">
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />

        <div className="hero-content">
          <div className="hero-badge">
            Smart bill splitting for friends, rooms, and trips
          </div>

          <h1>
            Split bills fairly.
            <span> Track money beautifully.</span>
          </h1>

          <p>
            SplitSpark helps you add friends, create expense rooms, split
            restaurant bills item by item, track wallet activity, view balances,
            send reminders, and build better spending habits.
          </p>

          <div className="hero-actions">
            <Link to="/signup" className="primary-btn">
              Start splitting smarter
              <ArrowRight size={18} />
            </Link>

            <Link to="/rooms" className="secondary-btn">
              Create Split Room
            </Link>
          </div>

          <div className="hero-proof">
            <span>
              <CheckCircle2 size={16} /> No unfair equal splits
            </span>
            <span>
              <CheckCircle2 size={16} /> Manual settlement ready
            </span>
            <span>
              <CheckCircle2 size={16} /> Built for UPI-first users
            </span>
          </div>
        </div>

        <div className="hero-preview-card">
          <div className="preview-header">
            <div>
              <span className="eyebrow">Live split preview</span>
              <h3>Restaurant Night</h3>
              <p>Item-wise settlement for a ₹1,000 group bill.</p>
            </div>

            <div className="preview-status">
              <span />
              Synced
            </div>
          </div>

          <div className="preview-balance-panel">
            <div>
              <span>Total bill</span>
              <strong>₹1,000</strong>
            </div>

            <div>
              <span>Settlement status</span>
              <strong>2 pending</strong>
            </div>
          </div>

          <div className="professional-bill-list">
            <div className="professional-bill-row">
              <div>
                <span>Biryani Bowl</span>
                <small>Assigned to Max</small>
              </div>
              <strong>₹300</strong>
            </div>

            <div className="professional-bill-row">
              <div>
                <span>Pizza Platter</span>
                <small>Assigned to John</small>
              </div>
              <strong>₹450</strong>
            </div>

            <div className="professional-bill-row">
              <div>
                <span>Drinks & Sides</span>
                <small>Assigned to Ravi</small>
              </div>
              <strong>₹250</strong>
            </div>
          </div>

          <div className="preview-divider" />

          <div className="settlement-grid">
            <div className="settlement-card positive">
              <span>You are owed</span>
              <strong>₹700</strong>
              <small>From 2 friends</small>
            </div>

            <div className="settlement-card neutral">
              <span>Your share</span>
              <strong>₹300</strong>
              <small>Already recorded</small>
            </div>
          </div>
        </div>
      </section>

      <section className="feature-rail" aria-label="SplitSpark features">
        <div className="feature-track">
          <div className="feature-group">
            {[...featurePills, ...featurePills].map((pill, index) => (
              <span key={`group-1-${pill}-${index}`}>{pill}</span>
            ))}
          </div>

          <div className="feature-group" aria-hidden="true">
            {[...featurePills, ...featurePills].map((pill, index) => (
              <span key={`group-2-${pill}-${index}`}>{pill}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="problem-section">
        <div className="section-heading">
          <span className="section-kicker">The problem</span>
          <h2>Equal split is not always fair.</h2>
          <p>
            When everyone consumes different items, SplitSpark lets every person
            pay for exactly what they used instead of forcing one equal split.
          </p>
        </div>

        <div className="comparison-grid">
          <div className="comparison-card active-card">
            <span>SplitSpark way</span>
            <h3>₹300 + ₹450 + ₹250</h3>
            <p>
              Each friend pays only for their own item. Fair, clear, and
              trackable.
            </p>
          </div>
        </div>
      </section>

      <section className="features-section" id="features">
        <div className="section-heading">
          <span className="section-kicker">Features</span>
          <h2>Everything needed for social money management.</h2>
          <p>
            Built for college students, flatmates, corporate teams, restaurants,
            trips, subscriptions, events, and shared purchases.
          </p>
        </div>

        <div className="features-grid">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <article className="feature-card" key={feature.title}>
                <div className="feature-icon">
                  <Icon size={22} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="section-heading">
          <span className="section-kicker">How it works</span>
          <h2>From bill to balance in six clean steps.</h2>
        </div>

        <div className="steps-grid">
          {steps.map((step, index) => (
            <div className="step-card" key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{step}</h3>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-preview-section" id="preview">
        <div className="dashboard-copy">
          <span className="section-kicker">Dashboard preview</span>
          <h2>A bento dashboard for balances, rooms, wallet, and savings.</h2>
          <p>
            The dashboard gives users a fast view of total balance, money owed,
            money to receive, active rooms, recent transactions, reminders, and
            gamified savings progress.
          </p>

          <Link to="/signup" className="primary-btn">
            Build my dashboard
            <ArrowRight size={18} />
          </Link>
        </div>

        <div className="bento-preview">
          <div className="bento-card large">
            <span>Total Balance</span>
            <strong>+₹2,450</strong>
            <div className="soft-chart">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>

          <div className="bento-card">
            <span>You owe</span>
            <strong>₹850</strong>
          </div>

          <div className="bento-card">
            <span>You are owed</span>
            <strong>₹3,300</strong>
          </div>

          <div className="bento-card wide">
            <span>Active rooms</span>
            <strong>Goa Trip, Hostel 403, Office Lunch</strong>
          </div>

          <div className="bento-card">
            <span>Reminders</span>
            <strong>4 pending</strong>
          </div>

          <div className="bento-card">
            <span>Savings Score</span>
            <strong>720</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
