import { CalendarDays, Plus, ReceiptText, UsersRound } from "lucide-react";

import DashboardLayout from "./dashboard/DashboardLayout";

const rooms = [
  {
    name: "Goa Trip",
    members: "7 members",
    balance: "Rs. 3,280",
    status: "2 pending",
  },
  {
    name: "Hostel 403",
    members: "5 members",
    balance: "Rs. 8,240",
    status: "Active",
  },
  {
    name: "Office Lunch",
    members: "11 members",
    balance: "Rs. 4,860",
    status: "Settling",
  },
];

const balances = [
  { name: "Mira", detail: "Owes you", amount: "Rs. 640" },
  { name: "Kabir", detail: "You owe", amount: "Rs. 280" },
  { name: "Aarav", detail: "Settled", amount: "Rs. 0" },
];

export default function SharedSplitRooms() {
  return (
    <DashboardLayout eyebrow="Shared rooms">
      <section className="dashboard-page-grid split-rooms-grid">
        <article className="bento-card page-hero-card dark">
          <div className="bento-card-head">
            <div>
              <span>Split among friends</span>
              <h2>Shared Split Rooms</h2>
            </div>
            <UsersRound size={24} />
          </div>
          <p>
            Create focused rooms for trips, meals, subscriptions, and flatmate
            expenses. Keep people, items, and settlements attached to the right
            context.
          </p>
        </article>

        <article className="bento-card room-form-card">
          <div className="bento-card-head">
            <div>
              <span>Create room</span>
              <h2>Start a new split</h2>
            </div>
            <Plus size={23} />
          </div>

          <form className="dashboard-form">
            <label>
              <span>Room name</span>
              <input type="text" placeholder="Weekend dinner" />
            </label>
            <label>
              <span>Members</span>
              <input type="text" placeholder="Add emails or names" />
            </label>
            <label>
              <span>Category</span>
              <select defaultValue="restaurant">
                <option value="restaurant">Restaurant</option>
                <option value="trip">Trip</option>
                <option value="flatmates">Flatmates</option>
                <option value="subscription">Subscription</option>
              </select>
            </label>
            <button className="dashboard-primary-button" type="button">
              Create room
            </button>
          </form>
        </article>

        <article className="bento-card room-list-card">
          <div className="bento-card-head">
            <div>
              <span>Active rooms</span>
              <h2>Room overview</h2>
            </div>
            <CalendarDays size={23} />
          </div>

          <div className="room-overview-grid">
            <div className="room-card-list compact">
              {rooms.map((room) => (
                <div className="room-row" key={room.name}>
                  <div>
                    <strong>{room.name}</strong>
                    <span>{room.members}</span>
                  </div>
                  <em>{room.balance}</em>
                  <button type="button">{room.status}</button>
                </div>
              ))}
            </div>

            <div className="member-balance-panel">
              <div>
                <span>Member balances</span>
                <strong>Who owes whom</strong>
              </div>
              <div className="member-balance-list">
                {balances.map((balance) => (
                  <div className="member-balance-row" key={balance.name}>
                    <span>{balance.name}</span>
                    <strong>{balance.detail}</strong>
                    <em>{balance.amount}</em>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="bento-card assignment-card">
          <div className="bento-card-head">
            <div>
              <span>Item assignment</span>
              <h2>Receipt split controls</h2>
            </div>
            <ReceiptText size={23} />
          </div>

          <div className="assignment-grid">
            <label>
              <span>Item</span>
              <input type="text" placeholder="Paneer tikka" />
            </label>
            <label>
              <span>Amount</span>
              <input type="text" placeholder="Rs. 420" />
            </label>
            <label>
              <span>Assign to</span>
              <select defaultValue="mira">
                <option value="mira">Mira</option>
                <option value="kabir">Kabir</option>
                <option value="aarav">Aarav</option>
              </select>
            </label>
            <button type="button">Add item</button>
          </div>
        </article>

      </section>
    </DashboardLayout>
  );
}
