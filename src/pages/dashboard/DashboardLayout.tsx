import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  UserPlus,
  UserCircle,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

import logo from "../../assets/Logo-v2.png";
import { useAuth } from "../../context/useAuth";
import { useAppSettings } from "../../context/useAppSettings";
import {
  API_URL,
  cacheProfileDisplay,
  getCurrentDbUser,
  getFriendsSummary,
  readCachedProfileDisplay,
  getPendingDues,
  markSplitRoomReminderDiscussed,
  muteSplitRoomReminder,
  type FriendRequest,
  type PendingDue,
} from "../../lib/api";
import LoadingSkeleton from "../../components/LoadingSkeleton";
import { withTopProgress } from "../../utils/topProgress";

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

type LiveUpdatePayload = {
  type: string;
  reason?: string;
  roomId?: string;
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
  const userId = user?.uid;
  const cachedProfileDisplay = readCachedProfileDisplay(userId);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [pendingDues, setPendingDues] = useState<PendingDue[]>([]);
  const [pendingFriendRequests, setPendingFriendRequests] = useState<
    FriendRequest[]
  >([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [updatingReminderRoomId, setUpdatingReminderRoomId] = useState("");
  const [notificationsError, setNotificationsError] = useState("");
  const [profileDisplay, setProfileDisplay] = useState({
    avatarMode: cachedProfileDisplay?.avatarMode || "photo",
    displayPhotoUrl: cachedProfileDisplay?.displayPhotoUrl || user?.photoURL || "",
  });
  const username = getUsername(user?.displayName, user?.email);
  const initials = getUserInitials(user?.displayName, user?.email);
  const notificationCount = pendingDues.length + pendingFriendRequests.length;

  const loadProfileNotifications = useCallback(async () => {
    if (!userId) {
      setPendingDues([]);
      setPendingFriendRequests([]);
      setNotificationsError("");
      setNotificationsLoading(false);
      return;
    }

    try {
      setNotificationsLoading(true);
      setNotificationsError("");
      const [duesData, friendsData] = await Promise.all([
        getPendingDues(),
        getFriendsSummary(),
      ]);
      setPendingDues(duesData.dues);
      setPendingFriendRequests(
        friendsData.receivedRequests.filter(
          (request) => request.status === "pending",
        ),
      );
    } catch (error) {
      setNotificationsError(
        error instanceof Error
          ? error.message
          : "Failed to load notifications",
      );
      setPendingDues([]);
      setPendingFriendRequests([]);
    } finally {
      setNotificationsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfileNotifications();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProfileNotifications]);

  async function handleMuteDueReminder(roomId: string) {
    try {
      setUpdatingReminderRoomId(roomId);
      await muteSplitRoomReminder(roomId, 24);
      setPendingDues((prev) => prev.filter((due) => due.roomId !== roomId));
      window.dispatchEvent(new Event("splitverse:data-updated"));
    } finally {
      setUpdatingReminderRoomId("");
    }
  }

  async function handleDiscussedDueReminder(roomId: string) {
    try {
      setUpdatingReminderRoomId(roomId);
      await markSplitRoomReminderDiscussed(roomId);
      setPendingDues((prev) => prev.filter((due) => due.roomId !== roomId));
      window.dispatchEvent(new Event("splitverse:data-updated"));
    } finally {
      setUpdatingReminderRoomId("");
    }
  }

  const loadProfileDisplay = useCallback(async () => {
    if (!userId) {
      setProfileDisplay({ avatarMode: "photo", displayPhotoUrl: "" });
      return;
    }

    try {
      const response = await getCurrentDbUser();
      cacheProfileDisplay(response.user, userId);
      setProfileDisplay({
        avatarMode: response.user.avatar_mode === "initials" ? "initials" : "photo",
        displayPhotoUrl:
          response.user.display_photo_url ||
          response.user.profile_photo_url ||
          response.user.photo_url ||
          "",
      });
    } catch (error) {
      console.error("Failed to load profile display:", error);
      const cached = readCachedProfileDisplay(userId);
      setProfileDisplay({
        avatarMode: cached?.avatarMode || "photo",
        displayPhotoUrl: cached?.displayPhotoUrl || user?.photoURL || "",
      });
    }
  }, [user?.photoURL, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfileDisplay();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProfileDisplay]);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{
        avatarMode?: "photo" | "initials";
        displayPhotoUrl?: string;
      }>).detail;

      if (detail?.avatarMode || typeof detail?.displayPhotoUrl === "string") {
        setProfileDisplay((current) => ({
          avatarMode: detail.avatarMode || current.avatarMode,
          displayPhotoUrl:
            typeof detail.displayPhotoUrl === "string"
              ? detail.displayPhotoUrl
              : current.displayPhotoUrl,
        }));
      }

      void loadProfileDisplay();
    };

    window.addEventListener("splitverse:profile-updated", handleProfileUpdated);
    window.addEventListener("splitverse:data-updated", handleProfileUpdated);

    return () => {
      window.removeEventListener("splitverse:profile-updated", handleProfileUpdated);
      window.removeEventListener("splitverse:data-updated", handleProfileUpdated);
    };
  }, [loadProfileDisplay]);

  useEffect(() => {
    if (profilePanelOpen) {
      const timer = window.setTimeout(() => {
        void loadProfileNotifications();
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [loadProfileNotifications, profilePanelOpen]);

  useEffect(() => {
    const handlePendingDuesUpdated = () => {
      void loadProfileNotifications();
    };

    window.addEventListener(
      "splitverse:pending-dues-updated",
      handlePendingDuesUpdated,
    );

    return () => {
      window.removeEventListener(
        "splitverse:pending-dues-updated",
        handlePendingDuesUpdated,
      );
    };
  }, [loadProfileNotifications]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const liveUpdatesUser = user;
    const abortController = new AbortController();
    let retryTimer: number | undefined;

    async function connectLiveUpdates() {
      try {
        const token = await liveUpdatesUser.getIdToken();
        const response = await fetch(`${API_URL}/api/live/events`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error("Live update stream failed");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!abortController.signal.aborted) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split("\n\n");
          buffer = messages.pop() ?? "";

          messages.forEach((message) => {
            const eventName = message
              .split("\n")
              .find((line) => line.startsWith("event:"))
              ?.replace("event:", "")
              .trim();
            const dataLine = message
              .split("\n")
              .find((line) => line.startsWith("data:"));

            if (eventName !== "update" || !dataLine) {
              return;
            }

            const payload = JSON.parse(
              dataLine.replace("data:", "").trim(),
            ) as LiveUpdatePayload;

            void loadProfileNotifications();
            window.dispatchEvent(
              new CustomEvent<LiveUpdatePayload>("splitverse:data-updated", {
                detail: payload,
              }),
            );
          });
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Live updates disconnected:", error);
          retryTimer = window.setTimeout(connectLiveUpdates, 3000);
        }
      }
    }

    void connectLiveUpdates();

    return () => {
      abortController.abort();

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [loadProfileNotifications, user]);

  const handleLogout = async () => {
    await withTopProgress(() => logout());
    navigate("/", { replace: true });
  };

  const handlePendingDueClick = (roomId: string) => {
    setProfilePanelOpen(false);
    navigate(`/split-rooms?roomId=${encodeURIComponent(roomId)}`);
  };

  const handleFriendRequestClick = (requestId: string) => {
    setProfilePanelOpen(false);
    navigate(`/friends?requestId=${encodeURIComponent(requestId)}`);
  };

  const renderAvatar = (size: "button" | "panel" = "button") => {
    const shouldShowInitials = avatarId === "initials" || profileDisplay.avatarMode === "initials";
    const displayPhotoUrl = profileDisplay.displayPhotoUrl || user?.photoURL || "";

    if (shouldShowInitials) {
      return (
        <span className={`settings-avatar avatar-initials ${size === "panel" ? "large" : ""}`}>
          {initials}
        </span>
      );
    }

    if (displayPhotoUrl) {
      return (
        <img
          src={displayPhotoUrl}
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
          <NavLink className="sidebar-action secondary" to="/split-rooms">
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
              aria-label="Open profile and notifications panel"
              onClick={() => setProfilePanelOpen(true)}
            >
              {renderAvatar()}
              {notificationCount > 0 && (
                <span className="profile-notification-badge">
                  {notificationCount}
                </span>
              )}
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
            <span>Notifications</span>
          </div>
          {notificationsLoading ? (
            <p className="dashboard-muted-text">
              <LoadingSkeleton wide />
            </p>
          ) : notificationsError ? (
            <p className="dashboard-muted-text">{notificationsError}</p>
          ) : notificationCount === 0 ? (
            <p className="dashboard-muted-text">
              You have no pending notifications.
            </p>
          ) : (
            <div className="profile-notification-list">
              {pendingFriendRequests.map((request) => (
                <button
                  type="button"
                  key={request.id}
                  onClick={() => handleFriendRequestClick(request.id)}
                >
                  <strong className="profile-notification-heading">
                    <UserPlus size={16} />
                    Friend request from{" "}
                    {request.requester_name || request.requester_email}
                  </strong>
                  <span>{request.requester_email} - wants to add you.</span>
                </button>
              ))}
              {pendingDues.map((due) => (
                <div className="profile-notification-action-card" key={due.id}>
                  <button
                    type="button"
                    onClick={() => handlePendingDueClick(due.roomId)}
                  >
                    <strong>
                      {due.title} - {formatCurrency(due.amount)}
                    </strong>
                    <span>
                      {`${due.roomName} - pay to ${
                        due.receiverName || due.receiverEmail
                      }`}
                    </span>
                  </button>
                  <div className="profile-notification-mini-actions">
                    <button
                      type="button"
                      onClick={() => handleDiscussedDueReminder(due.roomId)}
                      disabled={updatingReminderRoomId === due.roomId}
                    >
                      Discussed
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMuteDueReminder(due.roomId)}
                      disabled={updatingReminderRoomId === due.roomId}
                    >
                      Mute 24h
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
