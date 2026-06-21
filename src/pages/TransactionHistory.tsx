import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Download, Filter, Search, X } from "lucide-react";

import DashboardLayout from "./dashboard/DashboardLayout";
import {
  getTransactions,
  type TransactionItem,
  type TransactionStatus,
} from "../lib/api";
import Dropdown, { type DropdownOption } from "../components/Dropdown";
import LoadingSkeleton from "../components/LoadingSkeleton";
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

const visibleTransactionLimit = 10;

const statusOptions: DropdownOption<TransactionStatus>[] = [
  { value: "all", label: "All activity" },
  { value: "received", label: "Received" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "added", label: "Added" },
];

const exportModeOptions: DropdownOption<"count" | "year">[] = [
  { value: "count", label: "Last transactions" },
  { value: "year", label: "Previous years" },
];

export default function TransactionHistory() {
  const { formatCurrency } = useAppSettings();

  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [netMovement, setNetMovement] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TransactionStatus>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"count" | "year">("count");
  const [exportCount, setExportCount] = useState("100");
  const [exportYear, setExportYear] = useState(String(new Date().getFullYear()));
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [accountCreatedAt, setAccountCreatedAt] = useState("");

  async function loadTransactions() {
    setLoading(true);
    setError("");

    try {
      const data = await getTransactions({
        search,
        status,
        limit: visibleTransactionLimit,
      });

      setTransactions(data.transactions);
      setNetMovement(data.summary.netMovement);
      setTransactionTotal(data.summary.totalTillDate ?? data.summary.count);
      setAccountCreatedAt(data.summary.accountCreatedAt ?? "");
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

  const visibleTransactions = useMemo(
    () => transactions.slice(0, visibleTransactionLimit),
    [transactions]
  );
  const currentYear = new Date().getFullYear();
  const accountYear = useMemo(() => {
    const joinedDate = new Date(accountCreatedAt);

    return Number.isNaN(joinedDate.getTime())
      ? currentYear
      : joinedDate.getFullYear();
  }, [accountCreatedAt, currentYear]);
  const previousYearOptions = useMemo(
    () =>
      Array.from(
        { length: Math.max(currentYear - accountYear + 1, 1) },
        (_, index) => currentYear - index
      ),
    [accountYear, currentYear]
  );

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadTransactions();
  }

  async function handleExportCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericExportCount = Number(exportCount);
    const numericExportYear = Number(exportYear);

    if (
      exportMode === "count" &&
      (!Number.isFinite(numericExportCount) || numericExportCount <= 0)
    ) {
      setExportError("Enter how many past transactions to export.");
      return;
    }

    if (
      exportMode === "year" &&
      (!Number.isInteger(numericExportYear) ||
        numericExportYear < accountYear ||
        numericExportYear > currentYear)
    ) {
      setExportError("Choose a valid previous year.");
      return;
    }

    setExporting(true);
    setExportError("");

    try {
      const data = await getTransactions({
        search,
        status,
        exportMode,
        limit:
          exportMode === "count" ? Math.floor(numericExportCount) : undefined,
        year: exportMode === "year" ? numericExportYear : undefined,
      });

      if (data.transactions.length === 0) {
        setExportError("No transactions found for that export range.");
        return;
      }

      const header = ["Title", "Room", "Amount", "Status", "Type", "Date"];

      const rows = data.transactions.map((transaction) => [
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
      setExportDialogOpen(false);
    } catch (err) {
      console.error("Failed to export transactions:", err);
      setExportError("Could not export transactions.");
    } finally {
      setExporting(false);
    }
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

            <Dropdown
              ariaLabel="Transaction status filter"
              value={status}
              options={statusOptions}
              onChange={setStatus}
            />

            <button className="dashboard-secondary-button" type="submit">
              <Filter size={18} />
              Filter
            </button>

            <button
              className="dashboard-primary-button"
              type="button"
              onClick={() => {
                setExportError("");
                setExportDialogOpen(true);
              }}
              disabled={exporting || visibleTransactions.length === 0}
            >
              <Download size={18} />
              Export
            </button>
          </form>
        </article>

        <article className="bento-card transaction-table-card transaction-ledger-card">
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
            Showing the latest {visibleTransactions.length} recorded transaction
            {visibleTransactions.length === 1 ? "" : "s"} in the current filter.
          </p>
        </article>
      </section>

      {exportDialogOpen && (
        <div className="transaction-export-backdrop" role="presentation">
          <form
            className="transaction-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-export-title"
            onSubmit={handleExportCsv}
          >
            <div className="transaction-export-head">
              <div>
                <span>Export transactions</span>
                <h2 id="transaction-export-title">Choose export range</h2>
              </div>
              <button
                type="button"
                aria-label="Close export dialog"
                onClick={() => setExportDialogOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="transaction-export-stats">
              <div>
                <span>Joined year</span>
                <strong>{accountYear}</strong>
              </div>
              <div>
                <span>Transactions till date</span>
                <strong>{transactionTotal}</strong>
              </div>
            </div>

            <label>
              <span>Export menu</span>
              <Dropdown
                ariaLabel="Export menu"
                value={exportMode}
                options={exportModeOptions}
                onChange={setExportMode}
              />
            </label>

            {exportMode === "count" ? (
              <label>
                <span>Number of past transactions</span>
                <input
                  type="number"
                  min="1"
                  max="5000"
                  step="1"
                  value={exportCount}
                  onChange={(event) => setExportCount(event.target.value)}
                />
              </label>
            ) : (
              <label>
                <span>Previous year</span>
                <Dropdown
                  ariaLabel="Previous year"
                  value={exportYear}
                  options={previousYearOptions.map((year) => ({
                    value: String(year),
                    label: String(year),
                  }))}
                  onChange={setExportYear}
                />
              </label>
            )}

            {exportError && (
              <p className="transaction-export-message">{exportError}</p>
            )}

            <div className="transaction-export-actions">
              <button
                className="dashboard-secondary-button"
                type="button"
                onClick={() => setExportDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className="dashboard-primary-button"
                type="submit"
                disabled={exporting}
              >
                {exporting ? <LoadingSkeleton light /> : "Download CSV"}
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
