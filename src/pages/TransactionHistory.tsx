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
import { withTopProgress } from "../utils/topProgress";

function formatTransactionDate(dateValue: string) {
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

function formatSignedCurrency(
  amount: number,
  formatCurrency: (amount: number) => string,
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
  const [exportYear, setExportYear] = useState(
    String(new Date().getFullYear()),
  );
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("csv");
  const [advancedFriendFilter, setAdvancedFriendFilter] = useState("");
  const [advancedRoomFilter, setAdvancedRoomFilter] = useState("");
  const [advancedMonthFilter, setAdvancedMonthFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [accountCreatedAt, setAccountCreatedAt] = useState("");

  async function loadTransactions({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
    }

    setError("");

    try {
      const combinedSearch = [search, advancedFriendFilter, advancedRoomFilter]
        .map((value) => value.trim())
        .filter(Boolean)
        .join(" ");
      const data = await getTransactions({
        search: combinedSearch,
        status,
        limit: visibleTransactionLimit,
        month: advancedMonthFilter ? Number(advancedMonthFilter) : undefined,
      });

      setTransactions(data.transactions);
      setNetMovement(data.summary.netMovement);
      setTransactionTotal(data.summary.totalTillDate ?? data.summary.count);
      setAccountCreatedAt(data.summary.accountCreatedAt ?? "");
    } catch (err) {
      console.error("Failed to load transactions:", err);
      setError("Could not load transaction history.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTransactions();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, advancedMonthFilter]);

  useEffect(() => {
    const handleDataUpdated = () => {
      void loadTransactions({ silent: true });
    };

    window.addEventListener("splitverse:data-updated", handleDataUpdated);

    return () => {
      window.removeEventListener("splitverse:data-updated", handleDataUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const visibleTransactions = useMemo(
    () => transactions.slice(0, visibleTransactionLimit),
    [transactions],
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
        (_, index) => currentYear - index,
      ),
    [accountYear, currentYear],
  );

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void withTopProgress(() => loadTransactions());
  }

  function openPdfPrintView(rows: TransactionItem[]) {
    const htmlRows = rows
      .map(
        (transaction) => `
          <tr>
            <td>${transaction.title}</td>
            <td>${transaction.room}</td>
            <td>${transaction.amount}</td>
            <td>${transaction.displayStatus}</td>
            <td>${transaction.type}</td>
            <td>${transaction.displayDate || formatTransactionDate(transaction.createdAt)}</td>
          </tr>`,
      )
      .join("");
    const printWindow = window.open("", "_blank", "noopener,noreferrer");

    if (!printWindow) {
      setExportError("Allow popups to open the PDF print view.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>SplitVerse Transactions</title>
          <style>
            body { font-family: Inter, Arial, sans-serif; padding: 28px; color: #172033; }
            h1 { margin: 0 0 8px; }
            p { color: #667085; }
            table { width: 100%; border-collapse: collapse; margin-top: 22px; }
            th, td { border: 1px solid #d0d5dd; padding: 10px; text-align: left; font-size: 12px; }
            th { background: #f2f4f7; }
          </style>
        </head>
        <body>
          <h1>SplitVerse transaction export</h1>
          <p>Use the browser print dialog and choose “Save as PDF”.</p>
          <table>
            <thead>
              <tr><th>Title</th><th>Room</th><th>Amount</th><th>Status</th><th>Type</th><th>Date</th></tr>
            </thead>
            <tbody>${htmlRows}</tbody>
          </table>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
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
      await withTopProgress(async () => {
        const combinedSearch = [search, advancedFriendFilter, advancedRoomFilter]
          .map((value) => value.trim())
          .filter(Boolean)
          .join(" ");
        const data = await getTransactions({
          search: combinedSearch,
          status,
          exportMode,
          limit:
            exportMode === "count" ? Math.floor(numericExportCount) : undefined,
          year: exportMode === "year" ? numericExportYear : undefined,
          month: advancedMonthFilter ? Number(advancedMonthFilter) : undefined,
        });

        if (data.transactions.length === 0) {
          setExportError("No transactions found for that export range.");
          return;
        }

        if (exportFormat === "pdf") {
          openPdfPrintView(data.transactions);
          setExportDialogOpen(false);
          return;
        }

        const header = ["Title", "Room", "Amount", "Status", "Type", "Date"];

        const rows = data.transactions.map((transaction) => [
          transaction.title,
          transaction.room,
          String(transaction.amount),
          transaction.displayStatus,
          transaction.type,
          transaction.displayDate ||
            formatTransactionDate(transaction.createdAt),
        ]);

        const csvContent = [header, ...rows]
          .map((row) =>
            row
              .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
              .join(","),
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
      });
    } catch (err) {
      console.error("Failed to export transactions:", err);
      setExportError("Could not export transactions.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <DashboardLayout eyebrow="History">
      <section className="dashboard-page-grid transaction-history-grid">
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

            <input
              className="transaction-advanced-input"
              type="search"
              placeholder="Friend filter"
              value={advancedFriendFilter}
              onChange={(event) => setAdvancedFriendFilter(event.target.value)}
            />

            <input
              className="transaction-advanced-input"
              type="search"
              placeholder="Room filter"
              value={advancedRoomFilter}
              onChange={(event) => setAdvancedRoomFilter(event.target.value)}
            />

            <input
              className="transaction-advanced-input compact"
              type="number"
              min="1"
              max="12"
              placeholder="Month"
              value={advancedMonthFilter}
              onChange={(event) => setAdvancedMonthFilter(event.target.value)}
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
                  <time>
                    {transaction.displayDate ||
                      formatTransactionDate(transaction.createdAt)}
                  </time>
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

            <label>
              <span>Export format</span>
              <Dropdown
                ariaLabel="Export format"
                value={exportFormat}
                options={[
                  { value: "csv", label: "CSV file" },
                  { value: "pdf", label: "PDF print view" },
                ]}
                onChange={setExportFormat}
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
                {exporting
                  ? exportFormat === "pdf"
                    ? "Preparing PDF"
                    : "Preparing CSV"
                  : exportFormat === "pdf"
                    ? "Open PDF view"
                    : "Download CSV"}
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
