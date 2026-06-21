import { useEffect, useState, type FormEvent } from "react";
import { Check, Mail, Send, UserPlus, UsersRound } from "lucide-react";

import DashboardLayout from "./dashboard/DashboardLayout";
import {
  acceptFriendRequest,
  getFriendsSummary,
  sendFriendRequest,
  type FriendsSummary,
} from "../lib/api";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { withTopProgress } from "../utils/topProgress";

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

export default function Friends() {
  const [summary, setSummary] = useState<FriendsSummary>(emptySummary);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [acceptingId, setAcceptingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  const handleSendRequest = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!email.trim()) {
      setError("Enter your friend's email.");
      return;
    }

    try {
      setSending(true);
      await withTopProgress(async () => {
        const response = await sendFriendRequest(email.trim());
        await loadFriends();
        setEmail("");
        setMessage(
          response.request.emailStatus === "sent"
            ? "Friend request email sent."
            : response.request.emailStatus === "failed"
              ? "Friend request created, but email could not be delivered. Check backend email settings."
              : "Friend request created. Add RESEND_API_KEY in server/.env to send email.",
        );
      });
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send friend request",
      );
    } finally {
      setSending(false);
    }
  };

  const handleAccept = async (requestId: string) => {
    setMessage("");
    setError("");

    try {
      setAcceptingId(requestId);

      await withTopProgress(async () => {
        await acceptFriendRequest(requestId);

        // Remove accepted request immediately from UI
        setSummary((prev) => ({
          ...prev,
          receivedRequests: prev.receivedRequests.filter(
            (request) => request.id !== requestId,
          ),
          sentRequests: prev.sentRequests.filter(
            (request) => request.id !== requestId,
          ),
        }));

        // Reload from backend so friend list updates too
        await loadFriends();

        setMessage("Friend request accepted.");
      });
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : "Failed to accept friend request",
      );
    } finally {
      setAcceptingId("");
    }
  };

  const pendingReceivedRequests = summary.receivedRequests.filter(
    (request) => request.status === "pending",
  );

  const pendingSentRequests = summary.sentRequests.filter(
    (request) => request.status === "pending",
  );

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

          <div className="friend-list">
            {loading && (
              <p className="dashboard-muted-text">
                <LoadingSkeleton wide />
              </p>
            )}
            {!loading && summary.friends.length === 0 && (
              <p className="dashboard-muted-text">No friends yet.</p>
            )}
            {summary.friends.map((friend) => (
              <div className="friend-row" key={friend.id}>
                {friend.photo_url ? (
                  <img src={friend.photo_url} alt="" />
                ) : (
                  <span>{getFriendInitials(friend.name, friend.email)}</span>
                )}
                <div>
                  <strong>{friend.name || friend.email.split("@")[0]}</strong>
                  <small>{friend.email}</small>
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
              <p className="dashboard-muted-text">
                No pending received requests.
              </p>
            )}
            {pendingReceivedRequests.map((request) => (
              <div className="friend-request-row" key={request.id}>
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
