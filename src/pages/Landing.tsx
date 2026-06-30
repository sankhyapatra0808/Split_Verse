import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronRight,
  IndianRupee,
  Menu,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";

import editorialImage from "../assets/SplitVerse_Landing.png";
import { useAppSettings } from "../context/useAppSettings";
import iconimage from "../assets/Logo-v2.png";
import "../styles/Landing.css";

const proofPoints = ["Item-wise bills", "Room balances", "Manual settlements"];

const heroStats = [
  { label: "Dinner table", amount: 4820, helper: "7 people" },
  { label: "You owe", amount: 640, helper: "2 dues" },
  { label: "You get back", amount: 1180, helper: "4 friends" },
];

const splitRows = [
  { name: "Aarav", item: "Pasta, drink", amount: 780 },
  { name: "Mira", item: "Salad, dessert", amount: 620 },
  { name: "Kabir", item: "Shared sides", amount: 430 },
];

const services = [
  {
    icon: UsersRound,
    label: "Rooms",
    title: "One money room for every group plan.",
    text: "Keep restaurant bills, hostel expenses, subscriptions, and weekend plans separated with clear room balances.",
    metric: "24 active rooms",
  },
  {
    icon: ReceiptText,
    label: "Bills",
    title: "Split the exact items people used.",
    text: "Assign dishes, delivery fees, tax, tips, and extras without forcing a single equal split on everyone.",
    metric: "18 item splits",
  },
  {
    icon: WalletCards,
    label: "Settle",
    title: "Track dues until the group is square.",
    text: "Record payments manually, see who owes whom, and send calm reminders when balances are still pending.",
    metricAmount: 3300,
    metricSuffix: "owed",
  },
];

const features = [
  {
    icon: ReceiptText,
    title: "Item-wise receipt flow",
    text: "Turn one bill into exact personal shares with service charges, taxes, and extras accounted for.",
  },
  {
    icon: UsersRound,
    title: "Friends and groups",
    text: "Invite people into focused rooms so each shared purchase stays attached to the right context.",
  },
  {
    icon: IndianRupee,
    title: "Simple balance math",
    text: "See what you owe, what you should receive, and practical settlement suggestions at a glance.",
  },
  {
    icon: BellRing,
    title: "Gentle reminders",
    text: "Send payment nudges that keep dues visible without making follow-ups feel awkward.",
  },
  {
    icon: WalletCards,
    title: "Settlement history",
    text: "Maintain a clean log of paid, received, pending, and manually settled activity.",
  },
  {
    icon: ShieldCheck,
    title: "Trust-first interface",
    text: "A restrained shared-money surface that feels readable, calm, and serious on every screen.",
  },
];

const steps = [
  "Create a room",
  "Add friends",
  "Enter the bill",
  "Assign items",
  "Review balances",
  "Record settlement",
];

const footerColumns = [
  {
    heading: "Product",
    links: [
      { label: "Bill splitting", href: "#features" },
      { label: "Rooms", href: "#rooms" },
      { label: "Wallet log", href: "#preview" },
      { label: "Balances", href: "#preview" },
    ],
  },
  {
    heading: "Use cases",
    links: [
      { label: "Restaurants", href: "#friends" },
      { label: "Flatmates", href: "#rooms" },
      { label: "Trips", href: "#workflow" },
      { label: "Team lunches", href: "#features" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Help",
    links: [
      { label: "Support", href: "/support" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Security", href: "/security" },
    ],
  },
];

export default function Landing() {
  const { formatCurrency } = useAppSettings();

  const serviceCards = services.map((service) => {
    const metric =
      "metricAmount" in service && typeof service.metricAmount === "number"
        ? `${formatCurrency(service.metricAmount)} ${service.metricSuffix ?? ""}`.trim()
        : "metric" in service
          ? service.metric
          : "";

    return {
      ...service,
      metric,
    };
  });

  const handleBrandClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Primary navigation">
        <Link
          to="/"
          className="brand"
          aria-label="SplitVerse home"
          onClick={handleBrandClick}
        >
          <img src={iconimage} className="logo-sv" alt="SplitVerse Logo" />

          <span className="brand-text">SplitVerse</span>
        </Link>

        <div className="nav-actions">
          <button
            className="nav-icon-button nav-menu"
            type="button"
            aria-label="Menu"
          >
            <Menu size={19} />
          </button>
          <Link to="/login" className="nav-login">
            Login
          </Link>
          <Link to="/signup" className="nav-cta">
            Get started
          </Link>
        </div>
      </nav>

      <section className="hero-section reveal" aria-labelledby="hero-title">
        <div className="hero-content">

          <h1 id="hero-title">Split group bills with institutional calm.</h1>

          <p>
            SplitVerse turns restaurant receipts, room expenses, trips, and team
            lunches into clean balances everyone can understand.
          </p>

          <div className="hero-actions">
            <Link to="/signup" className="primary-btn primary-btn-large">
              Start splitting
              <ArrowRight size={18} />
            </Link>

            <Link to="/signup" className="secondary-btn secondary-btn-dark">
              Create room
            </Link>
          </div>

          <div className="hero-proof" aria-label="SplitVerse highlights">
            {proofPoints.map((point) => (
              <span key={point}>
                <CheckCircle2 size={16} />
                {point}
              </span>
            ))}
          </div>
        </div>

        <div className="hero-visual" aria-label="Bill splitting preview">
          <div className="receipt-image-card">
            <img
              src={editorialImage}
              alt="A restaurant receipt, payment cards, coins, and a phone showing a shared bill interface."
            />
          </div>

          <div className="split-card split-card-main">
            <div className="card-topline">
              <span>Dinner table</span>
              <strong>Ready to settle</strong>
            </div>
            <div className="split-total">
              <span>Total bill</span>
              <strong>{formatCurrency(4820)}</strong>
            </div>
            <div className="split-list">
              {splitRows.map((row) => (
                <div className="split-row" key={row.name}>
                  <span className="avatar-chip">{row.name.charAt(0)}</span>
                  <div>
                    <strong>{row.name}</strong>
                    <span>{row.item}</span>
                  </div>
                  <em>{formatCurrency(row.amount)}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="split-card split-card-floating">
            <span>Settlement note</span>
            <br />
            <strong>{formatCurrency(640)} pending</strong>
            <p>Due from two friends after tax and shared sides.</p>
          </div>
        </div>
      </section>

      <section className="intro-section reveal" id="friends">
        <div className="intro-copy">
          <h2>Equal split is quick. Exact split is fair.</h2>
        </div>

        <div className="intro-text">
          <p>
            Everyone orders differently, so the money record should match what
            happened. SplitVerse keeps the flow soft while the math stays
            precise underneath.
          </p>

          <div className="intro-stats" aria-label="Example room totals">
            {heroStats.map((stat) => (
              <div key={stat.label}>
                <span>{stat.label}</span>
                <strong>{formatCurrency(stat.amount)}</strong>
                <em>{stat.helper}</em>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="services-section reveal"
        id="rooms"
        aria-labelledby="services-title"
      >
        <div className="section-heading">
          <h2 id="services-title">A connected path from bill to balance.</h2>
          <p>
            Build rooms, assign expenses, and settle dues from one composed
            money-management surface.
          </p>
        </div>

        <div className="service-grid">
          {serviceCards.map((service) => {
            const Icon = service.icon;

            return (
              <article className="service-card" key={service.title}>
                <div className="service-icon">
                  <Icon size={22} />
                </div>
                <span>{service.label}</span>
                <h3>{service.title}</h3>
                <p>{service.text}</p>
                <div className="service-metric">
                  <strong>{service.metric}</strong>
                  <ChevronRight size={18} />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="features-section reveal" id="features">
        <div className="section-heading">
          <h2>Everything needed for shared expenses.</h2>
          <p>
            Designed for college students, flatmates, office teams, restaurants,
            trips, subscriptions, events, and everyday shared purchases.
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

      <section className="workflow-section reveal" id="workflow">
        <div className="workflow-copy">
          <h2>From receipt to settlement in six calm steps.</h2>
          <p>
            The page stays lightweight for the group, while SplitVerse keeps
            each share, reminder, and settlement traceable.
          </p>
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

      <section className="dashboard-preview-section reveal" id="preview">
        <div className="dashboard-copy">
          <h2>Balances, rooms, reminders, and savings in one view.</h2>
          <p>
            A fast read on money owed, money to receive, active rooms, recent
            transactions, reminders, and group savings progress.
          </p>

          <Link to="/signup" className="primary-btn">
            Build my dashboard
            <ArrowRight size={18} />
          </Link>
        </div>

        <div className="balance-ledger" aria-label="Dashboard preview">
          <div className="ledger-header">
            <span>Current balance</span>
            <strong>{formatCurrency(2450, { signed: true })}</strong>
          </div>
          <div className="ledger-row">
            <span>You owe</span>
            <strong>{formatCurrency(850)}</strong>
          </div>
          <div className="ledger-row">
            <span>You are owed</span>
            <strong>{formatCurrency(3300)}</strong>
          </div>
          <div className="ledger-row">
            <span>Active rooms</span>
            <strong>Goa Trip, Hostel 403, Office Lunch</strong>
          </div>
          <div className="ledger-row">
            <span>Reminders</span>
            <strong>4 pending</strong>
          </div>
        </div>
      </section>

      <section className="final-cta reveal">
        <div>
          <h2>Shared money can feel lighter.</h2>
          <p>
            Keep the bill, the people, the reminders, and the settlement trail
            in one clear place.
          </p>
        </div>
        <Link to="/signup" className="footer-primary-btn">
          Get started
          <ArrowRight size={18} />
        </Link>
      </section>

      <footer className="landing-footer">
        <div className="footer-head">
          <h2>Always ready when the group bill gets complicated.</h2>
        </div>

        <div className="footer-grid">
          {footerColumns.map((column) => (
            <div key={column.heading}>
              <h3>{column.heading}</h3>
              {column.links.map((link) =>
                link.href.startsWith("/") ? (
                  <Link to={link.href} key={link.label}>
                    {link.label}
                  </Link>
                ) : (
                  <a href={link.href} key={link.label}>
                    {link.label}
                  </a>
                )
              )}
            </div>
          ))}
        </div>

        <div className="footer-bottom">
          <span>Mobile App Coming Soon...</span>
        </div>
      </footer>
    </main>
  );
}
