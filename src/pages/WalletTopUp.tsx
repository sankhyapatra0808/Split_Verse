import { type FormEvent, useEffect, useState } from "react";
import {
  CreditCard,
  Landmark,
  type LucideIcon,
  PlusCircle,
  Smartphone,
} from "lucide-react";
import {
  createRazorpayWalletOrder,
  getRecentWalletTopUps,
  type WalletTopUpItem,
  type WalletTopUpMethod,
  verifyRazorpayWalletPayment,
} from "../lib/api";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useAppSettings } from "../context/useAppSettings";
import { withTopProgress } from "../utils/topProgress";
import DashboardLayout from "./dashboard/DashboardLayout";
import "../styles/WalletTopUp.css";

const amounts = [500, 1000, 2000, 5000, 7500, 10000];
const maxTopUpAmountInInr = 100000;
const methods = [
  { label: "UPI", value: "UPI", icon: Smartphone },
  { label: "Card", value: "Card", icon: CreditCard },
  { label: "Net banking", value: "Net banking", icon: Landmark },
] satisfies { label: string; value: WalletTopUpMethod; icon: LucideIcon }[];

type RazorpayCheckoutResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
  };
  theme?: {
    color?: string;
  };
  handler: (response: RazorpayCheckoutResponse) => void | Promise<void>;
  modal?: {
    ondismiss?: () => void;
  };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

const razorpayScriptUrl = "https://checkout.razorpay.com/v1/checkout.js";
let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpayCheckout() {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = razorpayScriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout"));
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

function formatTopUpDate(dateValue: string) {
  if (!dateValue) {
    return "Unknown";
  }

  const rawValue = String(dateValue);

  if (/^\d{2}-\d{2}-\d{4}$/.test(rawValue)) {
    return rawValue;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    const [year, month, day] = rawValue.split("-");
    return `${day}-${month}-${year}`;
  }

  const normalizedValue = rawValue.replace(" ", "T");
  const hasTimezone = /z$|[+-]\d{2}:?\d{2}$/i.test(normalizedValue);
  const date = new Date(hasTimezone ? normalizedValue : `${normalizedValue}Z`);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  })
    .format(date)
    .replaceAll("/", "-");
}

function roundMoney(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export default function WalletTopUp() {
  const {
    appCurrency,
    convertCurrency,
    currencies,
    defaultTopUpMethod,
    formatCurrency,
    formatCurrencyValue,
  } = useAppSettings();
  const [selectedAmount, setSelectedAmount] = useState(1000);
  const [customAmount, setCustomAmount] = useState("");
  const [selectedMethod, setSelectedMethod] =
    useState<WalletTopUpMethod>(defaultTopUpMethod);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recentTopUps, setRecentTopUps] = useState<WalletTopUpItem[]>([]);
  const [loadingTopUps, setLoadingTopUps] = useState(true);
  const [topUpsError, setTopUpsError] = useState("");

  const activeCurrency =
    currencies.find((currency) => currency.code === appCurrency) ?? currencies[0];
  const customAmountInSelectedCurrency = Number(customAmount);
  const topUpAmount = customAmount
    ? roundMoney(convertCurrency(customAmountInSelectedCurrency, appCurrency, "INR"))
    : selectedAmount;
  const customAmountInInr =
    customAmount && Number.isFinite(customAmountInSelectedCurrency)
      ? topUpAmount
      : 0;

  useEffect(() => {
    setSelectedMethod(defaultTopUpMethod);
  }, [defaultTopUpMethod]);

  async function loadRecentTopUps({ silent = false } = {}) {
    if (!silent) {
      setLoadingTopUps(true);
    }

    setTopUpsError("");

    try {
      const data = await getRecentWalletTopUps();
      setRecentTopUps(data.topUps);
    } catch (err) {
      console.error("Failed to load wallet top-ups:", err);
      setTopUpsError("Could not load recent top-ups.");
    } finally {
      if (!silent) {
        setLoadingTopUps(false);
      }
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRecentTopUps();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleDataUpdated = () => {
      void loadRecentTopUps({ silent: true });
    };

    window.addEventListener("splitverse:data-updated", handleDataUpdated);

    return () => {
      window.removeEventListener("splitverse:data-updated", handleDataUpdated);
    };
  }, []);

  async function openRazorpayCheckout() {
    const order = await createRazorpayWalletOrder({
      amount: topUpAmount,
      method: selectedMethod,
    });

    await loadRazorpayCheckout();

    const RazorpayCheckout = window.Razorpay;

    if (!RazorpayCheckout) {
      throw new Error("Razorpay Checkout is unavailable. Please try again.");
    }

    await new Promise<void>((resolve, reject) => {
      let completed = false;
      const checkout = new RazorpayCheckout({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        order_id: order.orderId,
        prefill: order.prefill,
        theme: {
          color: "#0052ff",
        },
        handler: async (response) => {
          completed = true;

          try {
            const verified = await verifyRazorpayWalletPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });

            window.dispatchEvent(new Event("splitverse:data-updated"));
            setMessage(
              `Wallet topped up successfully. New balance: ${formatCurrency(
                verified.walletBalance,
              )}`,
            );
            setCustomAmount("");
            await loadRecentTopUps({ silent: true });
            resolve();
          } catch (verifyError) {
            reject(verifyError);
          }
        },
        modal: {
          ondismiss: () => {
            if (!completed) {
              reject(new Error("Payment cancelled before completion."));
            }
          },
        },
      });

      checkout.open();
    });
  }

  async function handleTopUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!Number.isFinite(topUpAmount) || topUpAmount <= 0) {
      setError(`Enter a valid amount greater than 0 ${appCurrency}.`);
      setMessage("");
      return;
    }

    if (topUpAmount > maxTopUpAmountInInr) {
      setError(`Wallet top-up cannot exceed ${formatCurrencyValue(maxTopUpAmountInInr, "INR")}.`);
      setMessage("");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      await withTopProgress(openRazorpayCheckout);
    } catch (err) {
      console.error("Razorpay wallet top-up failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not complete Razorpay top-up. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout eyebrow="Top-up">
      <section className="dashboard-page-grid wallet-topup-grid">
        <article className="bento-card page-hero-card dark">
          <div className="bento-card-head">
            <div>
              <span>Wallet Top-Up</span>
              <h2>Add money securely with Razorpay.</h2>
            </div>
            <PlusCircle size={24} />
          </div>
          <p>
            SplitVerse creates a Razorpay order in INR and credits your wallet
            only after the payment signature is verified by the backend.
          </p>
        </article>

        <article className="bento-card topup-form-card">
          <div className="bento-card-head">
            <div>
              <span>Add funds</span>
              <h2>Choose amount</h2>
            </div>
          </div>

          <form className="dashboard-form" onSubmit={handleTopUp}>
            <div className="amount-grid" aria-label="Amount presets">
              {amounts.map((amount) => (
                <button
                  type="button"
                  key={amount}
                  className={
                    selectedAmount === amount && !customAmount ? "active" : ""
                  }
                  onClick={() => {
                    setSelectedAmount(amount);
                    setCustomAmount("");
                  }}
                >
                  {formatCurrency(amount)}
                </button>
              ))}
            </div>
            <label>
              <span>Custom amount ({activeCurrency.symbol} {appCurrency})</span>
              <input
                type="number"
                min="1"
                step="0.01"
                inputMode="decimal"
                placeholder="Custom amount"
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
              />
              {appCurrency !== "INR" && customAmount && (
                <small className="currency-input-helper">
                  Razorpay will process {formatCurrencyValue(customAmountInInr, "INR")}
                </small>
              )}
            </label>
            <button
              className="dashboard-primary-button"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Opening Razorpay" : "Pay with Razorpay"}
            </button>
            {message && <p className="wallet-success-message">{message}</p>}
            {error && <p className="wallet-error-message">{error}</p>}
          </form>
        </article>

        <article className="bento-card payment-method-card">
          <div className="bento-card-head">
            <div>
              <span>Preferred method</span>
              <h2>Checkout source</h2>
            </div>
          </div>
          <div className="method-list">
            {methods.map((method) => {
              const Icon = method.icon;
              return (
                <label
                  className={`method-row${
                    selectedMethod === method.value ? " active" : ""
                  }`}
                  key={method.label}
                >
                  <input
                    name="payment-method"
                    type="radio"
                    checked={selectedMethod === method.value}
                    onChange={() => setSelectedMethod(method.value)}
                  />
                  <span>
                    <Icon size={19} />
                  </span>
                  <strong>{method.label}</strong>
                </label>
              );
            })}
          </div>
          <p className="razorpay-helper-text">
            Razorpay will still show all enabled payment methods from your
            Razorpay Dashboard. This selection is saved in SplitVerse history.
          </p>
        </article>

        <article className="bento-card topup-summary-card">
          <span>Top-up preview</span>
          <strong>
            {formatCurrency(Number.isFinite(topUpAmount) ? topUpAmount : 0)}
          </strong>
          <p>
            The app can accept your selected display currency, but Razorpay and
            SplitVerse wallet accounting stay in INR for safe settlement.
          </p>
        </article>

        <article className="bento-card recent-topups-card">
          <div className="bento-card-head">
            <div>
              <span>Recent top-ups</span>
              <h2>Funding activity</h2>
            </div>
          </div>
          <div className="compact-list">
            {loadingTopUps && (
              <div className="topup-row-skeleton" aria-label="Loading recent top-up">
                <span>
                  <LoadingSkeleton />
                </span>
                <strong>
                  <LoadingSkeleton wide />
                </strong>
                <em>
                  <LoadingSkeleton />
                </em>
              </div>
            )}

            {!loadingTopUps && topUpsError && (
              <div>
                <span>{topUpsError}</span>
                <strong>{formatCurrency(0)}</strong>
                <em>Error</em>
              </div>
            )}

            {!loadingTopUps && !topUpsError && recentTopUps.length === 0 && (
              <div>
                <span>No top-ups yet</span>
                <strong>{formatCurrency(0)}</strong>
                <em>Empty</em>
              </div>
            )}

            {!loadingTopUps &&
              !topUpsError &&
              recentTopUps.map((topUp) => (
                <div key={topUp.id}>
                  <span>{topUp.method}</span>
                  <strong>{formatCurrency(topUp.amount)}</strong>
                  <em>{topUp.displayDate || formatTopUpDate(topUp.createdAt)}</em>
                </div>
              ))}
          </div>
        </article>
      </section>
    </DashboardLayout>
  );
}
