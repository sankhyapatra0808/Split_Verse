import { useEffect, useState } from "react";
import { CreditCard, WalletCards } from "lucide-react";

import DashboardLayout from "./dashboard/DashboardLayout";
import { getWalletSummary, type WalletSummaryResponse } from "../lib/api";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useAppSettings } from "../context/useAppSettings";
import "../styles/WalletBalance.css";

function formatDate(dateValue: string) {
  if (!dateValue) {
    return "Unknown";
  }

  const rawValue = String(dateValue);

  // If the backend sends a date-only value, display that exact calendar date.
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

export default function WalletBalance() {
  const { formatCurrency } = useAppSettings();

  const [walletData, setWalletData] = useState<WalletSummaryResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadWalletSummary({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
    }

    setError("");

    try {
      const data = await getWalletSummary();
      setWalletData(data);
    } catch (err) {
      console.error("Failed to load wallet summary:", err);
      setError("Could not load wallet details.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWalletSummary();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleDataUpdated = () => {
      void loadWalletSummary({ silent: true });
    };

    window.addEventListener("splitverse:data-updated", handleDataUpdated);

    return () => {
      window.removeEventListener("splitverse:data-updated", handleDataUpdated);
    };
  }, []);

  const summary = walletData?.summary;

  const availableBalance = summary?.availableBalance ?? 0;
  const pendingIncoming = summary?.pendingIncoming ?? 0;
  const pendingOutgoing = summary?.pendingOutgoing ?? 0;
  const netPosition = summary?.netPosition ?? 0;

  return (
    <DashboardLayout eyebrow="Wallet">
      <section className="dashboard-page-grid">
        <article className="bento-card page-hero-card">
          <div className="bento-card-head">
            <div>
              <span>Wallet Balance</span>
              <h2>Track your SplitVerse wallet ledger.</h2>
            </div>
            <WalletCards size={24} />
          </div>

          <p>
            This balance is calculated from your wallet activity and pending
            settlements. Real payment-provider wallet support can be added later.
          </p>
        </article>

        <article className="bento-card wallet-balance-overview-card">
          <div className="bento-card-head">
            <div>
              <span>Available balance</span>
              <h2>
                {loading ? (
                  <LoadingSkeleton />
                ) : (
                  formatCurrency(availableBalance)
                )}
              </h2>
            </div>
            <CreditCard size={24} />
          </div>

          <p>
            Based on wallet credits and debits recorded in your SplitVerse
            ledger.
          </p>

        </article>

        <article className="bento-card wallet-mini-card">
          <span>Pending incoming</span>
          <strong>
            {loading ? <LoadingSkeleton /> : formatCurrency(pendingIncoming)}
          </strong>
          <p>Money others need to settle with you.</p>
        </article>

        <article className="bento-card wallet-mini-card">
          <span>Pending outgoing</span>
          <strong>
            {loading ? <LoadingSkeleton /> : formatCurrency(pendingOutgoing)}
          </strong>
          <p>Money you need to settle with others.</p>
        </article>

        <article className="bento-card wallet-mini-card dark">
          <span>Net position</span>
          <strong>
            {loading
              ? <LoadingSkeleton light />
              : formatCurrency(netPosition, { signed: true })}
          </strong>
          <p>Available balance + incoming - outgoing.</p>
        </article>

        <article className="bento-card transaction-table-card wallet-ledger-card">
          <div className="bento-card-head">
            <div>
              <span>Wallet Activity</span>
              <h2>Recent wallet transactions</h2>
            </div>
          </div>

          <div className="transaction-list">
            {loading && (
              <div className="transaction-row">
                <div>
                  <strong>
                    <LoadingSkeleton />
                  </strong>
                  <span>
                    <LoadingSkeleton wide />
                  </span>
                </div>
                <em>--</em>
                <span className="status-pill pending">
                  <LoadingSkeleton />
                </span>
                <time>--</time>
              </div>
            )}

            {!loading && error && (
              <div className="transaction-row">
                <div>
                  <strong>{error}</strong>
                  <span>Check backend and try again.</span>
                </div>
                <em>--</em>
                <span className="status-pill pending">Error</span>
                <time>--</time>
              </div>
            )}

            {!loading &&
              !error &&
              walletData?.recentWalletTransactions.length === 0 && (
                <div className="transaction-row">
                  <div>
                    <strong>No wallet activity yet</strong>
                    <span>Top up your wallet to see entries here.</span>
                  </div>
                  <em>{formatCurrency(0)}</em>
                  <span className="status-pill pending">Empty</span>
                  <time>--</time>
                </div>
              )}

            {!loading &&
              !error &&
              walletData?.recentWalletTransactions.map((transaction) => (
                <div className="transaction-row" key={transaction.id}>
                  <div>
                    <strong>
                      {transaction.description ?? "Wallet transaction"}
                    </strong>
                    <span>
                      {transaction.type === "credit"
                        ? "Wallet credit"
                        : "Wallet debit"}
                    </span>
                  </div>

                  <em>
                    {transaction.type === "credit" ? "+" : "-"}
                    {formatCurrency(transaction.amount)}
                  </em>

                  <span
                    className={`status-pill ${
                      transaction.type === "credit" ? "added" : "paid"
                    }`}
                  >
                    {transaction.type === "credit" ? "Added" : "Paid"}
                  </span>

                  <time>{transaction.displayDate || formatDate(transaction.createdAt)}</time>
                </div>
              ))}
          </div>
        </article>

        <article className="bento-card transaction-table-card wallet-pending-card">
          <div className="bento-card-head">
            <div>
              <span>Settlement Queue</span>
              <h2>Pending settlements</h2>
            </div>
          </div>

          <div className="transaction-list">
            {loading && (
              <div className="transaction-row">
                <div>
                  <strong>
                    <LoadingSkeleton />
                  </strong>
                  <span>
                    <LoadingSkeleton wide />
                  </span>
                </div>
                <em>--</em>
                <span className="status-pill pending">
                  <LoadingSkeleton />
                </span>
                <time>--</time>
              </div>
            )}

            {!loading && error && (
              <div className="transaction-row">
                <div>
                  <strong>{error}</strong>
                  <span>Check backend and try again.</span>
                </div>
                <em>--</em>
                <span className="status-pill pending">Error</span>
                <time>--</time>
              </div>
            )}

            {!loading &&
              !error &&
              walletData?.pendingSettlements.length === 0 && (
                <div className="transaction-row">
                  <div>
                    <strong>No pending settlements</strong>
                    <span>You are all clear for now.</span>
                  </div>
                  <em>{formatCurrency(0)}</em>
                  <span className="status-pill received">Clear</span>
                  <time>--</time>
                </div>
              )}

            {!loading &&
              !error &&
              walletData?.pendingSettlements.map((settlement) => {
                const isIncoming = settlement.direction === "incoming";
                const personName = isIncoming
                  ? settlement.fromName || settlement.fromEmail
                  : settlement.toName || settlement.toEmail;

                return (
                  <div className="transaction-row" key={settlement.id}>
                    <div>
                      <strong>
                        {isIncoming ? "You will receive" : "You need to pay"}
                      </strong>
                      <span>{personName}</span>
                    </div>

                    <em>
                      {isIncoming ? "+" : "-"}
                      {formatCurrency(settlement.amount)}
                    </em>

                    <span className="status-pill pending">
                      {isIncoming ? "Incoming" : "Outgoing"}
                    </span>

                    <time>{settlement.displayDate || formatDate(settlement.createdAt)}</time>
                  </div>
                );
              })}
          </div>
        </article>
      </section>
    </DashboardLayout>
  );
}
