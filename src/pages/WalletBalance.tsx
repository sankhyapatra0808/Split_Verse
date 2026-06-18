import { ArrowDownRight, ArrowUpRight, CheckCircle2, WalletCards } from "lucide-react";

import DashboardLayout from "./dashboard/DashboardLayout";

const settlementRows = [
  { name: "Mira", note: "Dinner table", amount: "+Rs. 640", type: "receive" },
  { name: "Kabir", note: "Taxi split", amount: "-Rs. 280", type: "pay" },
  { name: "Office Lunch", note: "Team room", amount: "+Rs. 1,180", type: "receive" },
];

const accountRows = [
  { label: "Primary wallet", value: "Rs. 12,480" },
  { label: "Pending incoming", value: "Rs. 3,300" },
  { label: "Pending outgoing", value: "Rs. 850" },
];

export default function WalletBalance() {
  return (
    <DashboardLayout eyebrow="Wallet">
      <section className="dashboard-page-grid">
        <article className="bento-card page-hero-card">
          <div className="bento-card-head">
            <div>
              <span>Wallet & balance</span>
              <h2>Ready money, visible dues.</h2>
            </div>
            <WalletCards size={24} />
          </div>
          <p>
            See your wallet balance, incoming money, outgoing dues, and room-wise
            settlement status in one calm financial surface.
          </p>
        </article>

        <article className="bento-card balance-total-card dark">
          <div className="balance-total-details">
            <span>Available balance</span>
            <strong>Rs. 12,480</strong>
            <p>Enough to settle every pending outgoing payment today.</p>
          </div>
        </article>

        <article className="bento-card balance-settings-card">
          <div className="bento-card-head">
            <div>
              <span>Preferences</span>
              <h2>Balance alerts</h2>
            </div>
          </div>
          <form className="dashboard-form compact">
            <label>
              <span>Low balance alert</span>
              <input type="text" defaultValue="Rs. 1,000" />
            </label>
            <label>
              <span>Reminder cadence</span>
              <select defaultValue="weekly">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="manual">Manual only</option>
              </select>
            </label>
            <button className="dashboard-secondary-button" type="button">
              Save preferences
            </button>
          </form>
        </article>

        <article className="bento-card account-breakdown-card">
          <div className="bento-card-head">
            <div>
              <span>Balance stack</span>
              <h2>Wallet summary</h2>
            </div>
          </div>
          <div className="compact-list">
            {accountRows.map((row) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="bento-card settlement-card wallet-settlement-card">
          <div className="bento-card-head">
            <div>
              <span>Settlements</span>
              <h2>Action queue</h2>
            </div>
            <CheckCircle2 size={23} />
          </div>
          <div className="settlement-list">
            {settlementRows.map((row) => (
              <div className="settlement-row" key={`${row.name}-${row.note}`}>
                <span className={row.type === "receive" ? "settlement-icon up" : "settlement-icon down"}>
                  {row.type === "receive" ? (
                    <ArrowDownRight size={18} />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}
                </span>
                <div>
                  <strong>{row.name}</strong>
                  <span>{row.note}</span>
                </div>
                <em>{row.amount}</em>
                <button type="button">
                  {row.type === "receive" ? "Remind" : "Pay"}
                </button>
              </div>
            ))}
          </div>
        </article>

      </section>
    </DashboardLayout>
  );
}
