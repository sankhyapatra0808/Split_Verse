import { useEffect, useMemo, useState } from "react";
import { Download, Filter, Search } from "lucide-react";

import DashboardLayout from "./dashboard/DashboardLayout";
import {
  getTransactions,
  type TransactionItem,
  type TransactionStatus,
} from "../lib/api";
import { useAppSettings } from "../context/useAppSettings";

function formatTransactionDate(dateValue: string) {
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
    year: "numeric",
  });
}

function formatSignedCurrency(
  amount: number,
  formatCurrency: (amount: number) => string
) {
  const prefix = amount >= 0 ? "+" : "-";
  return `${prefix}${formatCurrency(Math.abs(amount))}`;
}

export default function TransactionHistory() {
  const { formatCurrency } = useAppSettings();

  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [netMovement, setNetMovement] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TransactionStatus>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadTransactions() {
    setLoading(true);
    setError("");

    try {
      const data = await getTransactions({
        search,
        status,
      });

      setTransactions(data.transactions);
      setNetMovement(data.summary.netMovement);
    } catch (err) {
      console.error("Failed to load transactions:", err);
      setError("Could not load transaction history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const visibleTransactions = useMemo(() => transactions, [transactions]);

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadTransactions();
  }

  function handleExportCsv() {
    const header = ["Title", "Room", "Amount", "Status", "Type", "Date"];

    const rows = visibleTransactions.map((transaction) => [
      transaction.title,
      transaction.room,
      String(transaction.amount),
      transaction.displayStatus,
      transaction.type,
      transaction.createdAt,
    ]);

    const csvContent = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "splitverse-transactions.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout eyebrow="History">
      <section className="dashboard-page-grid">
        <article className="bento-card page-hero-card">
          <div className="bento-card-head">
            <div>
              <span>Transaction History</span>
              <h2>Every wallet movement, easy to audit.</h2>
            </div>
            <Download size={24} />
          </div>
          <p>
            Search, filter, and review payments, top-ups, settlements, and room
            expenses from one ledger-style page.
          </p>
        </article>

        <article className="bento-card transaction-tools-card">
          <form className="transaction-tools" onSubmit={handleSearchSubmit}>
            <label className="search-field">
              <Search size={18} />
              <input
                type="search"
                placeholder="Search transactions"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as TransactionStatus)
              }
            >
              <option value="all">All activity</option>
              <option value="received">Received</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="added">Added</option>
            </select>

            <button className="dashboard-secondary-button" type="submit">
              <Filter size={18} />
              Filter
            </button>

            <button
              className="dashboard-primary-button"
              type="button"
              onClick={handleExportCsv}
              disabled={visibleTransactions.length === 0}
            >
              <Download size={18} />
              Export
            </button>
          </form>
        </article>

        <article className="bento-card transaction-table-card">
          <div className="bento-card-head">
            <div>
              <span>Ledger</span>
              <h2>Recent transactions</h2>
            </div>
          </div>

          <div className="transaction-list">
            {loading && (
              <div className="transaction-row">
                <div>
                  <strong>Loading transactions...</strong>
                  <span>Please wait</span>
                </div>
                <em>--</em>
                <span className="status-pill pending">Loading</span>
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

            {!loading && !error && visibleTransactions.length === 0 && (
              <div className="transaction-row">
                <div>
                  <strong>No transactions yet</strong>
                  <span>Add an expense or wallet entry to see it here.</span>
                </div>
                <em>{formatCurrency(0)}</em>
                <span className="status-pill pending">Empty</span>
                <time>--</time>
              </div>
            )}

            {!loading &&
              !error &&
              visibleTransactions.map((transaction) => (
                <div className="transaction-row" key={transaction.id}>
                  <div>
                    <strong>{transaction.title}</strong>
                    <span>{transaction.room}</span>
                  </div>
                  <em>
                    {formatSignedCurrency(transaction.amount, formatCurrency)}
                  </em>
                  <span className={`status-pill ${transaction.status}`}>
                    {transaction.displayStatus}
                  </span>
                  <time>{formatTransactionDate(transaction.createdAt)}</time>
                </div>
              ))}
          </div>
        </article>

        <article className="bento-card history-summary-card dark">
          <span>Net movement</span>
          <strong>{formatSignedCurrency(netMovement, formatCurrency)}</strong>
          <p>
            Across {visibleTransactions.length} recorded transaction
            {visibleTransactions.length === 1 ? "" : "s"} in the current filter.
          </p>
        </article>
      </section>
    </DashboardLayout>
  );
}