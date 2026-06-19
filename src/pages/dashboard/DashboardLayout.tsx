import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronRight,
  ContactRound,
  History,
  LayoutDashboard,
  LogOut,
  Plus,
  PlusCircle,
  Send,
  Settings,
  UserCircle,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

import logo from "../../assets/Logo.png";
import "../../styles/Dashboard.css";
import { useAuth } from "../../context/useAuth";
import { useAppSettings } from "../../context/useAppSettings";

const sidebarLinks = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Shared Split Rooms", icon: UsersRound, to: "/split-rooms" },
  { label: "Friends", icon: ContactRound, to: "/friends" },
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

function getUserInitials(userName?: string | null, userEmail?: string | null) {
  const fallbackName = userEmail?.split("@")[0] ?? "SV";
  const nameParts = (userName || fallbackName)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstInitial = nameParts[0]?.[0] ?? "S";
  const lastInitial =
    nameParts.length > 1
      ? nameParts[nameParts.length - 1]?.[0]
      : nameParts[0]?.[1] ?? "V";

  return `${firstInitial}${lastInitial}`.toUpperCase();
}

export default function DashboardLayout({
  children,
  eyebrow = "Overview",
}: DashboardLayoutProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { avatarId, compactMode, formatCurrency } = useAppSettings();
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const username = getUsername(user?.displayName, user?.email);
  const initials = getUserInitials(user?.displayName, user?.email);
  const notifications = [
    { title: "Mira sent a reminder", detail: "Dinner table is still open" },
    {
      title: "Wallet top-up completed",
      detail: `${formatCurrency(2000)} was added yesterday`,
    },
    { title: "Hostel 403 settled", detail: "Aarav cleared one room balance" },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  const renderAvatar = (size: "button" | "panel" = "button") => {
    if (avatarId === "initials") {
      return (
        <span className={`settings-avatar avatar-initials ${size === "panel" ? "large" : ""}`}>
          {initials}
        </span>
      );
    }

    if (user?.photoURL) {
      return (
        <img
          src={user.photoURL}
          alt="Profile"
          className={size === "panel" ? "profile-photo panel" : "profile-photo"}
        />
      );
    }

    return <UserCircle size={size === "panel" ? 54 : 34} />;
  };

  return (
    <main className={compactMode ? "dashboard-shell compact-workspace" : "dashboard-shell"}>
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
            <button
              className="profile-button"
              type="button"
              aria-label="Open profile panel"
              onClick={() => setProfilePanelOpen(true)}
            >
              {renderAvatar()}
            </button>
          </div>
        </header>

        {children}
      </section>

      {profilePanelOpen && (
        <button
          className="profile-panel-backdrop"
          type="button"
          aria-label="Close profile panel"
          onClick={() => setProfilePanelOpen(false)}
        />
      )}

      <aside
        className={profilePanelOpen ? "profile-panel open" : "profile-panel"}
        aria-label="Profile and notifications"
        aria-hidden={!profilePanelOpen}
      >
        <div className="profile-panel-head">
          <div className="profile-panel-person">
            {renderAvatar("panel")}
            <div>
              <span>Signed in as</span>
              <strong>{user?.displayName || username}</strong>
              <small>{user?.email}</small>
            </div>
          </div>
          <button
            className="profile-panel-close"
            type="button"
            aria-label="Close profile panel"
            onClick={() => setProfilePanelOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <section className="profile-panel-section">
          <div className="profile-panel-title">
            <Bell size={18} />
            <span>Recent notifications</span>
          </div>
          <div className="profile-notification-list">
            {notifications.map((notification) => (
              <div key={notification.title}>
                <strong>{notification.title}</strong>
                <span>{notification.detail}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="profile-panel-actions">
          <button
            className="profile-settings-button"
            type="button"
            onClick={() => {
              setProfilePanelOpen(false);
              navigate("/settings");
            }}
          >
            <Settings size={18} />
            <span>App settings</span>
            <ChevronRight size={18} />
          </button>
          <button className="profile-logout-button" type="button" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </main>
  );
}
