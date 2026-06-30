import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Mail, Search, Send, UserPlus, UsersRound } from "lucide-react";

import DashboardLayout from "./dashboard/DashboardLayout";
import {
  acceptFriendRequest,
  getFriendActivity,
  getFriendsSummary,
  sendFriendRequest,
  type FriendActivityResponse,
  type FriendsSummary,
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

  return friend.display_photo_url || friend.profile_photo_url || friend.photo_url || "";
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

  return <span className="friend-avatar initials">{getFriendInitials(friend.name, friend.email)}</span>;
}

export default function Friends() {
  const [searchParams] = useSearchParams();
  const [summary, setSummary] = useState<FriendsSummary>(emptySummary);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [acceptingId, setAcceptingId] = useState("");
  const [friendSearch, setFriendSearch] = useState("");
  const [selectedFriendActivity, setSelectedFriendActivity] = useState<FriendActivityResponse | null>(null);
  const [loadingFriendActivityId, setLoadingFriendActivityId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const optimisticIdRef = useRef(0);

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

  function getOptimisticId(prefix: string) {
    optimisticIdRef.current += 1;
    return `optimistic-${prefix}-${Date.now()}-${optimisticIdRef.current}`;
  }

  const handleSendRequest = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");

    const recipientEmail = email.trim().toLowerCase();

    if (!recipientEmail) {
      setError("Enter your friend's email.");
      return;
    }

    const previousSummary = summary;
    const previousEmail = email;
    const optimisticRequest = {
      id: getOptimisticId("friend-request"),
      requester_user_id: "optimistic",
      requester_name: null,
      requester_email: "",
      recipient_email: recipientEmail,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      setSending(true);
      setSummary((prev) => ({
        ...prev,
        sentRequests: [optimisticRequest, ...prev.sentRequests],
      }));
      setEmail("");
      setMessage("Friend request added instantly. Sending invite...");

      await withTopProgress(async () => {
        const response = await sendFriendRequest(recipientEmail);
        setSummary((prev) => ({
          ...prev,
          sentRequests: prev.sentRequests.map((request) =>
            request.id === optimisticRequest.id ? response.request : request,
          ),
        }));
        void loadFriends();
        setMessage(
          response.request.emailStatus === "sent"
            ? "Friend request email sent."
            : response.request.emailStatus === "degraded"
              ? "Friend request created, but email delivery is temporarily degraded."
              : response.request.emailStatus === "failed"
                ? "Friend request created, but email could not be delivered. Check backend email settings."
                : "Friend request created. Add Brevo SMTP settings in server/.env to send email.",
        );
      });
    } catch (sendError) {
      setSummary(previousSummary);
      setEmail(previousEmail);
      setError(
        `${
          sendError instanceof Error
            ? sendError.message
            : "Failed to send friend request"
        } The instant request was removed.`,
      );
      setMessage("");
    } finally {
      setSending(false);
    }
  };

  const handleAccept = async (requestId: string) => {
    setMessage("");
    setError("");

    const previousSummary = summary;
    const request = summary.receivedRequests.find(
      (item) => item.id === requestId,
    );

    try {
      setAcceptingId(requestId);
      if (request) {
        setSummary((prev) => ({
          ...prev,
          friends: [
            {
              id: request.requester_user_id,
              name: request.requester_name,
              email: request.requester_email,
              photo_url: null,
              friendship_created_at: new Date().toISOString(),
              friendship_days: 0,
            },
            ...prev.friends.filter(
              (friend) => friend.id !== request.requester_user_id,
            ),
          ],
          receivedRequests: prev.receivedRequests.filter(
            (item) => item.id !== requestId,
          ),
          sentRequests: prev.sentRequests.filter(
            (item) => item.id !== requestId,
          ),
        }));
      }
      setMessage("Friend request accepted.");

      await withTopProgress(async () => {
        await acceptFriendRequest(requestId);
        void loadFriends();

        setMessage("Friend request accepted.");
      });
    } catch (acceptError) {
      setSummary(previousSummary);
      setError(
        `${
          acceptError instanceof Error
            ? acceptError.message
            : "Failed to accept friend request"
        } The request was restored to your inbox.`,
      );
      setMessage("");
    } finally {
      setAcceptingId("");
    }
  };

  const handleViewFriendActivity = async (friendId: string) => {
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
  };

  const pendingReceivedRequests = summary.receivedRequests.filter(
    (request) => request.status === "pending",
  );

  const pendingSentRequests = summary.sentRequests.filter(
    (request) => request.status === "pending",
  );
  const trimmedFriendSearch = friendSearch.trim();
  const normalizedFriendSearch = trimmedFriendSearch.toLowerCase();
  const visibleFriends = normalizedFriendSearch
    ? summary.friends.filter((friend) =>
        `${friend.name ?? ""} ${friend.email}`
          .toLowerCase()
          .includes(normalizedFriendSearch),
      )
    : summary.friends;
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
            Add friends by email, accept incoming requests, and keep your split
            rooms connected to people you actually share costs with.
          </p>
        </article>

        <article className="bento-card friend-request-card">
          <div className="bento-card-head">
            <div>
              <span>Invite by email</span>
              <h2>Send request</h2>
            </div>
            <UserPlus size={23} />
          </div>

          <form className="dashboard-form" onSubmit={handleSendRequest}>
            <label>
              <span>Friend email</span>
              <input
                type="email"
                placeholder="friend@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={sending}
              />
            </label>
            <button
              className="dashboard-primary-button"
              type="submit"
              disabled={sending}
            >
              <Send size={17} />
              {sending ? "Sending request" : "Send request"}
            </button>
          </form>
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
              placeholder="Search by name or email"
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
            {!loading &&
              summary.friends.length > 0 &&
              visibleFriends.length === 0 && (
                <p className="dashboard-muted-text">
                  You are not friends with {trimmedFriendSearch}.
                </p>
              )}
            {visibleFriends.map((friend) => (
              <div className="friend-row" key={friend.id}>
                {renderFriendAvatar(friend)}
                <div>
                  <strong>{getFriendLabel(friend.name, friend.email)}</strong>
                  <small>{friend.email}</small>
                </div>
                <button
                  className="friend-activity-button"
                  type="button"
                  onClick={() => handleViewFriendActivity(friend.id)}
                  disabled={loadingFriendActivityId === friend.id}
                >
                  {loadingFriendActivityId === friend.id ? "Loading" : "Activity"}
                </button>
              </div>
            ))}
          </div>
        </article>

        {selectedFriendActivity && (
          <article className="bento-card friend-activity-card">
            <div className="bento-card-head">
              <div>
                <span>Friend activity</span>
                <h2>{getFriendLabel(selectedFriendActivity.friend.name, selectedFriendActivity.friend.email)}</h2>
              </div>
              <UsersRound size={23} />
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
          </article>
        )}

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
              <p className="dashboard-muted-text">
                No pending received requests.
              </p>
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
                  <strong>
                    {request.requester_name || request.requester_email}
                  </strong>
                  <span>{request.requester_email}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAccept(request.id)}
                  disabled={acceptingId === request.id}
                >
                  <Check size={17} />
                  {acceptingId === request.id ? "Accepting" : "Accept"}
                </button>
              </div>
            ))}
          </div>
        </article>

        <article className="bento-card friend-sent-card">
          <div className="bento-card-head">
            <div>
              <span>Sent requests</span>
              <h2>Email invites</h2>
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
                  <span>{request.status}</span>
                </div>
                <span className="dashboard-muted-text">Waiting for acceptance</span>
              </div>
            ))}
          </div>
        </article>

        {(message || error) && (
          <article
            className={
              error ? "bento-card page-alert error" : "bento-card page-alert"
            }
          >
            {error || message}
          </article>
        )}
      </section>
    </DashboardLayout>
  );
}
