import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import {
  BarChart3,
  Check,
  CreditCard,
  IndianRupee,
  Plus,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import DashboardLayout from "./dashboard/DashboardLayout";
import {
  createExpense,
  getDashboardSummary,
  type DashboardSummary,
} from "../lib/api";
import Dropdown from "../components/Dropdown";
import { useAppSettings } from "../context/useAppSettings";
import { withTopProgress } from "../utils/topProgress";
import "../styles/Dashboard.css";

const TIME_SLOTS = [
  { label: "12 AM - 6 AM", startHour: 0 },
  { label: "6 AM - 12 PM", startHour: 6 },
  { label: "12 PM - 6 PM", startHour: 12 },
  { label: "6 PM - 12 AM", startHour: 18 },
];

const FALLBACK_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
].map((label) => ({ label, value: 0, amount: 0 }));

const expenseCategoryOptions = [
  "Food",
  "Travel",
  "Bills",
  "Shopping",
  "Subscription",
  "Shared",
  "Other",
].map((category) => ({ label: category, value: category }));

type ExpenseTimeSlots = NonNullable<
  DashboardSummary["expenseTracker"]
>["timeSlots"];
type MonthlySpendMonth = NonNullable<
  DashboardSummary["monthlySpend"]
>["months"][number];

function LoadingValue({ wide = false }: { wide?: boolean }) {
  return (
    <span
      className={
        wide ? "dashboard-value-skeleton wide" : "dashboard-value-skeleton"
      }
      aria-label="Loading value"
    />
  );
}

function getHourLabel(hour: number) {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const displayHour = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
  const suffix = normalizedHour < 12 ? "AM" : "PM";

  return `${displayHour} ${suffix}`;
}

function getHourWindowLabel(hour: number) {
  return `${getHourLabel(hour)} - ${getHourLabel(hour + 1)}`;
}

function getCurrentSlotIndex() {
  return Math.floor(new Date().getHours() / 6);
}

function buildExpenseSlots(
  timeSlots: ExpenseTimeSlots,
  totalSpentToday: number,
) {
  const currentSlotIndex = getCurrentSlotIndex();
  const currentHour = new Date().getHours();
  const suppliedSlots = Array.isArray(timeSlots) ? timeSlots : [];
  const maxAmount = Math.max(
    totalSpentToday,
    ...suppliedSlots.map((slot) => slot.amount),
    1,
  );

  return TIME_SLOTS.map((slot, index) => {
    const suppliedSlot = suppliedSlots.find(
      (item) => item.label.toLowerCase() === slot.label.toLowerCase(),
    );
    const amount =
      suppliedSlot?.amount ??
      (suppliedSlots.length === 0 && index === currentSlotIndex
        ? totalSpentToday
        : 0);
    const detail = suppliedSlot?.peakHour
      ? `Peak: ${suppliedSlot.peakHour}`
      : amount > 0 && index === currentSlotIndex
        ? `Active now: ${getHourWindowLabel(currentHour)}`
        : amount > 0
          ? "Spending recorded"
          : "No spending recorded";

    return {
      ...slot,
      amount,
      detail,
      value: Math.min(100, Math.round((amount / maxAmount) * 100)),
      active: index === currentSlotIndex,
    };
  });
}

function formatPeakDay(month: MonthlySpendMonth) {
  const suppliedDay = month.peakDay ?? month.peakSpendingDay;

  if (!suppliedDay) {
    return "No spend yet";
  }

  if (typeof suppliedDay === "number") {
    return `Day ${suppliedDay}`;
  }

  return suppliedDay;
}

function roundMoney(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export default function Dashboard() {
  const {
    appCurrency,
    convertCurrency,
    currencies,
    formatCurrency,
  } = useAppSettings();
  const [dashboardSummary, setDashboardSummary] =
    useState<DashboardSummary | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [expenseFormError, setExpenseFormError] = useState("");
  const [expenseForm, setExpenseForm] = useState({
    title: "",
    category: "Food",
    amount: "",
  });
  const activeCurrency =
    currencies.find((currency) => currency.code === appCurrency) ?? currencies[0];
  function convertSelectedCurrencyInputToInr(amount: number) {
    return roundMoney(convertCurrency(amount, appCurrency, "INR"));
  }

  async function reloadDashboard({ silent = false } = {}) {
    if (!silent) {
      setDashboardLoading(true);
    }

    try {
      const data = await getDashboardSummary();
      setDashboardSummary(data);
    } catch (error) {
      console.error("Failed to reload dashboard summary:", error);
    } finally {
      if (!silent) {
        setDashboardLoading(false);
      }
    }
  }

  function applyInstantExpenseToDashboard(amount: number) {
    setDashboardSummary((prev) => {
      if (!prev) {
        return prev;
      }

      const currentMonthIndex = new Date().getMonth();

      return {
        ...prev,
        metrics: {
          ...prev.metrics,
          todayExpense: (prev.metrics.todayExpense ?? 0) + amount,
        },
        expenseTracker: {
          ...prev.expenseTracker,
          totalSpentToday:
            (prev.expenseTracker?.totalSpentToday ??
              prev.metrics.todayExpense ??
              0) + amount,
          categories: prev.expenseTracker?.categories ?? [],
          timeSlots: prev.expenseTracker?.timeSlots,
        },
        monthlySpend: prev.monthlySpend
          ? {
              ...prev.monthlySpend,
              graphTotal: (prev.monthlySpend.graphTotal ?? 0) + amount,
              currentMonthTotal:
                (prev.monthlySpend.currentMonthTotal ?? 0) + amount,
              months: prev.monthlySpend.months.map((month, index) =>
                index === currentMonthIndex
                  ? {
                      ...month,
                      amount: month.amount + amount,
                    }
                  : month,
              ),
            }
          : prev.monthlySpend,
      };
    });
  }

  async function handleCreateExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = expenseForm.title.trim();
    const amountInSelectedCurrency = Number(expenseForm.amount);

    if (!title) {
      setExpenseFormError("Expense title is required.");
      return;
    }

    if (
      !Number.isFinite(amountInSelectedCurrency) ||
      amountInSelectedCurrency <= 0
    ) {
      setExpenseFormError(`Amount must be greater than 0 ${appCurrency}.`);
      return;
    }

    const amountInInr = convertSelectedCurrencyInputToInr(
      amountInSelectedCurrency,
    );

    if (!Number.isFinite(amountInInr) || amountInInr <= 0) {
      setExpenseFormError("Could not convert this amount to INR. Try again.");
      return;
    }

    const previousSummary = dashboardSummary;

    setExpenseFormError("");
    setExpenseSubmitting(true);

    try {
      await withTopProgress(async () => {
        await createExpense({
          title,
          category: expenseForm.category,
          amount: amountInInr,
        });

        applyInstantExpenseToDashboard(amountInInr);
        setExpenseForm({
          title: "",
          category: "Food",
          amount: "",
        });

        setExpenseFormOpen(false);
        window.dispatchEvent(
          new CustomEvent("splitverse:data-updated", {
            detail: { source: "dashboard-expense" },
          }),
        );
        void reloadDashboard({ silent: true });
      });
    } catch (error) {
      setDashboardSummary(previousSummary);
      console.error("Failed to create expense:", error);
      setExpenseFormError(
        error instanceof Error
          ? error.message
          : "Could not add expense. Please try again.",
      );
    } finally {
      setExpenseSubmitting(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardSummary() {
      try {
        const data = await getDashboardSummary();

        if (isMounted) {
          setDashboardSummary(data);
        }
      } catch (error) {
        console.error("Failed to load dashboard summary:", error);
      } finally {
        if (isMounted) {
          setDashboardLoading(false);
        }
      }
    }

    void loadDashboardSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleDataUpdated = () => {
      void reloadDashboard({ silent: true });
    };

    window.addEventListener("splitverse:data-updated", handleDataUpdated);
    window.addEventListener(
      "splitverse:pending-dues-updated",
      handleDataUpdated,
    );

    return () => {
      window.removeEventListener("splitverse:data-updated", handleDataUpdated);
      window.removeEventListener(
        "splitverse:pending-dues-updated",
        handleDataUpdated,
      );
    };
  }, []);

  const summaryMetrics = dashboardSummary?.metrics;

  const expenseTracker = dashboardSummary?.expenseTracker;
  const walletHealth = dashboardSummary?.walletHealth;
  const monthlySpend = dashboardSummary?.monthlySpend;

  const monthSpend = monthlySpend?.months ?? [];
  const displayedMonths = monthSpend.length > 0 ? monthSpend : FALLBACK_MONTHS;
  const maxMonthlyAmount = Math.max(
    ...displayedMonths.map((month) => month.amount),
    0,
  );

  const totalSpentToday =
    expenseTracker?.totalSpentToday ?? summaryMetrics?.todayExpense ?? 0;
  const currentMonthIndex = new Date().getMonth();
  const currentMonth = displayedMonths[currentMonthIndex];
  const monthlyExpenditure =
    monthlySpend?.currentMonthTotal ?? currentMonth?.amount ?? 0;
  const monthlyExpenditureLabel =
    monthlySpend?.currentMonthLabel ?? currentMonth?.label ?? "This month";
  const walletBalance =
    walletHealth?.availableBalance ?? summaryMetrics?.walletBalance ?? 0;
  const receivable = walletHealth?.receivable ?? 0;
  const pendingPayment = summaryMetrics?.pendingPayment ?? 0;
  const graphTotal = monthlySpend?.graphTotal ?? 0;
  const spendingInsight =
    dashboardSummary?.spendingInsight?.text ??
    "No expenses recorded today yet.";
  const expenseTimeSlots = buildExpenseSlots(
    expenseTracker?.timeSlots,
    summaryMetrics?.todayExpense ?? totalSpentToday,
  );

  const metrics = [
    {
      label: "Today's expense",
      value: formatCurrency(summaryMetrics?.todayExpense ?? 0),
      tone: "down",
    },
    {
      label: "Pending payment",
      value: formatCurrency(pendingPayment),
      tone: "warn",
    },
    {
      label: "Receivable",
      value: formatCurrency(receivable),
      tone: "up",
    },
    {
      label: "Wallet balance",
      value: formatCurrency(walletBalance),
      tone: "blue",
    },
  ];

  return (
    <DashboardLayout>
      <div className="dashboard-action-row">
        <button
          className="add-expense-toggle"
          type="button"
          aria-expanded={expenseFormOpen}
          aria-controls="dashboard-expense-form"
          disabled={expenseSubmitting}
          onClick={() => {
            setExpenseFormOpen((prev) => !prev);
            setExpenseFormError("");
          }}
        >
          {expenseFormOpen ? <X size={18} /> : <Plus size={18} />}
          {expenseFormOpen ? "Close" : "Add Expense"}
        </button>
      </div>

      {expenseFormOpen && (
        <section className="bento-card expense-composer-card">
          <div className="bento-card-head">
            <div>
              <span>Quick entry</span>
              <h2>Add expense</h2>
            </div>
            <ReceiptText size={22} />
          </div>

          <form
            id="dashboard-expense-form"
            className="add-expense-form"
            onSubmit={handleCreateExpense}
          >
            <label>
              <span>Title</span>
              <input
                type="text"
                placeholder="Coffee, cab, groceries"
                value={expenseForm.title}
                required
                onChange={(event) =>
                  setExpenseForm((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
              />
            </label>

            <label className="expense-category-field">
              <span>Category</span>
              <Dropdown
                ariaLabel="Expense category"
                value={expenseForm.category}
                options={expenseCategoryOptions}
                onChange={(category) =>
                  setExpenseForm((prev) => ({
                    ...prev,
                    category,
                  }))
                }
              />
            </label>

            <label>
              <span>Amount ({appCurrency})</span>
              <span className="expense-amount-field">
                <span className="expense-currency-symbol" aria-hidden="true">
                  {activeCurrency.symbol}
                </span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="0.00"
                  value={expenseForm.amount}
                  required
                  onChange={(event) =>
                    setExpenseForm((prev) => ({
                      ...prev,
                      amount: event.target.value,
                    }))
                  }
                />
              </span>
            </label>

            <button type="submit" disabled={expenseSubmitting}>
              <Check size={17} />
              {expenseSubmitting ? "Saving Expense" : "Save Expense"}
            </button>

            {expenseFormError && (
              <p className="add-expense-error">{expenseFormError}</p>
            )}
          </form>
        </section>
      )}

      <section
        className="dashboard-bento"
        aria-label="SplitVerse dashboard summary"
      >
        <article className="bento-card expense-tracker-card">
          <div className="bento-card-head">
            <div>
              <span>Expense tracker</span>
              <h2>Today's spending mix</h2>
            </div>
            <ReceiptText size={22} />
          </div>

          <div className="expense-tracker-body">
            <div className="expense-ring" aria-label="Expense tracker graph">
              <strong>
                {dashboardLoading ? (
                  <LoadingValue />
                ) : (
                  formatCurrency(totalSpentToday)
                )}
              </strong>
              <span>spent</span>
            </div>

            <div
              className="expense-list"
              aria-label="Expense tracker by six hour time blocks"
            >
              {expenseTimeSlots.map((slot) => (
                <div
                  className={
                    slot.active
                      ? "expense-line time-slot active"
                      : "expense-line time-slot"
                  }
                  key={slot.label}
                >
                  <div>
                    <span>{slot.label}</span>
                    <strong>
                      {dashboardLoading ? (
                        <LoadingValue />
                      ) : (
                        formatCurrency(slot.amount)
                      )}
                    </strong>
                  </div>
                  <small>
                    {dashboardLoading ? <LoadingValue wide /> : slot.detail}
                  </small>
                  <span className="expense-meter">
                    <i
                      style={
                        {
                          "--meter-width": `${dashboardLoading ? 0 : slot.value}%`,
                        } as CSSProperties
                      }
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="bento-card summary-card">
          <div className="bento-card-head">
            <div>
              <span>Daily summary</span>
              <h2>Money snapshot</h2>
            </div>
            <WalletCards size={23} />
          </div>

          <div className="summary-metric-grid">
            {metrics.map((metric) => (
              <div
                className={`summary-metric ${metric.tone}`}
                key={metric.label}
              >
                <span>{metric.label}</span>
                <strong>
                  {dashboardLoading ? <LoadingValue /> : metric.value}
                </strong>
              </div>
            ))}
          </div>
        </article>

        <article className="bento-card total-spend-card">
          <div className="bento-card-head">
            <div>
              <span>Monthly expenditure</span>
              <h2>
                {dashboardLoading ? (
                  <LoadingValue wide />
                ) : (
                  formatCurrency(monthlyExpenditure)
                )}
              </h2>
            </div>
            <IndianRupee size={24} />
          </div>
          <p>
            {dashboardLoading ? (
              <LoadingValue wide />
            ) : (
              `${monthlyExpenditureLabel}: ${spendingInsight}`
            )}
          </p>
        </article>

        <article className="bento-card monthly-graph-card">
          <div className="bento-card-head">
            <div>
              <span>12 months spending graph</span>
              <h2>
                {dashboardLoading ? (
                  <LoadingValue wide />
                ) : (
                  formatCurrency(graphTotal)
                )}
              </h2>
            </div>
            <BarChart3 size={24} />
          </div>

          <div className="month-chart" aria-label="12 months spending graph">
            {displayedMonths.map((month) => {
              const normalizedValue =
                maxMonthlyAmount > 0
                  ? Math.round((month.amount / maxMonthlyAmount) * 100)
                  : month.value;
              const barHeight = dashboardLoading
                ? 0
                : Math.max(month.amount > 0 ? 8 : 0, normalizedValue);
              const peakDay = formatPeakDay(month);

              return (
                <div
                  className={
                    dashboardLoading ? "month-bar loading" : "month-bar"
                  }
                  key={month.label}
                  aria-label={`${month.label}: peak spend ${peakDay}, total ${formatCurrency(month.amount)}`}
                  tabIndex={dashboardLoading ? -1 : 0}
                >
                  <span
                    style={
                      {
                        "--bar-height": `${barHeight}%`,
                      } as CSSProperties
                    }
                  />
                  {!dashboardLoading && (
                    <strong className="month-tooltip" role="tooltip">
                      <span>{month.label}</span>
                      <small>Peak spend: {peakDay}</small>
                      <small>Total: {formatCurrency(month.amount)}</small>
                    </strong>
                  )}
                  <em>{month.label}</em>
                </div>
              );
            })}
          </div>
        </article>

        <article className="bento-card wallet-card">
          <div className="bento-card-head">
            <div>
              <span>Wallet health</span>
              <h2>Ready to settle</h2>
            </div>
            <ShieldCheck size={23} />
          </div>
          <div className="wallet-rows">
            <div>
              <CreditCard size={18} />
              <span>Available balance</span>
              <strong>
                {dashboardLoading ? (
                  <LoadingValue />
                ) : (
                  formatCurrency(walletBalance)
                )}
              </strong>
            </div>
            <div>
              <WalletCards size={18} />
              <span>Receivable</span>
              <strong>
                {dashboardLoading ? (
                  <LoadingValue />
                ) : (
                  formatCurrency(receivable)
                )}
              </strong>
            </div>
          </div>
        </article>
      </section>
    </DashboardLayout>
  );
}
