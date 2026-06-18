import { Download, Filter, Search } from "lucide-react";

import DashboardLayout from "./dashboard/DashboardLayout";

const transactions = [
  {
    title: "Dinner table settlement",
    room: "Restaurant Night",
    amount: "+Rs. 640",
    status: "Received",
    date: "Today",
  },
  {
    title: "Taxi split",
    room: "Goa Trip",
    amount: "-Rs. 280",
    status: "Paid",
    date: "Today",
  },
  {
    title: "Wallet top-up",
    room: "UPI",
    amount: "+Rs. 2,000",
    status: "Added",
    date: "Yesterday",
  },
  {
    title: "Groceries",
    room: "Hostel 403",
    amount: "-Rs. 840",
    status: "Pending",
    date: "May 20",
  },
];

export default function TransactionHistory() {
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
          <div className="transaction-tools">
            <label className="search-field">
              <Search size={18} />
              <input type="search" placeholder="Search transactions" />
            </label>
            <select defaultValue="all">
              <option value="all">All activity</option>
              <option value="received">Received</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
            <button className="dashboard-secondary-button" type="button">
              <Filter size={18} />
              Filter
            </button>
            <button className="dashboard-primary-button" type="button">
              <Download size={18} />
              Export
            </button>
          </div>
        </article>

        <article className="bento-card transaction-table-card">
          <div className="bento-card-head">
            <div>
              <span>Ledger</span>
              <h2>Recent transactions</h2>
            </div>
          </div>
          <div className="transaction-list">
            {transactions.map((transaction) => (
              <div className="transaction-row" key={`${transaction.title}-${transaction.date}`}>
                <div>
                  <strong>{transaction.title}</strong>
                  <span>{transaction.room}</span>
                </div>
                <em>{transaction.amount}</em>
                <span className={`status-pill ${transaction.status.toLowerCase()}`}>
                  {transaction.status}
                </span>
                <time>{transaction.date}</time>
              </div>
            ))}
          </div>
        </article>

        <article className="bento-card history-summary-card dark">
          <span>Net movement</span>
          <strong>+Rs. 1,520</strong>
          <p>Across 4 recorded transactions in the current filter.</p>
        </article>
      </section>
    </DashboardLayout>
  );
}
