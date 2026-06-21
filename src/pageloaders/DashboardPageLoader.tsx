import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

import "../styles/DashboardPageLoader.css";

const navRows = Array.from({ length: 6 });
const statCards = Array.from({ length: 4 });
const chartBars = Array.from({ length: 12 });
const listRows = Array.from({ length: 4 });
const shortRows = Array.from({ length: 3 });

export type DashboardLoaderVariant =
  | "dashboard"
  | "splitRooms"
  | "wallet"
  | "walletTopUp"
  | "transactions"
  | "friends"
  | "settings";

type DashboardPageLoaderProps = {
  variant?: DashboardLoaderVariant;
};

function Shimmer({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={`dashboard-loader-shimmer ${className}`} style={style} />
  );
}

function LoaderCardHead() {
  return (
    <div className="loader-card-head">
      <Shimmer className="loader-small-line" />
      <Shimmer className="loader-heading" />
    </div>
  );
}

function HeroCard({ dark = false }: { dark?: boolean }) {
  return (
    <article
      className={
        dark
          ? "dashboard-loader-card loader-page-hero loader-card-dark-surface"
          : "dashboard-loader-card loader-page-hero"
      }
    >
      <LoaderCardHead />
      <Shimmer className="loader-paragraph" />
    </article>
  );
}

function FormCard({ compact = false }: { compact?: boolean }) {
  return (
    <article className="dashboard-loader-card loader-page-small">
      <LoaderCardHead />
      <div className="loader-form-stack">
        {(compact ? shortRows : listRows).map((_, index) => (
          <Shimmer className="loader-form-field" key={index} />
        ))}
      </div>
    </article>
  );
}

function ListCard({
  className = "loader-page-list",
  rows = 4,
}: {
  className?: string;
  rows?: number;
}) {
  return (
    <article className={`dashboard-loader-card ${className}`}>
      <LoaderCardHead />
      <div className="loader-list">
        {Array.from({ length: rows }).map((_, index) => (
          <Shimmer className="loader-list-row" key={index} />
        ))}
      </div>
    </article>
  );
}

function DarkMetricCard({ compact = false }: { compact?: boolean }) {
  return (
    <article className="dashboard-loader-card loader-card-dark">
      <Shimmer className="loader-dark-line" />
      <Shimmer className="loader-dark-number" />
      {!compact && <Shimmer className="loader-dark-copy" />}
    </article>
  );
}

function ChartCard() {
  return (
    <article className="dashboard-loader-card loader-card-mid">
      <div className="loader-month-chart">
        {chartBars.map((_, index) => (
          <Shimmer
            className="loader-month-bar"
            key={index}
            style={
              {
                "--loader-bar-scale": `${38 + ((index * 9) % 44)}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </article>
  );
}

function SplitRoomOverview() {
  return (
    <article className="dashboard-loader-card loader-page-list">
      <LoaderCardHead />
      <div className="loader-split-overview">
        <div className="loader-list">
          {shortRows.map((_, index) => (
            <Shimmer className="loader-list-row compact" key={index} />
          ))}
        </div>
        <div className="loader-balance-panel">
          <Shimmer className="loader-small-line" />
          {shortRows.map((_, index) => (
            <Shimmer className="loader-list-row compact" key={index} />
          ))}
        </div>
      </div>
    </article>
  );
}

function TopUpFormCard() {
  return (
    <article className="dashboard-loader-card loader-page-small">
      <LoaderCardHead />
      <div className="loader-amount-grid">
        {statCards.map((_, index) => (
          <Shimmer className="loader-amount-pill" key={index} />
        ))}
      </div>
      <Shimmer className="loader-form-field" />
      <Shimmer className="loader-button" />
    </article>
  );
}

function ToolsCard() {
  return (
    <article className="dashboard-loader-card loader-tools-card">
      <div className="loader-tools-grid">
        <Shimmer className="loader-search-field" />
        <Shimmer className="loader-form-field" />
        <Shimmer className="loader-button" />
        <Shimmer className="loader-button primary" />
      </div>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <article className="dashboard-loader-card loader-card-wide">
        <LoaderCardHead />

        <div className="loader-chart-row">
          <Shimmer className="loader-ring" />
          <div className="loader-list">
            {listRows.map((_, index) => (
              <Shimmer className="loader-list-row" key={index} />
            ))}
          </div>
        </div>
      </article>

      <article className="dashboard-loader-card loader-card-side">
        <div className="loader-stat-grid">
          {statCards.map((_, index) => (
            <Shimmer className="loader-stat-card" key={index} />
          ))}
        </div>
      </article>

      <DarkMetricCard compact />
      <ChartCard />
      <ListCard className="loader-card-mid" rows={3} />
    </>
  );
}

function SplitRoomsSkeleton() {
  return (
    <>
      <HeroCard dark />
      <FormCard />
      <SplitRoomOverview />
      <FormCard compact />
    </>
  );
}

function WalletSkeleton() {
  return (
    <>
      <HeroCard />
      <DarkMetricCard />
      <FormCard compact />
      <ListCard className="loader-page-small" rows={3} />
      <ListCard className="loader-page-small" rows={3} />
    </>
  );
}

function WalletTopUpSkeleton() {
  return (
    <>
      <HeroCard dark />
      <TopUpFormCard />
      <ListCard className="loader-page-small" rows={3} />
      <DarkMetricCard />
      <ListCard className="loader-page-small compact-list-card" rows={3} />
    </>
  );
}

function TransactionsSkeleton() {
  return (
    <>
      <HeroCard />
      <ToolsCard />
      <ListCard className="loader-page-list" rows={4} />
      <DarkMetricCard />
    </>
  );
}

function SettingsSkeleton() {
  return (
    <>
      <HeroCard />
      <FormCard />
      <FormCard />
      <ListCard className="loader-page-small" rows={3} />
      <ListCard className="loader-page-list" rows={4} />
    </>
  );
}

function FriendsSkeleton() {
  return (
    <>
      <HeroCard dark />
      <FormCard compact />
      <ListCard className="loader-page-list" rows={5} />
      <ListCard className="loader-page-small" rows={3} />
      <ListCard className="loader-page-small" rows={3} />
    </>
  );
}

const skeletons: Record<DashboardLoaderVariant, () => ReactElement> = {
  dashboard: DashboardSkeleton,
  splitRooms: SplitRoomsSkeleton,
  wallet: WalletSkeleton,
  walletTopUp: WalletTopUpSkeleton,
  transactions: TransactionsSkeleton,
  friends: FriendsSkeleton,
  settings: SettingsSkeleton,
};

export default function DashboardPageLoader({
  variant = "dashboard",
}: DashboardPageLoaderProps) {
  const Skeleton = skeletons[variant];
  const [progress, setProgress] = useState(0);
  const startedVariantRef = useRef<DashboardLoaderVariant | null>(null);

  useEffect(() => {
    if (startedVariantRef.current !== variant) {
      startedVariantRef.current = variant;
      setProgress(0);
    }

    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) {
          return current;
        }

        const nextStep = Math.max(0.16, (92 - current) * 0.035);
        return Math.min(92, current + nextStep);
      });
    }, 180);

    return () => {
      window.clearInterval(timer);
    };
  }, [variant]);

  return (
    <main className="dashboard-loader" aria-label="Loading dashboard page">
      <span className="dashboard-loader-progress" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </span>

      <aside className="dashboard-loader-sidebar">
        <div className="dashboard-loader-brand">
          <Shimmer className="loader-logo" />
          <Shimmer className="loader-brand-line" />
        </div>

        <nav className="dashboard-loader-nav" aria-hidden="true">
          {navRows.map((_, index) => (
            <Shimmer className="loader-nav-row" key={index} />
          ))}
        </nav>

        <div className="dashboard-loader-actions" aria-hidden="true">
          <Shimmer className="loader-action-row" />
          <Shimmer className="loader-action-row loader-action-primary" />
        </div>
      </aside>

      <section className="dashboard-loader-content">
        <header className="dashboard-loader-topbar">
          <div>
            <Shimmer className="loader-kicker" />
            <Shimmer className="loader-title" />
          </div>

          <div className="dashboard-loader-topbar-actions" aria-hidden="true">
            <Shimmer className="loader-icon" />
            <Shimmer className="loader-avatar" />
            <Shimmer className="loader-logout" />
          </div>
        </header>

        <section className="dashboard-loader-grid" aria-hidden="true">
          <Skeleton />
        </section>
      </section>
    </main>
  );
}
