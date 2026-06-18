import { CreditCard, Landmark, PlusCircle, Smartphone } from "lucide-react";

import DashboardLayout from "./dashboard/DashboardLayout";

const amounts = ["Rs. 500", "Rs. 1,000", "Rs. 2,000", "Rs. 5,000"];
const methods = [
  { label: "UPI", icon: Smartphone },
  { label: "Card", icon: CreditCard },
  { label: "Net banking", icon: Landmark },
];

export default function WalletTopUp() {
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

          <form className="dashboard-form">
            <div className="amount-grid" aria-label="Amount presets">
              {amounts.map((amount) => (
                <button type="button" key={amount}>
                  {amount}
                </button>
              ))}
            </div>
            <label>
              <span>Custom amount</span>
              <input type="text" placeholder="Rs. 750" />
            </label>
            <button className="dashboard-primary-button" type="button">
              Add money to wallet
            </button>
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
            {methods.map((method, index) => {
              const Icon = method.icon;
              return (
                <label className="method-row" key={method.label}>
                  <input
                    name="payment-method"
                    type="radio"
                    defaultChecked={index === 0}
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
          <strong>Rs. 2,000</strong>
          <p>Estimated wallet balance after top-up: Rs. 14,480.</p>
          <button className="dashboard-secondary-button" type="button">
            Review payment
          </button>
        </article>

        <article className="bento-card recent-topups-card">
          <div className="bento-card-head">
            <div>
              <span>Recent top-ups</span>
              <h2>Funding activity</h2>
            </div>
          </div>
          <div className="compact-list">
            <div>
              <span>UPI</span>
              <strong>Rs. 1,000</strong>
              <em>Today</em>
            </div>
            <div>
              <span>Card</span>
              <strong>Rs. 2,500</strong>
              <em>Yesterday</em>
            </div>
            <div>
              <span>Net banking</span>
              <strong>Rs. 5,000</strong>
              <em>May 18</em>
            </div>
          </div>
        </article>
      </section>
    </DashboardLayout>
  );
}
