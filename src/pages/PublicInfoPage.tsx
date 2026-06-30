import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createSupportTicket,
  getPublicPage,
  sendContactMessage,
  type PublicPage,
} from "../lib/api";
import "../styles/PublicInfoPage.css";

type Props = {
  slug: "about" | "contact" | "support" | "privacy" | "terms" | "security";
};

type FormState = {
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
};

const publicPageFallbacks: Record<Props["slug"], PublicPage> = {
  about: {
    slug: "about",
    title: "About SplitVerse",
    eyebrow: "About the company",
    summary:
      "SplitVerse helps friends, roommates, and groups split shared expenses fairly with item-wise accuracy and wallet-backed settlement records.",
    content: {
      highlights: [
        { label: "Purpose", value: "Fair item-wise splitting" },
        { label: "Primary market", value: "India-first shared expenses" },
        { label: "Core flow", value: "Track, split, adjust, settle" },
      ],
      sections: [
        {
          heading: "What we build",
          body:
            "SplitVerse is built for real shared spending where equal split is not always fair. Each item can be assigned to the person who actually used it, and room balances stay visible until the group is settled.",
        },
        {
          heading: "Why it exists",
          body:
            "Groups often pay bills in turns. SplitVerse keeps each room transparent, records who owes whom, and helps opposite dues collapse into a cleaner net settlement.",
          bullets: [
            "Item-wise bill ownership",
            "Friend-based rooms and settlements",
            "Wallet top-up and payment history",
            "Privacy-focused account controls",
          ],
        },
      ],
      actions: [{ label: "Start splitting", href: "/signup" }],
    },
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
  contact: {
    slug: "contact",
    title: "Contact SplitVerse",
    eyebrow: "Contact",
    summary:
      "Reach the SplitVerse team for product questions, partnerships, feedback, or account help.",
    content: {
      contactChannels: [
        { label: "Product help", value: "Use the live contact form below" },
        {
          label: "Support",
          value: "Create a ticket from the support page",
          href: "/support",
        },
      ],
      sections: [
        {
          heading: "When to contact us",
          body:
            "Use this page for general messages, product feedback, partnership discussions, and non-urgent account questions.",
        },
        {
          heading: "What helps us reply faster",
          body:
            "Include the email connected to your account, the page where you saw the issue, and a short description of what you expected to happen.",
        },
      ],
    },
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
  support: {
    slug: "support",
    title: "Live Support",
    eyebrow: "Support",
    summary:
      "Create a support ticket for account, wallet, split-room, friend invite, or payment-related issues.",
    content: {
      highlights: [
        { label: "Ticket status", value: "Stored live in database" },
        { label: "Best for", value: "Wallet, payments, rooms" },
        { label: "Priority", value: "Security and payments first" },
      ],
      sections: [
        {
          heading: "How support works",
          body:
            "Submit the form with the issue category and a clear explanation. The ticket is saved live and an email is sent to the support team for review.",
        },
        {
          heading: "Before submitting",
          body:
            "For payment issues, include the approximate payment time, amount, and whether Razorpay showed success or failure. Do not share your wallet PIN or password.",
        },
      ],
    },
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
  privacy: {
    slug: "privacy",
    title: "Privacy Policy",
    eyebrow: "Privacy",
    summary:
      "This page explains the kinds of account, wallet, friend, and split-room data SplitVerse uses to provide the service.",
    content: {
      sections: [
        {
          heading: "Data we use",
          body:
            "SplitVerse uses account identity, profile preferences, friends, split rooms, wallet transactions, and payment verification data to provide the app experience.",
        },
        {
          heading: "How data is protected",
          body:
            "Sensitive wallet actions are protected with wallet PIN verification. Payment verification is handled on the backend and secret keys are never placed in the frontend.",
        },
        {
          heading: "User controls",
          body:
            "Users can update profile preferences, export their data, and delete their account from account settings.",
        },
      ],
    },
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
  terms: {
    slug: "terms",
    title: "Terms of Service",
    eyebrow: "Terms",
    summary:
      "These terms describe how users should use SplitVerse for fair expense tracking, split rooms, wallet top-ups, and settlements.",
    content: {
      sections: [
        {
          heading: "Using SplitVerse",
          body:
            "Users should add accurate expenses, room members, item assignments, and settlement information. SplitVerse helps calculate dues, but users are responsible for checking shared expense details.",
        },
        {
          heading: "Payments and wallet",
          body:
            "Wallet top-ups and payments must be completed through verified payment flows. Wallet credits are finalized only after backend verification.",
        },
        {
          heading: "Misuse",
          body:
            "Users must not attempt fraud, payment abuse, spam friend invites, or unauthorized access to another account.",
        },
      ],
    },
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
  security: {
    slug: "security",
    title: "Security at SplitVerse",
    eyebrow: "Security",
    summary:
      "Security controls are designed around Firebase authentication, backend verification, wallet PIN protection, and safe payment processing.",
    content: {
      highlights: [
        { label: "Authentication", value: "Firebase Auth" },
        { label: "Payments", value: "Backend signature checks" },
        { label: "Wallet safety", value: "PIN protected actions" },
      ],
      sections: [
        {
          heading: "Authentication",
          body:
            "Protected APIs require a Firebase ID token. Backend routes verify the token before returning private account data.",
        },
        {
          heading: "Wallet protection",
          body:
            "Wallet PINs are never stored as plain text. Sensitive wallet actions require PIN verification before money moves.",
        },
        {
          heading: "Payment safety",
          body:
            "Razorpay payment success is not trusted by the client alone. The backend verifies payment signatures before wallet credit is applied.",
        },
        {
          heading: "What users should never share",
          body:
            "Never share your password, OTP, wallet PIN, Firebase token, or payment signature with anyone.",
        },
      ],
    },
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
};


const publicNavLinks: { label: string; href: string; slug: Props["slug"] }[] = [
  { label: "About", href: "/about", slug: "about" },
  { label: "Contact", href: "/contact", slug: "contact" },
  { label: "Support", href: "/support", slug: "support" },
  { label: "Privacy", href: "/privacy", slug: "privacy" },
  { label: "Terms", href: "/terms", slug: "terms" },
  { label: "Security", href: "/security", slug: "security" },
];

const initialFormState: FormState = {
  name: "",
  email: "",
  subject: "",
  category: "general",
  message: "",
};

export default function PublicInfoPage({ slug }: Props) {
  const [page, setPage] = useState<PublicPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [formError, setFormError] = useState("");
  const isContactPage = slug === "contact";
  const isSupportPage = slug === "support";
  const showLiveForm = isContactPage || isSupportPage;
  const activePage = page ?? publicPageFallbacks[slug];

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        setLoading(true);
        setError("");
        setPage(publicPageFallbacks[slug]);
        const response = await getPublicPage(slug);

        if (active) {
          setPage(response.page);
        }
      } catch (loadError) {
        if (active) {
          console.error("Failed to load public page:", loadError);
          setPage(publicPageFallbacks[slug]);
          setError("");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [slug]);

  const sections = activePage.content.sections ?? [];
  const highlights = activePage.content.highlights ?? [];
  const actions = activePage.content.actions ?? [];
  const contactChannels = activePage.content.contactChannels ?? [];
  const formTitle = useMemo(
    () => (isSupportPage ? "Create a support ticket" : "Send us a message"),
    [isSupportPage],
  );

  function updateForm(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleLiveFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFormMessage("");

    try {
      setSubmitting(true);

      if (isSupportPage) {
        const response = await createSupportTicket({
          name: form.name,
          email: form.email,
          subject: form.subject,
          category: form.category,
          message: form.message,
        });

        setFormMessage(`${response.message} Ticket ID: ${response.ticket.id}`);
      } else {
        const response = await sendContactMessage({
          name: form.name,
          email: form.email,
          subject: form.subject || "SplitVerse contact message",
          message: form.message,
        });

        setFormMessage(`${response.message} Reference ID: ${response.request.id}`);
      }

      setForm(initialFormState);
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : "Could not submit your message",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="public-info-page">
      <nav className="public-info-nav" aria-label="Public page navigation">
        <Link to="/" className="public-info-brand" aria-label="Back to SplitVerse home">
          SplitVerse
        </Link>

        <div className="public-info-nav-links">
          {publicNavLinks.map((link) => (
            <Link
              className={link.slug === slug ? "active" : undefined}
              to={link.href}
              key={link.slug}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <Link to="/" className="public-info-back-link">
          Back to home
        </Link>
      </nav>

      <section className="public-info-hero">
        <div>
          <span>{activePage.eyebrow || "SplitVerse"}</span>
          <h1>{loading ? "Loading..." : activePage.title}</h1>
          <p>{activePage.summary}</p>
        </div>
      </section>

      {error && <p className="public-info-alert error">{error}</p>}

      {!error && (
        <section className="public-info-grid">
          {highlights.length > 0 && (
            <article className="public-info-card public-info-highlights">
              {highlights.map((highlight) => (
                <div key={`${highlight.label}-${highlight.value}`}>
                  <span>{highlight.label}</span>
                  <strong>{highlight.value}</strong>
                </div>
              ))}
            </article>
          )}

          {sections.map((section) => (
            <article className="public-info-card" key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
              {section.bullets && section.bullets.length > 0 && (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}

          {contactChannels.length > 0 && (
            <article className="public-info-card public-info-channels">
              <h2>Contact channels</h2>
              {contactChannels.map((channel) => (
                <a
                  href={channel.href || "#"}
                  key={`${channel.label}-${channel.value}`}
                >
                  <span>{channel.label}</span>
                  <strong>{channel.value}</strong>
                </a>
              ))}
            </article>
          )}

          {showLiveForm && (
            <article className="public-info-card public-info-form-card">
              <h2>{formTitle}</h2>
              <form className="public-info-form" onSubmit={handleLiveFormSubmit}>
                <label>
                  <span>Name</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateForm("email", event.target.value)}
                    required
                  />
                </label>
                {isSupportPage && (
                  <label>
                    <span>Category</span>
                    <select
                      value={form.category}
                      onChange={(event) => updateForm("category", event.target.value)}
                    >
                      <option value="general">General</option>
                      <option value="payments">Payments</option>
                      <option value="wallet">Wallet</option>
                      <option value="friends">Friends</option>
                      <option value="split_rooms">Split rooms</option>
                      <option value="security">Security</option>
                    </select>
                  </label>
                )}
                <label>
                  <span>Subject</span>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(event) => updateForm("subject", event.target.value)}
                    required={isSupportPage}
                  />
                </label>
                <label className="public-info-form-wide">
                  <span>Message</span>
                  <textarea
                    rows={6}
                    value={form.message}
                    onChange={(event) => updateForm("message", event.target.value)}
                    required
                  />
                </label>
                {formError && <p className="public-info-alert error">{formError}</p>}
                {formMessage && <p className="public-info-alert">{formMessage}</p>}
                <button type="submit" disabled={submitting}>
                  {submitting ? "Sending..." : isSupportPage ? "Create ticket" : "Send message"}
                </button>
              </form>
            </article>
          )}

          {actions.length > 0 && (
            <article className="public-info-actions">
              {actions.map((action) => (
                <a href={action.href} key={`${action.label}-${action.href}`}>
                  {action.label}
                </a>
              ))}
            </article>
          )}
        </section>
      )}
    </main>
  );
}
