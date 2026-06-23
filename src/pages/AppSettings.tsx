import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BellRing,
  Coins,
  CreditCard,
  Download,
  EyeOff,
  Mail,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

import Dropdown, { type DropdownOption } from "../components/Dropdown";
import {
  useAppSettings,
  type CurrencyCode,
  type WalletTopUpMethod,
} from "../context/useAppSettings";
import { useAuth } from "../context/useAuth";
import {
  deleteAccount,
  deleteFriend,
  downloadMyData,
  getFriendsSummary,
  type Friend,
} from "../lib/api";
import { withTopProgress } from "../utils/topProgress";
import DashboardLayout from "./dashboard/DashboardLayout";
import "../styles/AppSettings.css";

const deleteAccountConfirmationText = "/DeleteAccount";

function getFriendLabel(friend: Friend) {
  return friend.name || friend.email.split("@")[0] || friend.email;
}

function formatFriendshipAge(days: number) {
  if (days <= 0) {
    return "Friends today";
  }

  if (days === 1) {
    return "Friends for 1 day";
  }

  return `Friends for ${days} days`;
}

function downloadJsonFile(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function AppSettings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const {
    appCurrency,
    avatarId,
    compactMode,
    confirmBeforeWalletPayment,
    converterAmount,
    converterFrom,
    converterTo,
    currencies,
    defaultTopUpMethod,
    notificationPreferences,
    privacyMode,
    settlementReminders,
    clearLocalAppSettings,
    convertCurrency,
    formatCurrency,
    setAppCurrency,
    setAvatarId,
    setCompactMode,
    setConfirmBeforeWalletPayment,
    setConverterAmount,
    setConverterFrom,
    setConverterTo,
    setDefaultTopUpMethod,
    setNotificationPreference,
    setPrivacyMode,
    setSettlementReminders,
  } = useAppSettings();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendSearch, setFriendSearch] = useState("");
  const [deletingFriendId, setDeletingFriendId] = useState("");
  const [friendDeleteMessage, setFriendDeleteMessage] = useState("");
  const [friendDeleteError, setFriendDeleteError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [downloadingData, setDownloadingData] = useState(false);

  const convertedAmount = convertCurrency(
    converterAmount,
    converterFrom,
    converterTo,
  );
  const currencyOptions: DropdownOption<CurrencyCode>[] = currencies.map(
    (currency) => ({
      value: currency.code,
      label: `${currency.code} - ${currency.label}`,
    }),
  );
  const compactCurrencyOptions: DropdownOption<CurrencyCode>[] = currencies.map(
    (currency) => ({
      value: currency.code,
      label: currency.code,
    }),
  );
  const topUpMethodOptions: DropdownOption<WalletTopUpMethod>[] = [
    { value: "UPI", label: "UPI" },
    { value: "Card", label: "Card" },
    { value: "Net banking", label: "Net banking" },
  ];
  const canDeleteAccount = deleteConfirmation === deleteAccountConfirmationText;
  const trimmedFriendSearch = friendSearch.trim();
  const visibleFriends = useMemo(() => {
    const normalizedSearch = trimmedFriendSearch.toLowerCase();

    if (!normalizedSearch) {
      return friends;
    }

    return friends.filter((friend) =>
      `${friend.name ?? ""} ${friend.email}`
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [friends, trimmedFriendSearch]);

  useEffect(() => {
    let active = true;

    async function loadFriends() {
      try {
        setFriendsLoading(true);
        setFriendDeleteError("");
        const data = await getFriendsSummary();

        if (active) {
          setFriends(data.friends);
        }
      } catch (error) {
        if (active) {
          setFriendDeleteError(
            error instanceof Error ? error.message : "Could not load friends.",
          );
        }
      } finally {
        if (active) {
          setFriendsLoading(false);
        }
      }
    }

    void loadFriends();

    return () => {
      active = false;
    };
  }, []);

  async function handleDeleteFriend(friend: Friend) {
    const previousFriends = friends;

    setDeletingFriendId(friend.id);
    setFriendDeleteMessage("");
    setFriendDeleteError("");
    setFriends((prev) => prev.filter((item) => item.id !== friend.id));

    try {
      await withTopProgress(async () => {
        await deleteFriend(friend.id);
      });

      window.dispatchEvent(new Event("splitverse:data-updated"));
      setFriendDeleteMessage(`${getFriendLabel(friend)} was removed.`);
    } catch (error) {
      setFriends(previousFriends);
      setFriendDeleteError(
        `${
          error instanceof Error ? error.message : "Could not delete friend."
        } ${getFriendLabel(friend)} was restored to your list.`,
      );
    } finally {
      setDeletingFriendId("");
    }
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canDeleteAccount) {
      setDeleteError(`Type ${deleteAccountConfirmationText} to continue.`);
      return;
    }

    setDeletingAccount(true);
    setDeleteError("");

    try {
      await withTopProgress(async () => {
        await deleteAccount(deleteConfirmation);
        await logout();
      });
      navigate("/", { replace: true });
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Could not delete account. Please try again.",
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  async function handleDownloadMyData() {
    setSettingsMessage("");
    setSettingsError("");
    setDownloadingData(true);

    try {
      const serverData = await withTopProgress(downloadMyData);
      const exportedAt = new Date();

      downloadJsonFile(
        `splitverse-data-${exportedAt.toISOString().slice(0, 10)}.json`,
        {
          ...serverData,
          localSettings: {
            appCurrency,
            avatarId,
            compactMode,
            confirmBeforeWalletPayment,
            converterAmount,
            converterFrom,
            converterTo,
            defaultTopUpMethod,
            notificationPreferences,
            privacyMode,
            settlementReminders,
          },
        },
      );

      setSettingsMessage("Your SplitVerse data export was downloaded.");
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not download your SplitVerse data.",
      );
    } finally {
      setDownloadingData(false);
    }
  }

  function handleClearLocalSettings() {
    const confirmed = window.confirm(
      "Clear local app settings? This resets only this browser's SplitVerse preferences like currency, top-up method, privacy mode, and notification toggles. Your account, friends, wallet, and expenses will not be deleted.",
    );

    if (!confirmed) {
      return;
    }

    clearLocalAppSettings();
    setSettingsError("");
    setSettingsMessage("Local app settings were reset for this browser.");
  }

  return (
    <DashboardLayout eyebrow="Settings">
      <section className="dashboard-page-grid settings-grid">
        <article className="bento-card settings-card">
          <div className="bento-card-head">
            <div>
              <span>Profile privacy</span>
              <h2>Photo display</h2>
            </div>
            <Shield size={22} />
          </div>
          <div className="settings-toggle-list compact">
            <label>
              <UserRound size={19} />
              <span>
                <strong>Use initials instead of photo</strong>
                <small>
                  Hide your profile picture and show first and last initials.
                </small>
              </span>
              <input
                type="checkbox"
                checked={avatarId === "initials"}
                onChange={(event) =>
                  setAvatarId(event.target.checked ? "initials" : "current")
                }
              />
            </label>
          </div>
        </article>

        <article className="bento-card settings-card">
          <div className="bento-card-head">
            <div>
              <span>Application currency</span>
              <h2>Money display</h2>
            </div>
            <Coins size={22} />
          </div>
          <label className="settings-field">
            <span>Use this currency across the app</span>
            <Dropdown
              ariaLabel="Application currency"
              value={appCurrency}
              options={currencyOptions}
              onChange={setAppCurrency}
            />
          </label>
          <div className="settings-preview">
            <span>Example display</span>
            <strong>{formatCurrency(2480)}</strong>
          </div>
        </article>

        <article className="bento-card settings-card">
          <div className="bento-card-head">
            <div>
              <span>Currency converter</span>
              <h2>Quick conversion</h2>
            </div>
            <Coins size={22} />
          </div>
          <div className="converter-grid">
            <label className="settings-field">
              <span>Amount</span>
              <input
                type="number"
                min="0"
                value={converterAmount}
                onChange={(event) =>
                  setConverterAmount(Number(event.target.value || 0))
                }
              />
            </label>
            <label className="settings-field">
              <span>From</span>
              <Dropdown
                ariaLabel="Convert from currency"
                value={converterFrom}
                options={compactCurrencyOptions}
                onChange={setConverterFrom}
              />
            </label>
            <label className="settings-field">
              <span>To</span>
              <Dropdown
                ariaLabel="Convert to currency"
                value={converterTo}
                options={compactCurrencyOptions}
                onChange={setConverterTo}
              />
            </label>
          </div>
          <div className="settings-preview strong">
            <span>Converted amount</span>
            <strong>
              {
                currencies.find((currency) => currency.code === converterTo)
                  ?.symbol
              }{" "}
              {convertedAmount.toLocaleString("en-IN", {
                maximumFractionDigits: converterTo === "JPY" ? 0 : 2,
              })}
            </strong>
          </div>
        </article>

        <article className="bento-card settings-card">
          <div className="bento-card-head">
            <div>
              <span>Experience</span>
              <h2>User preferences</h2>
            </div>
            <SlidersHorizontal size={22} />
          </div>
          <div className="settings-toggle-list">
            <label>
              <BellRing size={19} />
              <span>
                <strong>Settlement reminders</strong>
                <small>Keep gentle nudges visible for pending dues.</small>
              </span>
              <input
                type="checkbox"
                checked={settlementReminders}
                onChange={(event) =>
                  setSettlementReminders(event.target.checked)
                }
              />
            </label>
            <label>
              <EyeOff size={19} />
              <span>
                <strong>Privacy mode</strong>
                <small>Hide money values when sharing your screen.</small>
              </span>
              <input
                type="checkbox"
                checked={privacyMode}
                onChange={(event) => setPrivacyMode(event.target.checked)}
              />
            </label>
            <label>
              <SlidersHorizontal size={19} />
              <span>
                <strong>Compact workspace</strong>
                <small>Prefer denser cards and tighter lists.</small>
              </span>
              <input
                type="checkbox"
                checked={compactMode}
                onChange={(event) => setCompactMode(event.target.checked)}
              />
            </label>
          </div>
        </article>

        <article className="bento-card settings-card">
          <div className="bento-card-head">
            <div>
              <span>Wallet defaults</span>
              <h2>Payment safety</h2>
            </div>
            <WalletCards size={22} />
          </div>

          <label className="settings-field">
            <span>Default wallet top-up method</span>
            <Dropdown
              ariaLabel="Default wallet top-up method"
              value={defaultTopUpMethod}
              options={topUpMethodOptions}
              onChange={setDefaultTopUpMethod}
            />
          </label>

          <div className="settings-toggle-list compact">
            <label>
              <ShieldCheck size={19} />
              <span>
                <strong>Ask before wallet payment</strong>
                <small>
                  Show a confirmation before paying split-room dues from wallet.
                </small>
              </span>
              <input
                type="checkbox"
                checked={confirmBeforeWalletPayment}
                onChange={(event) =>
                  setConfirmBeforeWalletPayment(event.target.checked)
                }
              />
            </label>
          </div>
        </article>

        <article className="bento-card settings-card">
          <div className="bento-card-head">
            <div>
              <span>Notifications</span>
              <h2>Preference center</h2>
            </div>
            <Mail size={22} />
          </div>

          <div className="settings-toggle-list">
            <label>
              <UsersRound size={19} />
              <span>
                <strong>Friend request emails</strong>
                <small>Allow email invites and friend request updates.</small>
              </span>
              <input
                type="checkbox"
                checked={notificationPreferences.friendRequestEmails}
                onChange={(event) =>
                  setNotificationPreference(
                    "friendRequestEmails",
                    event.target.checked,
                  )
                }
              />
            </label>
            <label>
              <ShieldCheck size={19} />
              <span>
                <strong>Login OTP emails</strong>
                <small>Receive email login codes for safer sign-in.</small>
              </span>
              <input
                type="checkbox"
                checked={notificationPreferences.loginOtpEmails}
                onChange={(event) =>
                  setNotificationPreference("loginOtpEmails", event.target.checked)
                }
              />
            </label>
            <label>
              <BellRing size={19} />
              <span>
                <strong>Settlement reminder emails</strong>
                <small>Allow reminders for pending balances and dues.</small>
              </span>
              <input
                type="checkbox"
                checked={notificationPreferences.settlementReminderEmails}
                onChange={(event) =>
                  setNotificationPreference(
                    "settlementReminderEmails",
                    event.target.checked,
                  )
                }
              />
            </label>
            <label>
              <CreditCard size={19} />
              <span>
                <strong>Room due notifications</strong>
                <small>Show room dues and wallet payment alerts in the app.</small>
              </span>
              <input
                type="checkbox"
                checked={notificationPreferences.roomDueNotifications}
                onChange={(event) =>
                  setNotificationPreference(
                    "roomDueNotifications",
                    event.target.checked,
                  )
                }
              />
            </label>
          </div>
        </article>

        <article className="bento-card settings-card friend-delete-card">
          <div className="bento-card-head">
            <div>
              <span>Friend control</span>
              <h2>Delete a friend</h2>
            </div>
            <UsersRound size={22} />
          </div>

          <label className="settings-field friend-search-field">
            <Search size={18} />
            <span>Search friend to delete</span>
            <input
              type="search"
              placeholder="Search by name or email"
              value={friendSearch}
              onChange={(event) => setFriendSearch(event.target.value)}
            />
          </label>

          <div className="settings-friend-delete-list">
            {friendsLoading && (
              <p className="dashboard-muted-text">Loading friends...</p>
            )}
            {!friendsLoading && friends.length === 0 && (
              <p className="dashboard-muted-text">No friends to delete.</p>
            )}
            {!friendsLoading &&
              friends.length > 0 &&
              visibleFriends.length === 0 && (
                <p className="dashboard-muted-text">
                  You are not friends with {trimmedFriendSearch}.
                </p>
              )}
            {visibleFriends.map((friend) => (
              <article className="settings-friend-card" key={friend.id}>
                <div className="settings-friend-main">
                  {friend.photo_url ? (
                    <img
                      className="settings-friend-avatar"
                      src={friend.photo_url}
                      alt=""
                    />
                  ) : (
                    <span className="settings-friend-avatar">
                      {getFriendLabel(friend).slice(0, 2).toUpperCase()}
                    </span>
                  )}

                  <div className="settings-friend-info">
                    <strong>{getFriendLabel(friend)}</strong>
                    <span>{friend.email}</span>
                    <small>{formatFriendshipAge(friend.friendship_days)}</small>
                  </div>
                </div>

                <button
                  className="settings-danger-button settings-friend-delete-button"
                  type="button"
                  onClick={() => handleDeleteFriend(friend)}
                  disabled={deletingFriendId === friend.id}
                >
                  <Trash2 size={15} />
                  {deletingFriendId === friend.id ? "Deleting" : "Remove"}
                </button>
              </article>
            ))}
          </div>

          {(friendDeleteMessage || friendDeleteError) && (
            <p
              className={
                friendDeleteError
                  ? "settings-inline-message error"
                  : "settings-inline-message"
              }
            >
              {friendDeleteError || friendDeleteMessage}
            </p>
          )}
        </article>

        <article className="bento-card settings-card danger-zone-card">
          <div className="bento-card-head">
            <div>
              <span>Danger zone</span>
              <h2>Account control</h2>
            </div>
            <AlertTriangle size={22} />
          </div>
          <p>
            Download your SplitVerse data, reset this browser's local settings,
            or permanently delete your account after all dues are cleared.
          </p>

          <div className="settings-danger-actions">
            <button
              className="settings-safe-button"
              type="button"
              onClick={handleDownloadMyData}
              disabled={downloadingData}
            >
              <Download size={17} />
              {downloadingData ? "Preparing data" : "Download my data"}
            </button>
            <button
              className="settings-outline-danger-button"
              type="button"
              onClick={handleClearLocalSettings}
            >
              <RotateCcw size={17} />
              Clear local app settings
            </button>
            <button
              className="settings-danger-button settings-delete-account-button"
              type="button"
              onClick={() => {
                setDeleteConfirmation("");
                setDeleteError("");
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 size={17} />
              Delete account
            </button>
          </div>

          {(settingsMessage || settingsError) && (
            <p
              className={
                settingsError
                  ? "settings-inline-message error"
                  : "settings-inline-message"
              }
            >
              {settingsError || settingsMessage}
            </p>
          )}
        </article>
      </section>

      {deleteDialogOpen && (
        <div className="transaction-export-backdrop" role="presentation">
          <form
            className="transaction-export-dialog account-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-delete-title"
            onSubmit={handleDeleteAccount}
          >
            <div className="transaction-export-head">
              <div>
                <span>Delete account</span>
                <h2 id="account-delete-title">Confirm permanent deletion</h2>
              </div>
              <button
                type="button"
                aria-label="Close delete account dialog"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deletingAccount}
              >
                <X size={18} />
              </button>
            </div>

            <div className="account-delete-warning">
              <AlertTriangle size={18} />
              <p>
                Your account can be deleted only after your wallet balance is
                zero and all pending dues are cleared.
              </p>
            </div>

            <label>
              <span>Type {deleteAccountConfirmationText}</span>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                disabled={deletingAccount}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            {deleteError && (
              <p className="transaction-export-message">{deleteError}</p>
            )}

            <div className="transaction-export-actions">
              <button
                className="dashboard-secondary-button"
                type="button"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deletingAccount}
              >
                Cancel
              </button>
              <button
                className="settings-danger-button"
                type="submit"
                disabled={deletingAccount || !canDeleteAccount}
              >
                {deletingAccount ? "Deleting account" : "Delete account"}
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
