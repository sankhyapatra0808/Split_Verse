import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Plus,
  ReceiptText,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";

import {
  collectSplitRoomMemberDues,
  createSplitRoom,
  createSplitRoomItem,
  deleteSplitRoom,
  getFriendsSummary,
  getPendingDues,
  getSplitRooms,
  paySplitRoomDue,
  type Friend,
  type PendingDue,
  type SplitRoom,
} from "../lib/api";

import { useAppSettings } from "../context/useAppSettings";
import Dropdown, { type DropdownOption } from "../components/Dropdown";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { withTopProgress } from "../utils/topProgress";
import DashboardLayout from "./dashboard/DashboardLayout";

const categoryOptions = [
  { label: "Restaurant", value: "restaurant" },
  { label: "Groceries", value: "groceries" },
  { label: "Trip", value: "trip" },
  { label: "Flatmates", value: "flatmates" },
  { label: "Rent", value: "rent" },
  { label: "Utilities", value: "utilities" },
  { label: "Subscription", value: "subscription" },
  { label: "Fuel", value: "fuel" },
  { label: "Shopping", value: "shopping" },
  { label: "Other", value: "other" },
];

function getMemberName(member: SplitRoom["members"][number]) {
  if (member.isMe) {
    return "Me";
  }

  return member.display_name || member.email || "Member";
}

function getItemPlaceholder(category?: string | null) {
  switch (category) {
    case "restaurant":
      return "Paneer tikka";
    case "groceries":
      return "Milk and bread";
    case "trip":
      return "Cab fare";
    case "flatmates":
      return "Cleaning supplies";
    case "rent":
      return "June rent";
    case "utilities":
      return "Electricity bill";
    case "subscription":
      return "Netflix";
    case "fuel":
      return "Petrol";
    case "shopping":
      return "Home essentials";
    default:
      return "Shared item";
  }
}

export default function SharedSplitRooms() {
  const { formatCurrency } = useAppSettings();
  const [searchParams] = useSearchParams();
  const roomIdFromNotification = searchParams.get("roomId") || "";
  const [rooms, setRooms] = useState<SplitRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriendEmails, setSelectedFriendEmails] = useState<string[]>(
    [],
  );
  const [friendPickerOpen, setFriendPickerOpen] = useState(false);
  const [roomCategory, setRoomCategory] = useState("restaurant");
  const [itemTitle, setItemTitle] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingRoom, setSavingRoom] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState("");
  const [collectingMemberId, setCollectingMemberId] = useState("");
  const [pendingDues, setPendingDues] = useState<PendingDue[]>([]);
  const [payingDueId, setPayingDueId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const friendDropdownRef = useRef<HTMLDivElement | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? rooms[0],
    [rooms, selectedRoomId],
  );
  const roomOptions = useMemo<DropdownOption[]>(
    () =>
      rooms.length > 0
        ? rooms.map((room) => ({ value: room.id, label: room.name }))
        : [{ value: "", label: "No rooms yet" }],
    [rooms],
  );

  const sortedMembers = useMemo(() => {
    if (!selectedRoom) {
      return [];
    }

    return [...selectedRoom.members].sort((left, right) => {
      if (left.isMe) {
        return -1;
      }

      if (right.isMe) {
        return 1;
      }

      return getMemberName(left).localeCompare(getMemberName(right));
    });
  }, [selectedRoom]);
  const memberOptions = useMemo<DropdownOption[]>(
    () =>
      sortedMembers.map((member) => ({
        value: member.id,
        label: member.isMe ? "Me" : getMemberName(member),
      })),
    [sortedMembers],
  );
  const selectedRoomPendingDues = useMemo(
    () =>
      selectedRoom
        ? pendingDues.filter((due) => due.roomId === selectedRoom.id)
        : [],
    [pendingDues, selectedRoom],
  );
  const selectedFriendNames = useMemo(
    () =>
      selectedFriendEmails
        .map((email) => {
          const friend = friends.find((item) => item.email === email);
          return friend?.name || email.split("@")[0];
        })
        .join(", "),
    [friends, selectedFriendEmails],
  );
  const itemPlaceholder = getItemPlaceholder(selectedRoom?.category);

  const reloadSplitRoomData = async (preferredRoomId?: string) => {
    const [roomData, duesData] = await Promise.all([
      getSplitRooms(),
      getPendingDues(),
    ]);

    setRooms(roomData.rooms);

    const nextRoomId =
      preferredRoomId ||
      roomIdFromNotification ||
      selectedRoomId ||
      roomData.rooms[0]?.id ||
      "";

    setSelectedRoomId(
      roomData.rooms.some((room) => room.id === nextRoomId)
        ? nextRoomId
        : roomData.rooms[0]?.id || "",
    );
    setPendingDues(duesData.dues);
  };

  useEffect(() => {
    let active = true;

    async function loadInitialRooms() {
      try {
        setLoading(true);
        setError("");
        const [roomData, friendsData, duesData] = await Promise.all([
          getSplitRooms(),
          getFriendsSummary(),
          getPendingDues(),
        ]);

        if (!active) {
          return;
        }

        const nextRoomId =
          roomIdFromNotification || roomData.rooms[0]?.id || "";
        setRooms(roomData.rooms);
        setSelectedRoomId(
          roomData.rooms.some((room) => room.id === nextRoomId)
            ? nextRoomId
            : roomData.rooms[0]?.id || "",
        );
        setFriends(friendsData.friends);
        setPendingDues(duesData.dues);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load split rooms",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadInitialRooms();

    return () => {
      active = false;
    };
  }, [roomIdFromNotification]);

  useEffect(() => {
    if (
      roomIdFromNotification &&
      rooms.some((room) => room.id === roomIdFromNotification)
    ) {
      setSelectedRoomId(roomIdFromNotification);
    }
  }, [roomIdFromNotification, rooms]);

  useEffect(() => {
    const handleDataUpdated = () => {
      void reloadSplitRoomData(selectedRoomId);
    };

    window.addEventListener("splitverse:data-updated", handleDataUpdated);

    return () => {
      window.removeEventListener("splitverse:data-updated", handleDataUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIdFromNotification, selectedRoomId]);

  useEffect(() => {
    if (!friendPickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        friendDropdownRef.current &&
        !friendDropdownRef.current.contains(event.target as Node)
      ) {
        setFriendPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [friendPickerOpen]);

  useEffect(() => {
    const selfMember = sortedMembers.find((member) => member.isMe);
    const firstMember = selfMember ?? sortedMembers[0];

    if (
      !assignedMemberId ||
      !sortedMembers.some((member) => member.id === assignedMemberId)
    ) {
      setAssignedMemberId(firstMember?.id || "");
    }
  }, [assignedMemberId, sortedMembers]);

  function toggleSelectedFriend(email: string) {
    setSelectedFriendEmails((prev) =>
      prev.includes(email)
        ? prev.filter((friendEmail) => friendEmail !== email)
        : [...prev, email],
    );
  }

  const handleCreateRoom = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!roomName.trim()) {
      setError("Room name is required.");
      return;
    }

    if (selectedFriendEmails.length === 0) {
      setError("Select at least one friend for this room.");
      return;
    }

    try {
      setSavingRoom(true);
      await withTopProgress(async () => {
        const response = await createSplitRoom({
          name: roomName.trim(),
          category: roomCategory,
          members: selectedFriendEmails,
        });

        await reloadSplitRoomData(response.room.id);
        setRoomName("");
        setSelectedFriendEmails([]);
        setFriendPickerOpen(false);
        setRoomCategory("restaurant");
        setMessage("Room created and added to your active rooms.");
      });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create room",
      );
    } finally {
      setSavingRoom(false);
    }
  };

  const handleAddItem = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!selectedRoom) {
      setError("Create a room first.");
      return;
    }

    const numericAmount = Number(itemAmount);

    if (!itemTitle.trim()) {
      setError("Item name is required.");
      return;
    }

    if (!numericAmount || numericAmount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    if (!assignedMemberId) {
      setError("Choose who this item is assigned to.");
      return;
    }

    try {
      setSavingItem(true);
      await withTopProgress(async () => {
        await createSplitRoomItem(selectedRoom.id, {
          title: itemTitle.trim(),
          amount: numericAmount,
          assignedMemberId,
        });

        await reloadSplitRoomData(selectedRoom.id);
        setItemTitle("");
        setItemAmount("");
        const assignedMember = sortedMembers.find(
          (member) => member.id === assignedMemberId,
        );
        setMessage(
          assignedMember?.isMe
            ? "Expense item added to the room and today's dashboard spend."
            : "Expense item added as a due to collect from this member.",
        );
      });
    } catch (itemError) {
      setError(
        itemError instanceof Error ? itemError.message : "Failed to add item",
      );
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteRoom = async (room: SplitRoom) => {
    setMessage("");
    setError("");

    if (!room.isOwner) {
      setError("Only the room owner can delete this room.");
      return;
    }

    if (room.outstandingAmount > 0) {
      setError("All member payments must be done before deleting this room.");
      return;
    }

    try {
      setDeletingRoomId(room.id);
      await withTopProgress(async () => {
        await deleteSplitRoom(room.id);
        await reloadSplitRoomData(
          room.id === selectedRoomId ? undefined : selectedRoomId,
        );
        setMessage("Room deleted.");
      });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete room",
      );
    } finally {
      setDeletingRoomId("");
    }
  };

  const handleCollectMemberDues = async (roomId: string, memberId: string) => {
    setMessage("");
    setError("");

    try {
      setCollectingMemberId(memberId);
      await withTopProgress(async () => {
        const response = await collectSplitRoomMemberDues(roomId, memberId);
        await reloadSplitRoomData(roomId);
        setMessage(
          response.updatedCount > 0
            ? "Dues marked as collected."
            : "There were no pending dues for this member.",
        );
      });
    } catch (collectError) {
      setError(
        collectError instanceof Error
          ? collectError.message
          : "Failed to mark dues collected",
      );
    } finally {
      setCollectingMemberId("");
    }
  };

  const handlePayDue = async (itemId: string) => {
    setMessage("");
    setError("");

    try {
      setPayingDueId(itemId);
      await withTopProgress(async () => {
        await paySplitRoomDue(itemId);
        setPendingDues((prev) => prev.filter((due) => due.id !== itemId));
        await reloadSplitRoomData(selectedRoomId);
        window.dispatchEvent(new Event("splitverse:pending-dues-updated"));

        setMessage("Due paid from wallet successfully.");
      });
    } catch (payError) {
      setError(
        payError instanceof Error
          ? payError.message
          : "Failed to pay due from wallet",
      );
    } finally {
      setPayingDueId("");
    }
  };

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
            expenses. New rooms and receipt items are saved to your account.
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

          <form className="dashboard-form" onSubmit={handleCreateRoom}>
            <label>
              <span>Room name</span>
              <input
                type="text"
                placeholder="Weekend dinner"
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                disabled={savingRoom}
              />
            </label>
            <label className="friend-picker-label">
              <span>Friends</span>

              {friends.length === 0 ? (
                <p className="dashboard-muted-text">
                  No friends yet. Add friends first from the Friends page.
                </p>
              ) : (
                <div className="friend-dropdown" ref={friendDropdownRef}>
                  <button
                    className="friend-dropdown-trigger"
                    type="button"
                    onClick={() => setFriendPickerOpen((open) => !open)}
                    disabled={savingRoom}
                    aria-expanded={friendPickerOpen}
                  >
                    <span>
                      {selectedFriendEmails.length > 0
                        ? selectedFriendNames
                        : "Choose friends"}
                    </span>
                    <ChevronDown size={17} />
                  </button>

                  {friendPickerOpen && (
                    <div className="friend-dropdown-menu">
                      {friends.map((friend) => {
                        const checked = selectedFriendEmails.includes(
                          friend.email,
                        );

                        return (
                          <button
                            type="button"
                            className={
                              checked
                                ? "friend-picker-chip active"
                                : "friend-picker-chip"
                            }
                            key={friend.id}
                            onClick={() => toggleSelectedFriend(friend.email)}
                            disabled={savingRoom}
                          >
                            {friend.photo_url ? (
                              <img src={friend.photo_url} alt="" />
                            ) : (
                              <span>
                                {(friend.name || friend.email)
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                            )}

                            <strong>
                              {friend.name || friend.email.split("@")[0]}
                            </strong>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </label>
            <label>
              <span>Category</span>
              <Dropdown
                ariaLabel="Room category"
                value={roomCategory}
                options={categoryOptions}
                onChange={setRoomCategory}
                disabled={savingRoom}
              />
            </label>
            <button
              className="dashboard-primary-button"
              type="submit"
              disabled={savingRoom}
            >
              {savingRoom ? "Creating room" : "Create room"}
            </button>
          </form>
        </article>

        <article className="bento-card room-list-card">
          <div className="bento-card-head">
            <div>
              <span>Rooms</span>
              <h2>Active rooms</h2>
            </div>
            <CalendarDays size={23} />
          </div>

          <div className="room-card-list compact">
            {loading && (
              <p className="dashboard-muted-text">
                <LoadingSkeleton wide />
              </p>
            )}
            {!loading && rooms.length === 0 && (
              <p className="dashboard-muted-text">
                Create your first split room.
              </p>
            )}
            {rooms.map((room) => (
              <div
                className={
                  selectedRoom?.id === room.id
                    ? "room-row room-row-live active"
                    : "room-row room-row-live"
                }
                key={room.id}
              >
                <button
                  className="room-select-button"
                  type="button"
                  onClick={() => setSelectedRoomId(room.id)}
                >
                  <div>
                    <strong>{room.name}</strong>
                    <span>
                      {room.memberCount} members
                      {room.isOwner ? " - Owner" : ""}
                    </span>
                  </div>
                  <em>{formatCurrency(room.outstandingAmount)} due</em>
                </button>
                <span className="status-pill">{room.status}</span>
                <button
                  className="room-delete-button"
                  type="button"
                  aria-label={`Delete ${room.name}`}
                  title={
                    !room.isOwner
                      ? "Only the room owner can delete this room"
                      : room.outstandingAmount > 0
                        ? "All member payments must be done before deleting this room"
                        : "Delete room"
                  }
                  onClick={() => handleDeleteRoom(room)}
                  disabled={
                    !room.isOwner ||
                    room.outstandingAmount > 0 ||
                    deletingRoomId === room.id
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </article>

        <article className="bento-card member-balance-card">
          <div className="bento-card-head">
            <div>
              <span>Members</span>
              <h2>Room members</h2>
            </div>
            <CheckCircle2 size={23} />
          </div>

          <div className="member-balance-panel">
            {selectedRoom && selectedRoomPendingDues.length > 0 && (
              <div className="room-pending-dues-panel">
                <span>Pay from wallet</span>
                <div className="room-pending-due-list">
                  {selectedRoomPendingDues.map((due) => (
                    <div className="room-pending-due-row" key={due.id}>
                      <div>
                        <strong>{due.title}</strong>
                        <small>
                          Pay to {due.receiverName || due.receiverEmail}
                        </small>
                      </div>
                      <em>{formatCurrency(due.amount)}</em>
                      <button
                        type="button"
                        onClick={() => handlePayDue(due.id)}
                        disabled={payingDueId === due.id}
                      >
                        {payingDueId === due.id ? "Paying" : "Pay"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="member-balance-list">
              {selectedRoom?.balances.length ? (
                selectedRoom.balances.map((balance) => (
                  <div
                    className={
                      balance.isCollected
                        ? "member-balance-row collected"
                        : "member-balance-row"
                    }
                    key={balance.memberId}
                  >
                    <span>{balance.name}</span>
                    <strong>{balance.detail}</strong>
                    <em>
                      {balance.isMe
                        ? formatCurrency(balance.amount)
                        : formatCurrency(balance.outstandingAmount)}
                    </em>
                    {!balance.isMe &&
                      balance.outstandingAmount > 0 &&
                      selectedRoom.isOwner && (
                        <button
                          className="balance-collect-button"
                          type="button"
                          onClick={() =>
                            handleCollectMemberDues(
                              selectedRoom.id,
                              balance.memberId,
                            )
                          }
                          disabled={collectingMemberId === balance.memberId}
                        >
                          <CheckCircle2 size={14} />
                          {collectingMemberId === balance.memberId ? (
                            "Collecting"
                          ) : (
                            "Manual collect"
                          )}
                        </button>
                    )}
                  </div>
                ))
              ) : null}
            </div>
          </div>
        </article>

        <article className="bento-card assignment-card">
          <div className="bento-card-head">
            <div>
              <span>Assignment</span>
              <h2>Item assignment</h2>
            </div>
            <ReceiptText size={23} />
          </div>

          <form className="assignment-grid" onSubmit={handleAddItem}>
            <label>
              <span>Room</span>
              <Dropdown
                ariaLabel="Assignment room"
                value={selectedRoom?.id || ""}
                options={roomOptions}
                onChange={setSelectedRoomId}
                disabled={loading || rooms.length === 0}
              />
            </label>
            <label>
              <span>Item</span>
              <input
                type="text"
                placeholder={itemPlaceholder}
                value={itemTitle}
                onChange={(event) => setItemTitle(event.target.value)}
                disabled={savingItem || !selectedRoom}
              />
            </label>
            <label>
              <span>Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={formatCurrency(420)}
                value={itemAmount}
                onChange={(event) => setItemAmount(event.target.value)}
                disabled={savingItem || !selectedRoom}
              />
            </label>
            <label>
              <span>Assign to</span>
              <Dropdown
                ariaLabel="Assigned member"
                value={assignedMemberId}
                options={memberOptions}
                onChange={setAssignedMemberId}
                placeholder="No members yet"
                disabled={savingItem || sortedMembers.length === 0}
              />
            </label>
            <button type="submit" disabled={savingItem || !selectedRoom}>
              {savingItem ? "Adding item" : "Add item"}
            </button>
          </form>

          <div className="split-room-item-list">
            {selectedRoom?.items.slice(0, 4).map((item) => {
              const assignedMember = selectedRoom.members.find(
                (member) => member.id === item.assigned_member_id,
              );

              return (
                <div key={item.id}>
                  <UserRound size={17} />
                  <span>{item.title}</span>
                  <strong>
                    {getMemberName(assignedMember ?? selectedRoom.members[0])}
                  </strong>
                  <em>
                    {item.isCollected
                      ? "Collected"
                      : formatCurrency(item.amount)}
                  </em>
                </div>
              );
            })}
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
