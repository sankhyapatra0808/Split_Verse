import { type FormEvent, useEffect, useState } from "react";
import {
  CreditCard,
  Landmark,
  type LucideIcon,
  PlusCircle,
  Smartphone,
} from "lucide-react";
import {
  getRecentWalletTopUps,
  type WalletTopUpItem,
  type WalletTopUpMethod,
  topUpWallet,
} from "../lib/api";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useAppSettings } from "../context/useAppSettings";
import { withTopProgress } from "../utils/topProgress";
import DashboardLayout from "./dashboard/DashboardLayout";
import "../styles/WalletTopUp.css";

const amounts = [500, 1000, 2000, 5000];
const methods = [
  { label: "UPI", value: "UPI", icon: Smartphone },
  { label: "Card", value: "Card", icon: CreditCard },
  { label: "Net banking", value: "Net banking", icon: Landmark },
] satisfies { label: string; value: WalletTopUpMethod; icon: LucideIcon }[];

function formatTopUpDate(dateValue: string) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDate = (first: Date, second: Date) =>
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate();

  if (isSameDate(date, today)) {
    return "Today";
  }

  if (isSameDate(date, yesterday)) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export default function WalletTopUp() {
  const { defaultTopUpMethod, formatCurrency } = useAppSettings();
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

  const topUpAmount = customAmount ? Number(customAmount) : selectedAmount;

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

  async function handleTopUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!Number.isFinite(topUpAmount) || topUpAmount <= 0) {
      setError("Enter a valid amount greater than 0.");
      setMessage("");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      await withTopProgress(async () => {
        const response = await topUpWallet({
          amount: topUpAmount,
          method: selectedMethod,
        });

        window.dispatchEvent(new Event("splitverse:data-updated"));

        setMessage(
          `Wallet topped up successfully. New balance: ${formatCurrency(
            response.walletBalance,
          )}`,
        );

        setCustomAmount("");
        await loadRecentTopUps({ silent: true });
      });
    } catch (err) {
      console.error("Wallet top-up failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not top up wallet. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout eyebrow="Top-up">
      <section className="dashboard-page-grid">
        <article className="bento-card page-hero-card dark">
          <div className="bento-card-head">
            <div>
              <span>Wallet Top-Up</span>
              <h2>Add money before the group settles.</h2>
            </div>
            <PlusCircle size={24} />
          </div>
          <p>
            Prepare your wallet for room settlements, reminders, and quick
            reimbursements without leaving SplitVerse.
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
              <span>Custom amount</span>
              <input
                type="number"
                min="1"
                max="10000"
                step="0.01"
                inputMode="decimal"
                placeholder="Custom amount"
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
              />
            </label>
            <button
              className="dashboard-primary-button"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Adding money" : "Add money to wallet"}
            </button>
            {message && <p className="wallet-success-message">{message}</p>}
            {error && <p className="wallet-error-message">{error}</p>}
          </form>
        </article>

        <article className="bento-card payment-method-card">
          <div className="bento-card-head">
            <div>
              <span>Payment method</span>
              <h2>Pick a source</h2>
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
        </article>

        <article className="bento-card topup-summary-card">
          <span>Top-up preview</span>
          <strong>
            {formatCurrency(Number.isFinite(topUpAmount) ? topUpAmount : 0)}
          </strong>
          <p>
            This top-up will be added through {selectedMethod}. Your wallet
            balance updates as soon as the payment is recorded.
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
              <div>
                <span>
                  <LoadingSkeleton />
                </span>
                <strong>{formatCurrency(0)}</strong>
                <em>--</em>
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
                  <em>{formatTopUpDate(topUp.createdAt)}</em>
                </div>
              ))}
          </div>
        </article>
      </section>
    </DashboardLayout>
  );
}
