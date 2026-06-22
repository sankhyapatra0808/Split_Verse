import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BellRing,
  Coins,
  EyeOff,
  Shield,
  SlidersHorizontal,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import Dropdown, { type DropdownOption } from "../components/Dropdown";
import { useAppSettings, type CurrencyCode } from "../context/useAppSettings";
import { useAuth } from "../context/useAuth";
import {
  deleteAccount,
  deleteFriend,
  getFriendsSummary,
  type Friend,
} from "../lib/api";
import { withTopProgress } from "../utils/topProgress";
import DashboardLayout from "./dashboard/DashboardLayout";

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

export default function AppSettings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const {
    appCurrency,
    avatarId,
    compactMode,
    converterAmount,
    converterFrom,
    converterTo,
    currencies,
    privacyMode,
    settlementReminders,
    convertCurrency,
    formatCurrency,
    setAppCurrency,
    setAvatarId,
    setCompactMode,
    setConverterAmount,
    setConverterFrom,
    setConverterTo,
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

  const convertedAmount = convertCurrency(
    converterAmount,
    converterFrom,
    converterTo
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
                onChange={(event) => setSettlementReminders(event.target.checked)}
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

        <article className="bento-card settings-card friend-delete-card">
          <div className="bento-card-head">
            <div>
              <span>Friend control</span>
              <h2>Delete a friend</h2>
            </div>
            <UsersRound size={22} />
          </div>

          <label className="settings-field friend-search-field">
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
              <div className="settings-friend-delete-row" key={friend.id}>
                <span>
                  <strong>{getFriendLabel(friend)}</strong>
                </span>
                <button
                  className="dashboard-danger-button"
                  type="button"
                  onClick={() => handleDeleteFriend(friend)}
                  disabled={deletingFriendId === friend.id}
                >
                  <Trash2 size={15} />
                  {deletingFriendId === friend.id ? "Deleting" : "Delete"}
                </button>
              </div>
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
              <span>Account control</span>
              <h2>Delete account</h2>
            </div>
            <AlertTriangle size={22} />
          </div>
          <p>
            Delete your SplitVerse account from Firebase and Neon. This is only
            allowed when your wallet balance is zero and all pending dues are
            cleared.
          </p>
          <button
            className="dashboard-danger-button"
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
                className="dashboard-danger-button"
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
