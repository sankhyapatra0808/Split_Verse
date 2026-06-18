import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Bell,
  History,
  LayoutDashboard,
  LogOut,
  Plus,
  PlusCircle,
  Send,
  UserCircle,
  UsersRound,
  WalletCards,
} from "lucide-react";

import logo from "../../assets/Logo.png";
import "../../styles/Dashboard.css";
import { useAuth } from "../../context/useAuth";

const sidebarLinks = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Shared Split Rooms", icon: UsersRound, to: "/split-rooms" },
  { label: "Wallet & Balance", icon: WalletCards, to: "/wallet" },
  { label: "Wallet Top-Up", icon: PlusCircle, to: "/wallet-top-up" },
  { label: "Transaction History", icon: History, to: "/transactions" },
];

type DashboardLayoutProps = {
  children: ReactNode;
  eyebrow?: string;
};

function getUsername(userName?: string | null, userEmail?: string | null) {
  if (userName) {
    return userName.split(" ")[0];
  }

  if (userEmail) {
    return userEmail.split("@")[0];
  }

  return "there";
}

export default function DashboardLayout({
  children,
  eyebrow = "Overview",
}: DashboardLayoutProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const username = getUsername(user?.displayName, user?.email);

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar" aria-label="Dashboard navigation">
        <NavLink to="/" className="dashboard-brand" aria-label="SplitVerse home">
          <img src={logo} alt="SplitVerse logo" />
          <span>SplitVerse</span>
        </NavLink>

        <nav className="dashboard-nav">
          {sidebarLinks.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                className={({ isActive }) =>
                  isActive ? "dashboard-nav-item active" : "dashboard-nav-item"
                }
                to={item.to}
                key={item.label}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="dashboard-sidebar-actions">
          <NavLink className="sidebar-action secondary" to="/transactions">
            <Send size={18} />
            <span>Send Money</span>
          </NavLink>
          <NavLink className="sidebar-action primary" to="/wallet-top-up">
            <Plus size={18} />
            <span>Add money</span>
          </NavLink>
        </div>
      </aside>

      <section className="dashboard-content">
        <header className="dashboard-topbar">
          <div>
            <span className="dashboard-kicker">{eyebrow}</span>
            <h1>Hi, {username}. Welcome to SplitVerse</h1>
          </div>

          <div className="dashboard-topbar-actions">
            <button className="notification-button" type="button" aria-label="Notifications">
              <Bell size={20} />
              <span aria-hidden="true" />
            </button>
            <button className="profile-button" type="button" aria-label="Profile">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="profile-photo" />
              ) : (
                <UserCircle size={30} />
              )}
            </button>
            <button className="logout-button" type="button" onClick={handleLogout}>
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {children}
      </section>
    </main>
  );
}
