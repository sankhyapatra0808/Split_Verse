import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Ban,
  Check,
  Mail,
  Search,
  Send,
  UserMinus,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";

import DashboardLayout from "./dashboard/DashboardLayout";
import {
  acceptFriendRequest,
  blockFriend,
  deleteFriendRequest,
  getFriendActivity,
  getFriendsSummary,
  searchGlobalPeople,
  sendFriendRequest,
  sendSplitVerseInvite,
  type FriendActivityResponse,
  type FriendsSummary,
  type GlobalPerson,
} from "../lib/api";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { withTopProgress } from "../utils/topProgress";
import "../styles/Friends.css";

const emptySummary: FriendsSummary = {
  friends: [],
  receivedRequests: [],
  sentRequests: [],
};

function getFriendInitials(name: string | null, email: string) {
  const source = name || email.split("@")[0] || "SV";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "S";
  const second =
    parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || "V";

  return `${first}${second}`.toUpperCase();
}

function getFriendLabel(name: string | null, email: string) {
  return name || email.split("@")[0] || email;
}

function getFriendAvatarUrl(friend: {
  photo_url?: string | null;
  profile_photo_url?: string | null;
  avatar_mode?: string | null;
  display_photo_url?: string | null;
}) {
  if (friend.avatar_mode === "initials") {
    return "";
  }

  return (
    friend.display_photo_url ||
    friend.profile_photo_url ||
    friend.photo_url ||
    ""
  );
}

function renderFriendAvatar(friend: {
  name: string | null;
  email: string;
  photo_url?: string | null;
  profile_photo_url?: string | null;
  avatar_mode?: string | null;
  display_photo_url?: string | null;
}) {
  const avatarUrl = getFriendAvatarUrl(friend);

  if (avatarUrl) {
    return <img className="friend-avatar" src={avatarUrl} alt="" />;
  }

  return (
    <span className="friend-avatar initials">
      {getFriendInitials(friend.name, friend.email)}
    </span>
  );
}

function renderPersonAvatar(person: GlobalPerson) {
  const avatarUrl = getFriendAvatarUrl(person);

  if (avatarUrl) {
    return <img className="friend-avatar" src={avatarUrl} alt="" />;
  }

  return (
    <span className="friend-avatar initials">
      {getFriendInitials(person.name, person.username)}
    </span>
  );
}

function getInviteStatusLabel(status: GlobalPerson["relationshipStatus"]) {
  switch (status) {
    case "friends":
      return "Friends";
    case "request_sent":
      return "Request sent";
    case "request_received":
      return "In your inbox";
    default:
      return "Add friend";
  }
}

export default function Friends() {
  const [searchParams] = useSearchParams();
  const [summary, setSummary] = useState<FriendsSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [sendingTarget, setSendingTarget] = useState("");
  const [acceptingId, setAcceptingId] = useState("");
  const [deletingRequestId, setDeletingRequestId] = useState("");
  const [friendSearch, setFriendSearch] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [peopleResults, setPeopleResults] = useState<GlobalPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleSearchCompletedFor, setPeopleSearchCompletedFor] = useState("");
  const [selectedFriendActivity, setSelectedFriendActivity] =
    useState<FriendActivityResponse | null>(null);
  const [loadingFriendActivityId, setLoadingFriendActivityId] = useState("");
  const [blockingFriendId, setBlockingFriendId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const peopleSearchRequestRef = useRef(0);

  const loadFriends = async () => {
    const data = await getFriendsSummary();
    setSummary(data);
  };

  useEffect(() => {
    let active = true;

    async function loadInitialFriends() {
      try {
        setLoading(true);
        setError("");
        const data = await getFriendsSummary();

        if (active) {
          setSummary(data);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load friends",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadInitialFriends();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleDataUpdated = () => {
      void loadFriends();
    };

    window.addEventListener("splitverse:data-updated", handleDataUpdated);

    return () => {
      window.removeEventListener("splitverse:data-updated", handleDataUpdated);
    };
  }, []);

  useEffect(() => {
    const query = peopleSearch.trim();

    if (query.length < 2) {
      peopleSearchRequestRef.current += 1;
      return;
    }

    const requestId = ++peopleSearchRequestRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const response = await searchGlobalPeople(query);

        if (requestId === peopleSearchRequestRef.current) {
          setPeopleResults(response.people);
          setPeopleSearchCompletedFor(query.toLowerCase());
        }
      } catch (searchError) {
        if (requestId === peopleSearchRequestRef.current) {
          setPeopleResults([]);
          setPeopleSearchCompletedFor("");
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Could not search people",
          );
        }
      } finally {
        if (requestId === peopleSearchRequestRef.current) {
          setPeopleLoading(false);
        }
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [peopleSearch]);

  async function sendRequestTo(identifier: string, recipientUserId?: string) {
    const normalizedIdentifier = identifier.trim();

    if (!normalizedIdentifier) {
      setError("Enter a username or email address.");
      return;
    }

    try {
      setSendingTarget(recipientUserId || normalizedIdentifier);
      setError("");
      setMessage("");

      const response = await withTopProgress(() =>
        sendFriendRequest(normalizedIdentifier, recipientUserId),
      );

      await loadFriends();
      setPeopleResults((current) =>
        current.map((person) =>
          person.id === recipientUserId
            ? { ...person, relationshipStatus: "request_sent" }
            : person,
        ),
      );
      setMessage(
        response.request.emailStatus === "failed"
          ? "Friend request created, but the email notification could not be delivered."
          : "Friend request sent.",
      );
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send friend request",
      );
    } finally {
      setSendingTarget("");
    }
  }

  async function handleSendInviteEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    try {
      setSendingTarget(`invite:${normalizedEmail}`);
      setError("");
      setMessage("");

      const response = await withTopProgress(() =>
        sendSplitVerseInvite(normalizedEmail),
      );

      setMessage(response.message);
    } catch (inviteError) {
      setError(
        inviteError instanceof Error
          ? inviteError.message
          : "Could not send the SplitVerse invite.",
      );
    } finally {
      setSendingTarget("");
    }
  }

  async function handleAccept(requestId: string) {
    try {
      setAcceptingId(requestId);
      setMessage("");
      setError("");
      await withTopProgress(() => acceptFriendRequest(requestId));
      await loadFriends();
      setMessage("Friend request accepted.");
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : "Failed to accept friend request",
      );
    } finally {
      setAcceptingId("");
    }
  }

  async function handleDeleteRequest(requestId: string, mode: "cancel" | "decline") {
    try {
      setDeletingRequestId(requestId);
      setMessage("");
      setError("");
      await withTopProgress(() => deleteFriendRequest(requestId));
      setSummary((current) => ({
        ...current,
        receivedRequests: current.receivedRequests.filter(
          (request) => request.id !== requestId,
        ),
        sentRequests: current.sentRequests.filter(
          (request) => request.id !== requestId,
        ),
      }));
      setMessage(
        mode === "cancel"
          ? "Friend request cancelled."
          : "Friend request declined.",
      );
      void loadFriends();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete friend request",
      );
    } finally {
      setDeletingRequestId("");
    }
  }

  async function handleBlockFriend(friendId: string, friendName: string) {
    const confirmed = window.confirm(
      `Block ${friendName}? This removes the friendship and prevents new requests until you unblock them.`,
    );
    if (!confirmed) return;

    try {
      setBlockingFriendId(friendId);
      setMessage("");
      setError("");
      await withTopProgress(() => blockFriend(friendId));
      setSummary((current) => ({
        ...current,
        friends: current.friends.filter((friend) => friend.id !== friendId),
      }));
      setMessage(`${friendName} was blocked.`);
    } catch (blockError) {
      setError(
        blockError instanceof Error ? blockError.message : "Could not block this user",
      );
    } finally {
      setBlockingFriendId("");
    }
  }

  async function handleViewFriendActivity(friendId: string) {
    setMessage("");
    setError("");

    try {
      setLoadingFriendActivityId(friendId);
      const activity = await getFriendActivity(friendId);
      setSelectedFriendActivity(activity);
    } catch (activityError) {
      setError(
        activityError instanceof Error
          ? activityError.message
          : "Could not load friend activity",
      );
    } finally {
      setLoadingFriendActivityId("");
    }
  }

  const trimmedPeopleSearch = peopleSearch.trim();
  const normalizedInviteEmail = trimmedPeopleSearch.toLowerCase();
  const canInviteByEmail =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedInviteEmail) &&
    !peopleLoading &&
    peopleSearchCompletedFor === normalizedInviteEmail &&
    peopleResults.length === 0;
  const pendingReceivedRequests = summary.receivedRequests.filter(
    (request) => request.status === "pending",
  );
  const pendingSentRequests = summary.sentRequests.filter(
    (request) => request.status === "pending",
  );
  const trimmedFriendSearch = friendSearch.trim();
  const visibleFriends = useMemo(() => {
    const normalizedFriendSearch = trimmedFriendSearch.toLowerCase();

    if (!normalizedFriendSearch) {
      return summary.friends;
    }

    return summary.friends.filter((friend) =>
      `${friend.name ?? ""} ${friend.username ?? ""} ${friend.email}`
        .toLowerCase()
        .includes(normalizedFriendSearch),
    );
  }, [summary.friends, trimmedFriendSearch]);
  const focusedRequestId = searchParams.get("requestId") ?? "";

  useEffect(() => {
    if (!focusedRequestId || loading) {
      return;
    }

    const timer = window.setTimeout(() => {
      document
        .getElementById(`friend-request-${focusedRequestId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [focusedRequestId, loading, pendingReceivedRequests.length]);

  return (
    <DashboardLayout eyebrow="Friends">
      <>
        <section className="dashboard-page-grid friends-grid">
          <article className="bento-card page-hero-card dark">
            <div className="bento-card-head">
              <div>
                <span>People you split with</span>
                <h2>Friends</h2>
              </div>
              <UsersRound size={24} />
            </div>
            <p>
              Find people by username, name, or exact email, then keep your
              shared expenses connected to the right person.
            </p>
          </article>

          <article className="bento-card friend-request-card people-search-card">
            <div className="bento-card-head">
              <div>
                <span>Global people search</span>
                <h2>Find and invite</h2>
              </div>
              <UserPlus size={23} />
            </div>

            <label className="friend-search-field">
              <Search size={18} />
              <span>Search all SplitVerse users</span>
              <input
                type="search"
                placeholder="Username, name, or exact email"
                value={peopleSearch}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  peopleSearchRequestRef.current += 1;
                  setPeopleSearch(nextValue);
                  setPeopleSearchCompletedFor("");

                  if (nextValue.trim().length < 2) {
                    setPeopleResults([]);
                    setPeopleLoading(false);
                  } else {
                    setPeopleLoading(true);
                  }
                }}
              />
            </label>

            <div className="global-people-results" aria-live="polite">
              {peopleLoading && (
                <p className="dashboard-muted-text">
                  <LoadingSkeleton wide />
                </p>
              )}
              {!peopleLoading &&
                trimmedPeopleSearch.length >= 2 &&
                peopleResults.length === 0 && (
                  <div className="global-people-empty">
                    <p className="dashboard-muted-text">
                      No matching people found.
                    </p>

                    {canInviteByEmail && (
                      <button
                        className="global-email-invite"
                        type="button"
                        disabled={Boolean(sendingTarget)}
                        onClick={() =>
                          void handleSendInviteEmail(normalizedInviteEmail)
                        }
                      >
                        <Mail size={16} />
                        {sendingTarget === `invite:${normalizedInviteEmail}`
                          ? "Sending invite"
                          : "Send signup invite"}
                      </button>
                    )}
                  </div>
                )}
              {peopleResults.map((person) => {
                const canInvite = person.relationshipStatus === "none";
                const sending = sendingTarget === person.id;

                return (
                  <div className="global-person-row" key={person.id}>
                    {renderPersonAvatar(person)}
                    <div>
                      <strong>{person.name || `@${person.username}`}</strong>
                      <span>@{person.username}</span>
                      {person.emailHint && <small>{person.emailHint}</small>}
                    </div>
                    <button
                      type="button"
                      className={canInvite ? "global-person-invite" : "global-person-status"}
                      disabled={!canInvite || Boolean(sendingTarget)}
                      onClick={() => void sendRequestTo(person.username, person.id)}
                    >
                      {sending ? "Sending" : getInviteStatusLabel(person.relationshipStatus)}
                    </button>
                  </div>
                );
              })}
            </div>

          </article>

          <article className="bento-card friends-list-card">
            <div className="bento-card-head">
              <div>
                <span>Your friends</span>
                <h2>Friend list</h2>
              </div>
              <UsersRound size={23} />
            </div>

            <label className="friend-search-field">
              <Search size={18} />
              <span>Search friends</span>
              <input
                type="search"
                placeholder="Search by name, username, or email"
                value={friendSearch}
                onChange={(event) => setFriendSearch(event.target.value)}
              />
            </label>

            <div className="friend-list">
              {loading && (
                <p className="dashboard-muted-text">
                  <LoadingSkeleton wide />
                </p>
              )}
              {!loading && summary.friends.length === 0 && (
                <p className="dashboard-muted-text">No friends yet.</p>
              )}
              {!loading && summary.friends.length > 0 && visibleFriends.length === 0 && (
                <p className="dashboard-muted-text">
                  No friends match {trimmedFriendSearch}.
                </p>
              )}
              {visibleFriends.map((friend) => (
                <div className="friend-row" key={friend.id}>
                  {renderFriendAvatar(friend)}
                  <div className="friend-row-info">
                    <strong>{getFriendLabel(friend.name, friend.email)}</strong>
                    <small>
                      {friend.username ? `@${friend.username} · ` : ""}
                      {friend.email}
                    </small>
                  </div>
                  <div className="friend-row-actions">
                    <button
                      className="friend-activity-button"
                      type="button"
                      onClick={() => handleViewFriendActivity(friend.id)}
                      disabled={
                        loadingFriendActivityId === friend.id ||
                        blockingFriendId === friend.id
                      }
                    >
                      {loadingFriendActivityId === friend.id ? "Loading" : "Activity"}
                    </button>
                    <button
                      className="friend-block-button"
                      type="button"
                      onClick={() =>
                        void handleBlockFriend(
                          friend.id,
                          getFriendLabel(friend.name, friend.email),
                        )
                      }
                      disabled={blockingFriendId === friend.id}
                    >
                      <Ban size={15} />
                      {blockingFriendId === friend.id ? "Blocking" : "Block"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="bento-card friend-inbox-card">
            <div className="bento-card-head">
              <div>
                <span>Friend inbox</span>
                <h2>Requests to accept</h2>
              </div>
              <Mail size={23} />
            </div>

            <div className="friend-request-list">
              {pendingReceivedRequests.length === 0 && (
                <p className="dashboard-muted-text">No pending received requests.</p>
              )}
              {pendingReceivedRequests.map((request) => (
                <div
                  className={
                    request.id === focusedRequestId
                      ? "friend-request-row highlighted"
                      : "friend-request-row"
                  }
                  id={`friend-request-${request.id}`}
                  key={request.id}
                >
                  <div>
                    <strong>{request.requester_name || request.requester_email}</strong>
                    <span>
                      {request.requester_username
                        ? `@${request.requester_username}`
                        : request.requester_email}
                    </span>
                  </div>
                  <div className="friend-request-actions">
                    <button
                      type="button"
                      onClick={() => void handleAccept(request.id)}
                      disabled={acceptingId === request.id || deletingRequestId === request.id}
                    >
                      <Check size={17} />
                      {acceptingId === request.id ? "Accepting" : "Accept"}
                    </button>
                    <button
                      className="friend-request-delete"
                      type="button"
                      onClick={() => void handleDeleteRequest(request.id, "decline")}
                      disabled={acceptingId === request.id || deletingRequestId === request.id}
                    >
                      <X size={17} />
                      {deletingRequestId === request.id ? "Declining" : "Decline"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="bento-card friend-sent-card">
            <div className="bento-card-head">
              <div>
                <span>Sent requests</span>
                <h2>Pending invitations</h2>
              </div>
              <Send size={23} />
            </div>

            <div className="friend-request-list">
              {pendingSentRequests.length === 0 && (
                <p className="dashboard-muted-text">No sent requests.</p>
              )}
              {pendingSentRequests.map((request) => (
                <div className="friend-request-row sent" key={request.id}>
                  <div>
                    <strong>{request.recipient_email}</strong>
                    <span>Waiting for acceptance</span>
                  </div>
                  <button
                    className="friend-request-delete"
                    type="button"
                    onClick={() => void handleDeleteRequest(request.id, "cancel")}
                    disabled={deletingRequestId === request.id}
                  >
                    <UserMinus size={17} />
                    {deletingRequestId === request.id ? "Cancelling" : "Cancel"}
                  </button>
                </div>
              ))}
            </div>
          </article>

          {(message || error) && (
            <article className={error ? "bento-card page-alert error" : "bento-card page-alert"}>
              {error || message}
            </article>
          )}
        </section>

        {selectedFriendActivity && (
          <div
            className="friend-activity-dialog-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedFriendActivity(null);
              }
            }}
          >
            <section
              className="friend-activity-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="friend-activity-dialog-title"
            >
              <div className="friend-activity-dialog-head">
                <div>
                  <span>Friend activity</span>
                  <h2 id="friend-activity-dialog-title">
                    {getFriendLabel(
                      selectedFriendActivity.friend.name,
                      selectedFriendActivity.friend.email,
                    )}
                  </h2>
                </div>
                <button
                  className="friend-activity-dialog-close"
                  type="button"
                  aria-label="Close friend activity"
                  onClick={() => setSelectedFriendActivity(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="friend-activity-stats">
                <div>
                  <span>Rooms together</span>
                  <strong>{selectedFriendActivity.summary.roomsTogether}</strong>
                </div>
                <div>
                  <span>Total settled</span>
                  <strong>₹{selectedFriendActivity.summary.totalSettled}</strong>
                </div>
                <div>
                  <span>Net position</span>
                  <strong>₹{selectedFriendActivity.summary.netPosition}</strong>
                </div>
              </div>

              <div className="friend-activity-list">
                {selectedFriendActivity.recentActivity.length === 0 ? (
                  <p className="dashboard-muted-text">No shared activity yet.</p>
                ) : (
                  selectedFriendActivity.recentActivity.map((activity) => (
                    <div className="friend-activity-row" key={activity.id}>
                      <div>
                        <strong>{activity.title}</strong>
                        <span>{activity.source}</span>
                      </div>
                      <em>₹{activity.amount}</em>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </>
    </DashboardLayout>
  );
}
