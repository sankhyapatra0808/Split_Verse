import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays,
  CheckCircle2,
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
  getSplitRooms,
  updateSplitRoomPaymentStatus,
  type RoomPaymentStatus,
  type SplitRoom,
} from "../lib/api";
import { useAppSettings } from "../context/useAppSettings";
import DashboardLayout from "./dashboard/DashboardLayout";

const categoryOptions = [
  { label: "Restaurant", value: "restaurant" },
  { label: "Trip", value: "trip" },
  { label: "Flatmates", value: "flatmates" },
  { label: "Subscription", value: "subscription" },
];

const paymentStatusOptions: { label: string; value: RoomPaymentStatus }[] = [
  { label: "No one paid", value: "no_one_paid" },
  { label: "All paid", value: "all_paid" },
  { label: "Complete", value: "complete" },
];

function splitMembers(rawMembers: string) {
  return rawMembers
    .split(/[,\n]/)
    .map((member) => member.trim())
    .filter(Boolean);
}

function getMemberName(member: SplitRoom["members"][number]) {
  if (member.isMe) {
    return "Me";
  }

  return member.display_name || member.email || "Member";
}

export default function SharedSplitRooms() {
  const { formatCurrency } = useAppSettings();
  const [rooms, setRooms] = useState<SplitRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomMembers, setRoomMembers] = useState("");
  const [roomCategory, setRoomCategory] = useState("restaurant");
  const [itemTitle, setItemTitle] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingRoom, setSavingRoom] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState("");
  const [collectingMemberId, setCollectingMemberId] = useState("");
  const [updatingPaymentStatus, setUpdatingPaymentStatus] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? rooms[0],
    [rooms, selectedRoomId],
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

  const loadRooms = async (preferredRoomId?: string) => {
    const data = await getSplitRooms();
    setRooms(data.rooms);

    const nextRoomId =
      preferredRoomId ||
      selectedRoomId ||
      data.rooms[0]?.id ||
      "";

    setSelectedRoomId(
      data.rooms.some((room) => room.id === nextRoomId)
        ? nextRoomId
        : data.rooms[0]?.id || "",
    );
  };

  useEffect(() => {
    let active = true;

    async function loadInitialRooms() {
      try {
        setLoading(true);
        setError("");
        const data = await getSplitRooms();

        if (!active) {
          return;
        }

        setRooms(data.rooms);
        setSelectedRoomId(data.rooms[0]?.id || "");
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

    loadInitialRooms();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const selfMember = sortedMembers.find((member) => member.isMe);
    const firstMember = selfMember ?? sortedMembers[0];

    if (!assignedMemberId || !sortedMembers.some((member) => member.id === assignedMemberId)) {
      setAssignedMemberId(firstMember?.id || "");
    }
  }, [assignedMemberId, sortedMembers]);

  const handleCreateRoom = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!roomName.trim()) {
      setError("Room name is required.");
      return;
    }

    try {
      setSavingRoom(true);
      const response = await createSplitRoom({
        name: roomName.trim(),
        category: roomCategory,
        members: splitMembers(roomMembers),
      });

      await loadRooms(response.room.id);
      setRoomName("");
      setRoomMembers("");
      setRoomCategory("restaurant");
      setMessage("Room created and added to your active rooms.");
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
      await createSplitRoomItem(selectedRoom.id, {
        title: itemTitle.trim(),
        amount: numericAmount,
        assignedMemberId,
      });

      await loadRooms(selectedRoom.id);
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
    } catch (itemError) {
      setError(
        itemError instanceof Error
          ? itemError.message
          : "Failed to add item",
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

    if (room.paymentStatus !== "complete") {
      setError("Mark this room as complete before deleting it.");
      return;
    }

    try {
      setDeletingRoomId(room.id);
      await deleteSplitRoom(room.id);
      await loadRooms(room.id === selectedRoomId ? undefined : selectedRoomId);
      setMessage("Room deleted.");
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

  const handlePaymentStatusChange = async (
    roomId: string,
    paymentStatus: RoomPaymentStatus,
  ) => {
    setMessage("");
    setError("");

    try {
      setUpdatingPaymentStatus(true);
      await updateSplitRoomPaymentStatus(roomId, paymentStatus);
      await loadRooms(roomId);
      setMessage("Room payment status updated.");
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Failed to update payment status",
      );
    } finally {
      setUpdatingPaymentStatus(false);
    }
  };

  const handleCollectMemberDues = async (
    roomId: string,
    memberId: string,
  ) => {
    setMessage("");
    setError("");

    try {
      setCollectingMemberId(memberId);
      const response = await collectSplitRoomMemberDues(roomId, memberId);
      await loadRooms(roomId);
      setMessage(
        response.updatedCount > 0
          ? "Dues marked as collected."
          : "There were no pending dues for this member.",
      );
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
            <label>
              <span>Members</span>
              <input
                type="text"
                placeholder="mira@email.com, Kabir"
                value={roomMembers}
                onChange={(event) => setRoomMembers(event.target.value)}
                disabled={savingRoom}
              />
            </label>
            <label>
              <span>Category</span>
              <select
                value={roomCategory}
                onChange={(event) => setRoomCategory(event.target.value)}
                disabled={savingRoom}
              >
                {categoryOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="dashboard-primary-button" type="submit" disabled={savingRoom}>
              {savingRoom ? "Creating..." : "Create room"}
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
              {loading && <p className="dashboard-muted-text">Loading rooms...</p>}
              {!loading && rooms.length === 0 && (
                <p className="dashboard-muted-text">Create your first split room.</p>
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
                        : room.paymentStatus !== "complete"
                          ? "Mark this room complete before deleting it"
                          : "Delete room"
                    }
                    onClick={() => handleDeleteRoom(room)}
                    disabled={
                      !room.isOwner ||
                      room.paymentStatus !== "complete" ||
                      deletingRoomId === room.id
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div className="member-balance-panel">
              <div>
                <span>Member balances</span>
                <strong>{selectedRoom ? selectedRoom.name : "Who owes whom"}</strong>
              </div>
              {selectedRoom && (
                <div className="room-payment-status-control">
                  <span>Payment status</span>
                  {selectedRoom.isOwner ? (
                    <select
                      className="polished-select"
                      value={selectedRoom.paymentStatus}
                      onChange={(event) =>
                        handlePaymentStatusChange(
                          selectedRoom.id,
                          event.target.value as RoomPaymentStatus,
                        )
                      }
                      disabled={updatingPaymentStatus}
                    >
                      {paymentStatusOptions.map((option) => (
                        <option value={option.value} key={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <strong>{selectedRoom.status}</strong>
                  )}
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
                      {!balance.isMe && balance.outstandingAmount > 0 && selectedRoom.isOwner && (
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
                          {collectingMemberId === balance.memberId
                            ? "Saving"
                            : "Mark collected"}
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="dashboard-muted-text">No balances yet.</p>
                )}
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

          <form className="assignment-grid" onSubmit={handleAddItem}>
            <label>
              <span>Room</span>
              <select
                className="polished-select"
                value={selectedRoom?.id || ""}
                onChange={(event) => setSelectedRoomId(event.target.value)}
                disabled={loading || rooms.length === 0}
              >
                {rooms.length === 0 && <option value="">No rooms yet</option>}
                {rooms.map((room) => (
                  <option value={room.id} key={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Item</span>
              <input
                type="text"
                placeholder="Paneer tikka"
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
              <select
                className="polished-select"
                value={assignedMemberId}
                onChange={(event) => setAssignedMemberId(event.target.value)}
                disabled={savingItem || sortedMembers.length === 0}
              >
                {sortedMembers.map((member) => (
                  <option value={member.id} key={member.id}>
                    {member.isMe ? "Me" : getMemberName(member)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={savingItem || !selectedRoom}>
              {savingItem ? "Adding..." : "Add item"}
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
                  <strong>{getMemberName(assignedMember ?? selectedRoom.members[0])}</strong>
                  <em>
                    {item.isCollected ? "Collected" : formatCurrency(item.amount)}
                  </em>
                </div>
              );
            })}
          </div>
        </article>

        {(message || error) && (
          <article className={error ? "bento-card page-alert error" : "bento-card page-alert"}>
            {error || message}
          </article>
        )}
      </section>
    </DashboardLayout>
  );
}

