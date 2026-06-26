import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  UserMinus,
  WalletCards,
  X,
  UsersRound,
} from "lucide-react";

import {
  collectSplitRoomMemberDues,
  createSplitRoom,
  createSplitRoomItem,
  deleteSplitRoom,
  deleteSplitRoomItem,
  getFriendsSummary,
  getPendingDues,
  getSplitRooms,
  paySplitRoomDue,
  removeSplitRoomMember,
  updateSplitRoomItem,
  type Friend,
  type PendingDue,
  type SplitRoom,
} from "../lib/api";

import { useAppSettings } from "../context/useAppSettings";
import Dropdown, { type DropdownOption } from "../components/Dropdown";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { withTopProgress } from "../utils/topProgress";
import DashboardLayout from "./dashboard/DashboardLayout";
import "../styles/SharedSplitRooms.css";

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

function getPersonInitials(name?: string | null, email?: string | null) {
  const source = name || email?.split("@")[0] || "SV";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "S";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || "V";

  return `${first}${second}`.toUpperCase();
}

function getDisplayAvatarUrl(person: {
  photo_url?: string | null;
  profile_photo_url?: string | null;
  avatar_mode?: string | null;
  display_photo_url?: string | null;
}) {
  if (person.avatar_mode === "initials") {
    return "";
  }

  return person.display_photo_url || person.profile_photo_url || person.photo_url || "";
}

function renderFriendMiniAvatar(friend: Friend) {
  const avatarUrl = getDisplayAvatarUrl(friend);

  if (avatarUrl) {
    return <img src={avatarUrl} alt="" />;
  }

  return <span>{getPersonInitials(friend.name, friend.email)}</span>;
}

function renderMemberMiniAvatar(member?: SplitRoom["members"][number]) {
  if (!member) {
    return <span className="room-member-avatar initials">SV</span>;
  }

  const avatarUrl = getDisplayAvatarUrl(member);

  if (avatarUrl) {
    return <img className="room-member-avatar" src={avatarUrl} alt="" />;
  }

  return (
    <span className="room-member-avatar initials">
      {getPersonInitials(member.display_name, member.email)}
    </span>
  );
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

function roundMoney(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export default function SharedSplitRooms() {
  const {
    appCurrency,
    convertCurrency,
    currencies,
    formatCurrency,
  } = useAppSettings();
  const [searchParams] = useSearchParams();
  const roomIdFromNotification = searchParams.get("roomId") || "";
  const [rooms, setRooms] = useState<SplitRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriendEmails, setSelectedFriendEmails] = useState<string[]>(
    [],
  );
  const [friendSearch, setFriendSearch] = useState("");
  const [friendPickerOpen, setFriendPickerOpen] = useState(false);
  const [roomCategory, setRoomCategory] = useState("restaurant");
  const [itemTitle, setItemTitle] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingRoom, setSavingRoom] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState("");
  const [editItemTitle, setEditItemTitle] = useState("");
  const [editItemAmount, setEditItemAmount] = useState("");
  const [updatingItemId, setUpdatingItemId] = useState("");
  const [deletingItemId, setDeletingItemId] = useState("");
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState("");
  const [deletingRoomId, setDeletingRoomId] = useState("");
  const [collectingMemberId, setCollectingMemberId] = useState("");
  const [pendingDues, setPendingDues] = useState<PendingDue[]>([]);
  const [payingDueId, setPayingDueId] = useState("");
  const [paymentDueId, setPaymentDueId] = useState("");
  const [paymentWalletPin, setPaymentWalletPin] = useState("");
  const [paymentPinDialogOpen, setPaymentPinDialogOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"single" | "all">("single");
  const [paymentDialogError, setPaymentDialogError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const friendDropdownRef = useRef<HTMLDivElement | null>(null);
  const optimisticIdRef = useRef(0);
  const activeCurrency =
    currencies.find((currency) => currency.code === appCurrency) ?? currencies[0];
  function convertSelectedCurrencyInputToInr(amount: number) {
    return roundMoney(convertCurrency(amount, appCurrency, "INR"));
  }

  function convertInrToSelectedCurrencyInput(amountInInr: number) {
    return roundMoney(convertCurrency(amountInInr, "INR", appCurrency));
  }

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
  const paymentDue = useMemo(
    () => pendingDues.find((due) => due.id === paymentDueId) ?? null,
    [paymentDueId, pendingDues],
  );
  const paymentRoom = useMemo(
    () =>
      paymentDue
        ? rooms.find((room) => room.id === paymentDue.roomId) ?? selectedRoom
        : selectedRoom,
    [paymentDue, rooms, selectedRoom],
  );
  const paymentPayerMember = useMemo(
    () => paymentRoom?.members.find((member) => member.isMe) ?? null,
    [paymentRoom],
  );
  const paymentReceiverMember = useMemo(
    () => paymentRoom?.members.find((member) => member.isOwner) ?? null,
    [paymentRoom],
  );
  const paymentEntitledItems = useMemo(() => {
    if (!paymentRoom || !paymentPayerMember) {
      return [];
    }

    return paymentRoom.items.filter(
      (item) => item.assigned_member_id === paymentPayerMember.id,
    );
  }, [paymentPayerMember, paymentRoom]);
  const paymentPendingItems = useMemo(
    () => paymentEntitledItems.filter((item) => !item.isCollected),
    [paymentEntitledItems],
  );
  const paymentRoomPendingDues = useMemo(
    () =>
      paymentRoom
        ? pendingDues.filter((due) => due.roomId === paymentRoom.id)
        : [],
    [paymentRoom, pendingDues],
  );
  const paymentPendingDueByItemId = useMemo(
    () => new Map(paymentRoomPendingDues.map((due) => [due.id, due])),
    [paymentRoomPendingDues],
  );
  const paymentTargetDues = useMemo(
    () =>
      paymentMode === "all"
        ? paymentRoomPendingDues
        : paymentDue
          ? [paymentDue]
          : [],
    [paymentDue, paymentMode, paymentRoomPendingDues],
  );
  const paymentTargetAmount = useMemo(
    () =>
      paymentTargetDues.reduce((sum, due) => sum + Number(due.amount || 0), 0),
    [paymentTargetDues],
  );
  const paymentMemberTotal = useMemo(
    () =>
      paymentEntitledItems.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [paymentEntitledItems],
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
  const trimmedFriendSearch = friendSearch.trim();
  const filteredFriends = useMemo(() => {
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
  const itemPlaceholder = getItemPlaceholder(selectedRoom?.category);
  const selectedRoomItems = selectedRoom?.items ?? [];
  const removableMemberCount = useMemo(
    () =>
      selectedRoom
        ? sortedMembers.filter((member) => {
            const assignedItemCount = selectedRoomItems.filter(
              (item) => item.assigned_member_id === member.id,
            ).length;

            return (
              selectedRoom.isOwner &&
              !member.isMe &&
              !member.isOwner &&
              assignedItemCount === 0
            );
          }).length
        : 0,
    [selectedRoom, selectedRoomItems, sortedMembers],
  );

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

  function emitSplitVerseUpdates({ pendingDuesChanged = true } = {}) {
    window.dispatchEvent(
      new CustomEvent("splitverse:data-updated", {
        detail: { source: "split-rooms" },
      }),
    );

    if (pendingDuesChanged) {
      window.dispatchEvent(new Event("splitverse:pending-dues-updated"));
    }
  }

  function refreshSplitRoomDataInBackground(
    preferredRoomId?: string,
    { pendingDuesChanged = true } = {},
  ) {
    emitSplitVerseUpdates({ pendingDuesChanged });
    void reloadSplitRoomData(preferredRoomId);
  }

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
      const timer = window.setTimeout(() => {
        setSelectedRoomId(roomIdFromNotification);
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [roomIdFromNotification, rooms]);

  useEffect(() => {
    const handleDataUpdated = (event: Event) => {
      const source = (event as CustomEvent<{ source?: string }>).detail?.source;

      if (source === "split-rooms") {
        return;
      }

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
    const nextAssignedMemberId = firstMember?.id || "";

    if (
      (!assignedMemberId ||
        !sortedMembers.some((member) => member.id === assignedMemberId)) &&
      nextAssignedMemberId !== assignedMemberId
    ) {
      const timer = window.setTimeout(() => {
        setAssignedMemberId(nextAssignedMemberId);
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [assignedMemberId, sortedMembers]);

  function toggleSelectedFriend(email: string) {
    setSelectedFriendEmails((prev) =>
      prev.includes(email)
        ? prev.filter((friendEmail) => friendEmail !== email)
        : [...prev, email],
    );
  }

  function getOptimisticId(prefix: string) {
    optimisticIdRef.current += 1;
    return `optimistic-${prefix}-${Date.now()}-${optimisticIdRef.current}`;
  }

  function markRoomMemberDuesCollected(
    room: SplitRoom,
    memberId: string,
    collectedAt = new Date().toISOString(),
  ): SplitRoom {
    const updatedItems = room.items.map((item) =>
      item.assigned_member_id === memberId
        ? {
            ...item,
            collected_at: item.collected_at ?? collectedAt,
            isCollected: true,
          }
        : item,
    );
    const updatedBalances = room.balances.map((balance) => {
      if (balance.memberId !== memberId) {
        return balance;
      }

      return {
        ...balance,
        detail: balance.amount > 0 ? "Collected" : "No dues yet",
        outstandingAmount: 0,
        collectedAmount: balance.amount,
        isCollected: balance.amount > 0,
      };
    });
    const outstandingAmount = updatedBalances.reduce(
      (sum, balance) => sum + (balance.isMe ? 0 : balance.outstandingAmount),
      0,
    );
    const collectedAmount = updatedBalances.reduce(
      (sum, balance) => sum + (balance.isMe ? 0 : balance.collectedAmount),
      0,
    );

    return {
      ...room,
      items: updatedItems,
      balances: updatedBalances,
      outstandingAmount,
      collectedAmount,
      status: outstandingAmount > 0 ? room.status : "All paid",
    };
  }

  function addOptimisticRoomItem({
    room,
    title,
    amount,
    assignedMemberId,
  }: {
    room: SplitRoom;
    title: string;
    amount: number;
    assignedMemberId: string;
  }): SplitRoom {
    const assignedMember = room.members.find(
      (member) => member.id === assignedMemberId,
    );
    const optimisticItem = {
      id: getOptimisticId("item"),
      room_id: room.id,
      assigned_member_id: assignedMemberId,
      title,
      amount,
      collected_at: null,
      expense_id: null,
      isCollected: false,
      created_at: new Date().toISOString(),
    };
    const updatedBalances = room.balances.map((balance) => {
      if (balance.memberId !== assignedMemberId) {
        return balance;
      }

      const nextAmount = balance.amount + amount;
      const nextOutstandingAmount = assignedMember?.isMe
        ? balance.outstandingAmount
        : balance.outstandingAmount + amount;

      return {
        ...balance,
        detail: assignedMember?.isMe
          ? "Your spend"
          : nextOutstandingAmount > 0
            ? "Dues pending"
            : balance.detail,
        amount: nextAmount,
        outstandingAmount: nextOutstandingAmount,
        isCollected:
          !assignedMember?.isMe && nextAmount > 0 ? false : balance.isCollected,
        itemCount: balance.itemCount + 1,
      };
    });
    const outstandingAmount = updatedBalances.reduce(
      (sum, balance) => sum + (balance.isMe ? 0 : balance.outstandingAmount),
      0,
    );

    return {
      ...room,
      items: [optimisticItem, ...room.items],
      totalAmount: room.totalAmount + amount,
      outstandingAmount,
      balances: updatedBalances,
      status: room.status === "New" ? "No one paid" : room.status,
    };
  }

  function createOptimisticRoom({
    name,
    category,
    friendEmails,
  }: {
    name: string;
    category: string;
    friendEmails: string[];
  }): SplitRoom {
    const roomId = getOptimisticId("room");
    const createdAt = new Date().toISOString();
    const ownerMemberId = getOptimisticId("member-owner");
    const ownerMember = {
      id: ownerMemberId,
      room_id: roomId,
      user_id: null,
      display_name: "Me",
      email: null,
      role: "owner",
      status: "active",
      isMe: true,
      isOwner: true,
    };
    const friendMembers = friendEmails.map((email) => {
      const friend = friends.find((item) => item.email === email);

      return {
        id: getOptimisticId("member"),
        room_id: roomId,
        user_id: friend?.id ?? null,
        display_name: friend?.name || email.split("@")[0],
        email,
        role: "member",
        status: "active",
        isMe: false,
        isOwner: false,
      };
    });
    const members = [ownerMember, ...friendMembers];

    return {
      id: roomId,
      name,
      category,
      created_at: createdAt,
      paymentStatus: "no_one_paid",
      isOwner: true,
      memberCount: members.length,
      totalAmount: 0,
      outstandingAmount: 0,
      collectedAmount: 0,
      status: "Creating...",
      members,
      balances: members.map((member) => ({
        memberId: member.id,
        name: member.isMe ? "Me" : member.display_name || member.email,
        detail: member.isMe ? "Your spend" : "No dues yet",
        amount: 0,
        outstandingAmount: 0,
        collectedAmount: 0,
        isMe: member.isMe,
        isCollected: false,
        itemCount: 0,
      })),
      items: [],
    };
  }

  function updateRoomItemOptimistically(
    room: SplitRoom,
    itemId: string,
    title: string,
    amount: number,
  ): SplitRoom {
    const existingItem = room.items.find((item) => item.id === itemId);

    if (!existingItem) {
      return room;
    }

    const member = room.members.find(
      (item) => item.id === existingItem.assigned_member_id,
    );
    const amountDiff = amount - existingItem.amount;
    const affectsOutstanding = !member?.isMe && !existingItem.isCollected;
    const affectsCollected = !member?.isMe && existingItem.isCollected;

    return {
      ...room,
      totalAmount: room.totalAmount + amountDiff,
      outstandingAmount: affectsOutstanding
        ? room.outstandingAmount + amountDiff
        : room.outstandingAmount,
      collectedAmount: affectsCollected
        ? room.collectedAmount + amountDiff
        : room.collectedAmount,
      items: room.items.map((item) =>
        item.id === itemId ? { ...item, title, amount } : item,
      ),
      balances: room.balances.map((balance) =>
        balance.memberId === existingItem.assigned_member_id
          ? {
              ...balance,
              amount: balance.amount + amountDiff,
              outstandingAmount: affectsOutstanding
                ? balance.outstandingAmount + amountDiff
                : balance.outstandingAmount,
              collectedAmount: affectsCollected
                ? balance.collectedAmount + amountDiff
                : balance.collectedAmount,
            }
          : balance,
      ),
    };
  }

  function deleteRoomItemOptimistically(
    room: SplitRoom,
    itemToDelete: SplitRoom["items"][number],
  ): SplitRoom {
    const member = room.members.find(
      (item) => item.id === itemToDelete.assigned_member_id,
    );
    const affectsOutstanding = !member?.isMe && !itemToDelete.isCollected;
    const affectsCollected = !member?.isMe && itemToDelete.isCollected;
    const nextItems = room.items.filter((item) => item.id !== itemToDelete.id);
    const nextOutstandingAmount = affectsOutstanding
      ? Math.max(0, room.outstandingAmount - itemToDelete.amount)
      : room.outstandingAmount;

    return {
      ...room,
      items: nextItems,
      totalAmount: Math.max(0, room.totalAmount - itemToDelete.amount),
      outstandingAmount: nextOutstandingAmount,
      collectedAmount: affectsCollected
        ? Math.max(0, room.collectedAmount - itemToDelete.amount)
        : room.collectedAmount,
      status: nextItems.length === 0 ? "New" : room.status,
      balances: room.balances.map((balance) =>
        balance.memberId === itemToDelete.assigned_member_id
          ? {
              ...balance,
              amount: Math.max(0, balance.amount - itemToDelete.amount),
              outstandingAmount: affectsOutstanding
                ? Math.max(0, balance.outstandingAmount - itemToDelete.amount)
                : balance.outstandingAmount,
              collectedAmount: affectsCollected
                ? Math.max(0, balance.collectedAmount - itemToDelete.amount)
                : balance.collectedAmount,
              itemCount: Math.max(0, balance.itemCount - 1),
            }
          : balance,
      ),
    };
  }

  function markPendingDuePaid(dueId: string) {
    const paidDue = pendingDues.find((due) => due.id === dueId);

    setPendingDues((prev) => prev.filter((due) => due.id !== dueId));

    if (!paidDue) {
      return;
    }

    const paidAt = new Date().toISOString();

    setRooms((prev) =>
      prev.map((room) =>
        room.id === paidDue.roomId
          ? {
              ...room,
              items: room.items.map((item) =>
                item.id === dueId
                  ? {
                      ...item,
                      collected_at: item.collected_at ?? paidAt,
                      isCollected: true,
                    }
                  : item,
              ),
            }
          : room,
      ),
    );
  }

  function getRoomItemMemberName(memberId: string) {
    const member = selectedRoom?.members.find((item) => item.id === memberId);

    if (!member) {
      return "Member";
    }

    return getMemberName(member);
  }

  function startEditingItem(item: SplitRoom["items"][number]) {
    setHistoryDialogOpen(true);
    setEditingItemId(item.id);
    setEditItemTitle(item.title);
    setEditItemAmount(String(convertInrToSelectedCurrencyInput(item.amount)));
    setMessage("");
    setError("");
  }

  function cancelEditingItem() {
    setEditingItemId("");
    setEditItemTitle("");
    setEditItemAmount("");
  }

  function closeHistoryDialog() {
    setHistoryDialogOpen(false);
    cancelEditingItem();
  }

  function closeMembersDialog() {
    setMembersDialogOpen(false);
  }

  function getMemberAssignedItemCount(memberId: string) {
    return selectedRoomItems.filter((item) => item.assigned_member_id === memberId)
      .length;
  }

  function getMemberPendingItemCount(memberId: string) {
    return selectedRoomItems.filter(
      (item) => item.assigned_member_id === memberId && !item.isCollected,
    ).length;
  }

  function canRemoveMember(member: SplitRoom["members"][number]) {
    return Boolean(
      selectedRoom?.isOwner &&
        !member.isMe &&
        !member.isOwner &&
        getMemberAssignedItemCount(member.id) === 0,
    );
  }

  function getMemberRemoveReason(member: SplitRoom["members"][number]) {
    const assignedItemCount = getMemberAssignedItemCount(member.id);

    if (!selectedRoom?.isOwner) {
      return "Only the room host can remove members.";
    }

    if (member.isMe || member.isOwner) {
      return "The room host cannot be removed.";
    }

    if (assignedItemCount > 0) {
      return "This member has room history, so removing them would affect previous split records.";
    }

    return "Remove member from this room.";
  }

  async function handleRemoveRoomMember(member: SplitRoom["members"][number]) {
    setMessage("");
    setError("");

    if (!selectedRoom) {
      setError("Choose a room first.");
      return;
    }

    if (!canRemoveMember(member)) {
      setError(getMemberRemoveReason(member));
      return;
    }

    const confirmed = window.confirm(
      `Remove ${getMemberName(member)} from ${selectedRoom.name}?`,
    );

    if (!confirmed) {
      return;
    }

    const previousRooms = rooms;

    try {
      setRemovingMemberId(member.id);
      setRooms((prev) =>
        prev.map((room) =>
          room.id === selectedRoom.id
            ? {
                ...room,
                members: room.members.filter((item) => item.id !== member.id),
                balances: room.balances.filter(
                  (balance) => balance.memberId !== member.id,
                ),
                memberCount: Math.max(0, room.memberCount - 1),
              }
            : room,
        ),
      );
      setMessage("Member removed from the room.");

      await withTopProgress(async () => {
        await removeSplitRoomMember(selectedRoom.id, member.id);
        refreshSplitRoomDataInBackground(selectedRoom.id);
      });
    } catch (removeError) {
      setRooms(previousRooms);
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Failed to remove member",
      );
      setMessage("");
    } finally {
      setRemovingMemberId("");
    }
  }

  async function handleUpdateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const title = editItemTitle.trim();
    const amountInSelectedCurrency = Number(editItemAmount);

    if (!selectedRoom) {
      setError("Choose a room first.");
      return;
    }

    if (!editingItemId) {
      setError("Choose an item to edit.");
      return;
    }

    if (!title) {
      setError("Item name is required.");
      return;
    }

    if (
      !Number.isFinite(amountInSelectedCurrency) ||
      amountInSelectedCurrency <= 0
    ) {
      setError(`Amount must be greater than 0 ${appCurrency}.`);
      return;
    }

    const amountInInr = convertSelectedCurrencyInputToInr(
      amountInSelectedCurrency,
    );

    if (!Number.isFinite(amountInInr) || amountInInr <= 0) {
      setError("Could not convert this amount to INR. Try again.");
      return;
    }

    const previousRooms = rooms;
    const previousPendingDues = pendingDues;

    try {
      setUpdatingItemId(editingItemId);

      setRooms((prev) =>
        prev.map((room) =>
          room.id === selectedRoom.id
            ? updateRoomItemOptimistically(room, editingItemId, title, amountInInr)
            : room,
        ),
      );
      setMessage("Split item updated.");
      cancelEditingItem();

      await withTopProgress(async () => {
        await updateSplitRoomItem(editingItemId, {
          title,
          amount: amountInInr,
        });
        refreshSplitRoomDataInBackground(selectedRoom.id);
      });
    } catch (updateError) {
      setRooms(previousRooms);
      setPendingDues(previousPendingDues);
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update item",
      );
    } finally {
      setUpdatingItemId("");
    }
  }

  async function handleDeleteItem(item: SplitRoom["items"][number]) {
    setMessage("");
    setError("");

    if (!selectedRoom) {
      setError("Choose a room first.");
      return;
    }

    const previousRooms = rooms;
    const previousPendingDues = pendingDues;

    try {
      setDeletingItemId(item.id);

      setRooms((prev) =>
        prev.map((room) =>
          room.id === selectedRoom.id
            ? deleteRoomItemOptimistically(room, item)
            : room,
        ),
      );

      if (editingItemId === item.id) {
        cancelEditingItem();
      }

      setMessage("Split item deleted.");

      await withTopProgress(async () => {
        await deleteSplitRoomItem(item.id);
        refreshSplitRoomDataInBackground(selectedRoom.id);
      });
    } catch (deleteError) {
      setRooms(previousRooms);
      setPendingDues(previousPendingDues);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete item",
      );
    } finally {
      setDeletingItemId("");
    }
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

    const previousRooms = rooms;
    const previousSelectedRoomId = selectedRoomId;
    const nextRoomName = roomName.trim();
    const nextRoomCategory = roomCategory;
    const nextFriendEmails = selectedFriendEmails;
    const optimisticRoom = createOptimisticRoom({
      name: nextRoomName,
      category: nextRoomCategory,
      friendEmails: nextFriendEmails,
    });

    try {
      setSavingRoom(true);
      setRooms((prev) => [optimisticRoom, ...prev]);
      setSelectedRoomId(optimisticRoom.id);
      setRoomName("");
      setSelectedFriendEmails([]);
      setFriendSearch("");
      setFriendPickerOpen(false);
      setRoomCategory("restaurant");
      setMessage("Room created instantly. Saving...");

      await withTopProgress(async () => {
        const response = await createSplitRoom({
          name: nextRoomName,
          category: nextRoomCategory,
          members: nextFriendEmails,
        });

        setMessage("Room created and added to your active rooms.");
        void reloadSplitRoomData(response.room.id);
      });
    } catch (createError) {
      setRooms(previousRooms);
      setSelectedRoomId(previousSelectedRoomId);
      setRoomName(nextRoomName);
      setSelectedFriendEmails(nextFriendEmails);
      setRoomCategory(nextRoomCategory);
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

    if (!selectedRoom.isOwner) {
      setError("Only the room owner can add items to this room.");
      return;
    }

    const amountInSelectedCurrency = Number(itemAmount);

    if (!itemTitle.trim()) {
      setError("Item name is required.");
      return;
    }

    if (
      !Number.isFinite(amountInSelectedCurrency) ||
      amountInSelectedCurrency <= 0
    ) {
      setError(`Amount must be greater than 0 ${appCurrency}.`);
      return;
    }

    const numericAmount = convertSelectedCurrencyInputToInr(
      amountInSelectedCurrency,
    );

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Could not convert this amount to INR. Try again.");
      return;
    }

    if (!assignedMemberId) {
      setError("Choose who this item is assigned to.");
      return;
    }

    const previousRooms = rooms;
    const previousPendingDues = pendingDues;
    const previousItemTitle = itemTitle;
    const previousItemAmount = itemAmount;
    const assignedMember = sortedMembers.find(
      (member) => member.id === assignedMemberId,
    );

    try {
      setSavingItem(true);
      setRooms((prev) =>
        prev.map((room) =>
          room.id === selectedRoom.id
            ? addOptimisticRoomItem({
                room,
                title: itemTitle.trim(),
                amount: numericAmount,
                assignedMemberId,
              })
            : room,
        ),
      );
      setItemTitle("");
      setItemAmount("");
      setMessage(assignedMember?.isMe ? "Expense item added" : "Due added");

      await withTopProgress(async () => {
        await createSplitRoomItem(selectedRoom.id, {
          title: previousItemTitle.trim(),
          amount: numericAmount,
          assignedMemberId,
        });

        setMessage(
          assignedMember?.isMe
            ? "Expense item added"
            : "Expense item added as a due",
        );
        refreshSplitRoomDataInBackground(selectedRoom.id, {
          pendingDuesChanged: !assignedMember?.isMe,
        });
      });
    } catch (itemError) {
      setRooms(previousRooms);
      setPendingDues(previousPendingDues);
      setItemTitle(previousItemTitle);
      setItemAmount(previousItemAmount);
      setError(
        `${
          itemError instanceof Error ? itemError.message : "Failed to add item"
        } The instant item was rolled back.`,
      );
      setMessage("");
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

    const previousRooms = rooms;
    const previousPendingDues = pendingDues;
    const previousSelectedRoomId = selectedRoomId;
    const nextSelectedRoomId =
      room.id === selectedRoomId
        ? rooms.find((item) => item.id !== room.id)?.id || ""
        : selectedRoomId;

    try {
      setDeletingRoomId(room.id);
      setRooms((prev) => prev.filter((item) => item.id !== room.id));
      setPendingDues((prev) => prev.filter((due) => due.roomId !== room.id));
      setSelectedRoomId(nextSelectedRoomId);
      setMessage("Deleting the Room...");

      await withTopProgress(async () => {
        await deleteSplitRoom(room.id);
        setMessage("Room deleted.");
        refreshSplitRoomDataInBackground(
          room.id === selectedRoomId ? undefined : selectedRoomId,
        );
      });
    } catch (deleteError) {
      setRooms(previousRooms);
      setPendingDues(previousPendingDues);
      setSelectedRoomId(previousSelectedRoomId);
      setError(
        `${
          deleteError instanceof Error
            ? deleteError.message
            : "Failed to delete room"
        } The room was restored.`,
      );
      setMessage("");
    } finally {
      setDeletingRoomId("");
    }
  };

  const handleCollectMemberDues = async (roomId: string, memberId: string) => {
    setMessage("");
    setError("");

    const previousRooms = rooms;
    const previousPendingDues = pendingDues;

    try {
      setCollectingMemberId(memberId);
      setRooms((prev) =>
        prev.map((room) =>
          room.id === roomId
            ? markRoomMemberDuesCollected(room, memberId)
            : room,
        ),
      );
      setMessage("Dues marked collected.");

      await withTopProgress(async () => {
        const response = await collectSplitRoomMemberDues(roomId, memberId);

        setMessage(
          response.updatedCount > 0
            ? "Dues marked as collected."
            : "There were no pending dues for this member.",
        );
        refreshSplitRoomDataInBackground(roomId);
      });
    } catch (collectError) {
      setRooms(previousRooms);
      setPendingDues(previousPendingDues);
      setError(
        `${
          collectError instanceof Error
            ? collectError.message
            : "Failed to mark dues collected"
        } The member balance was restored.`,
      );
      setMessage("");
    } finally {
      setCollectingMemberId("");
    }
  };

  function openPaymentDialog(itemId: string) {
    setMessage("");
    setError("");
    setPaymentDialogError("");
    setPaymentWalletPin("");
    setPaymentMode("single");
    setPaymentPinDialogOpen(false);
    setPaymentDueId(itemId);
  }

  function openMemberPaymentDialog(memberId: string) {
    if (!selectedRoom) {
      return;
    }

    const member = selectedRoom.members.find((item) => item.id === memberId);

    if (!member?.isMe || selectedRoomPendingDues.length === 0) {
      return;
    }

    openPaymentDialog(selectedRoomPendingDues[0].id);
  }

  function closePaymentDialog() {
    if (payingDueId) {
      return;
    }

    setPaymentDueId("");
    setPaymentWalletPin("");
    setPaymentMode("single");
    setPaymentPinDialogOpen(false);
    setPaymentDialogError("");
  }

  function closePaymentPinDialog() {
    if (payingDueId) {
      return;
    }

    setPaymentWalletPin("");
    setPaymentPinDialogOpen(false);
    setPaymentDialogError("");
  }

  function openPaymentPinDialog(mode: "single" | "all") {
    setMessage("");
    setError("");
    setPaymentDialogError("");
    setPaymentWalletPin("");
    setPaymentMode(mode);

    if (mode === "single" && !paymentDue) {
      setPaymentDialogError("Choose a pending due first.");
      return;
    }

    if (mode === "all" && paymentRoomPendingDues.length === 0) {
      setPaymentDialogError("No pending dues found in this room.");
      return;
    }

    setPaymentPinDialogOpen(true);
  }

  const handleConfirmWalletPayment = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setPaymentDialogError("");

    const firstPaymentTargetDue = paymentTargetDues[0];

    if (!firstPaymentTargetDue) {
      setPaymentDialogError("Choose a pending due first.");
      return;
    }

    const walletPin = paymentWalletPin.trim();

    if (!/^\d{4,6}$/.test(walletPin)) {
      setPaymentDialogError("Enter your 4 to 6 digit wallet PIN.");
      return;
    }

    const previousRooms = rooms;
    const previousPendingDues = pendingDues;

    try {
      setPayingDueId(paymentMode === "all" ? "all" : firstPaymentTargetDue.id);
      paymentTargetDues.forEach((due) => markPendingDuePaid(due.id));
      setMessage("Processing wallet payment...");

      await withTopProgress(async () => {
        for (const due of paymentTargetDues) {
          await paySplitRoomDue(due.id, { walletPin });
        }

        setMessage(
          paymentMode === "all"
            ? "All room dues paid from wallet successfully."
            : "Due paid from wallet successfully.",
        );
        setPaymentDueId("");
        setPaymentWalletPin("");
        setPaymentMode("single");
        setPaymentPinDialogOpen(false);
        refreshSplitRoomDataInBackground(firstPaymentTargetDue.roomId);
      });
    } catch (payError) {
      setRooms(previousRooms);
      setPendingDues(previousPendingDues);
      setPaymentDialogError(
        `${
          payError instanceof Error
            ? payError.message
            : "Failed to pay due from wallet"
        } The due was restored as unpaid.`,
      );
      setMessage("");
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
                <p
                  className="dashboard-muted-text split-room-friends-skeleton"
                  aria-label="No friends yet. Add friends first from the Friends page."
                >
                  <LoadingSkeleton wide />
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
                      <label className="friend-picker-search">
                        <span>Search friends</span>
                        <input
                          type="search"
                          placeholder="Search by name or email"
                          value={friendSearch}
                          onChange={(event) =>
                            setFriendSearch(event.target.value)
                          }
                          onClick={(event) => event.stopPropagation()}
                        />
                      </label>

                      {filteredFriends.length === 0 && (
                        <p className="friend-picker-empty">
                          You are not friends with {trimmedFriendSearch}.
                        </p>
                      )}

                      {filteredFriends.map((friend) => {
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
                            {renderFriendMiniAvatar(friend)}

                            <strong>
                              {friend.name || friend.email.split("@")[0]}
                              <small>
                                {formatFriendshipAge(friend.friendship_days)}
                              </small>
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
                  <em>{formatCurrency(room.outstandingAmount)}{" "}due</em>
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
            <div className="member-balance-list">
              {selectedRoom?.balances.length
                ? selectedRoom.balances.map((balance) => {
                    const hasWalletDues =
                      balance.isMe && selectedRoomPendingDues.length > 0;
                    const hasUnpaidDue =
                      hasWalletDues ||
                      (!balance.isMe && balance.outstandingAmount > 0);
                    const rowClassName = [
                      "member-balance-row",
                      balance.isCollected ? "collected" : "",
                      hasUnpaidDue ? "unpaid" : "",
                      hasWalletDues ? "expandable" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const balanceMember = selectedRoom.members.find(
                      (member) => member.id === balance.memberId,
                    );

                    return (
                      <div
                        className="member-balance-entry"
                        key={balance.memberId}
                      >
                        <div
                          className={rowClassName}
                          role={hasWalletDues ? "button" : undefined}
                          tabIndex={hasWalletDues ? 0 : undefined}
                          onClick={() => {
                            if (!hasWalletDues) {
                              return;
                            }

                            openMemberPaymentDialog(balance.memberId);
                          }}
                          onKeyDown={(event) => {
                            if (
                              !hasWalletDues ||
                              (event.key !== "Enter" && event.key !== " ")
                            ) {
                              return;
                            }

                            event.preventDefault();
                            openMemberPaymentDialog(balance.memberId);
                          }}
                        >
                          {renderMemberMiniAvatar(balanceMember)}
                          <span className="member-balance-name">
                            {hasUnpaidDue && (
                              <i
                                className="member-unpaid-dot"
                                aria-label="Unpaid dues"
                              />
                            )}
                            <span className="member-balance-name-text">
                              {balance.name}
                            </span>
                            {!balance.isMe &&
                              balance.outstandingAmount > 0 &&
                              selectedRoom.isOwner && (
                                <button
                                  className="balance-collect-button compact"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleCollectMemberDues(
                                      selectedRoom.id,
                                      balance.memberId,
                                    );
                                  }}
                                  disabled={
                                    collectingMemberId === balance.memberId
                                  }
                                >
                                  <CheckCircle2 size={12} />
                                  {collectingMemberId === balance.memberId
                                    ? "Collecting"
                                    : "Manual collect"}
                                </button>
                              )}
                          </span>
                          <strong>{balance.detail}</strong>
                          <em>
                            {balance.isMe
                              ? formatCurrency(balance.amount)
                              : formatCurrency(balance.outstandingAmount)}
                          </em>
                          {hasWalletDues && (
                            <WalletCards
                              className="member-due-chevron"
                              size={16}
                              aria-hidden="true"
                            />
                          )}
                        </div>

                      </div>
                    );
                  })
                : null}
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

          {selectedRoom && (
            <p className="dashboard-muted-text split-room-owner-only-note">
              {selectedRoom.isOwner ? (
                "Room owner"
              ) : (
                <>
                  Only the room owner can add items to this room. You can still
                  view your assigned items and pay your pending dues.
                </>
              )}
            </p>
          )}

          <form className="assignment-grid" onSubmit={handleAddItem}>
            <label className="assign-rooms">
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
                disabled={savingItem || !selectedRoom || !selectedRoom.isOwner}
              />
            </label>
            <label>
              <span>Amount ({activeCurrency.symbol} {appCurrency})</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={formatCurrency(420)}
                value={itemAmount}
                onChange={(event) => setItemAmount(event.target.value)}
                disabled={savingItem || !selectedRoom || !selectedRoom.isOwner}
              />
            </label>
            <label className="assign-category">
              <span>Assign to</span>
              <Dropdown
                ariaLabel="Assigned member"
                value={assignedMemberId}
                options={memberOptions}
                onChange={setAssignedMemberId}
                placeholder="No members yet"
                disabled={savingItem || sortedMembers.length === 0 || !selectedRoom?.isOwner}
              />
            </label>
            <button type="submit" disabled={savingItem || !selectedRoom || !selectedRoom.isOwner}>
              {savingItem ? "Adding item" : selectedRoom?.isOwner ? "Add item" : "Owner only"}
            </button>
          </form>
        </article>

        <article className="bento-card room-items-card split-room-history-card">
          <div className="bento-card-head">
            <div>
              <span>Split history</span>
              <h2>{selectedRoom ? selectedRoom.name : "No room selected"}</h2>
            </div>
            <ReceiptText size={23} />
          </div>

          <p className="dashboard-muted-text">
            View the full split history or manage room members from one place
            without changing the room layout.
          </p>

          <div className="split-room-history-preview">
            <div>
              <span>Items</span>
              <strong>{selectedRoomItems.length}</strong>
            </div>
            <div>
              <span>Members</span>
              <strong>{selectedRoom?.memberCount ?? 0}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{formatCurrency(selectedRoom?.totalAmount ?? 0)}</strong>
            </div>
          </div>

          <div className="split-room-history-actions">
            <button
              className="dashboard-secondary-button split-room-history-open-button"
              type="button"
              onClick={() => setHistoryDialogOpen(true)}
              disabled={!selectedRoom}
            >
              <ReceiptText size={16} />
              Open room history
            </button>

            <button
              className="dashboard-secondary-button split-room-members-open-button"
              type="button"
              onClick={() => setMembersDialogOpen(true)}
              disabled={!selectedRoom || !selectedRoom.isOwner}
              title={
                selectedRoom?.isOwner
                  ? "Manage room members"
                  : "Only the room host can manage members"
              }
            >
              <UsersRound size={16} />
              Manage members
            </button>
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

      {paymentDue && paymentRoom && (
        <div className="split-room-payment-backdrop" role="presentation">
          <div
            className="split-room-payment-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="split-room-payment-title"
          >
            <div className="split-room-payment-head">
              <div>
                <span>Wallet payment</span>
                <h2 id="split-room-payment-title">Member payment</h2>
              </div>
              <button
                type="button"
                aria-label="Close payment popup"
                onClick={closePaymentDialog}
                disabled={Boolean(payingDueId)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="split-room-payment-summary">
              <div>
                <span>Room</span>
                <strong>{paymentDue.roomName}</strong>
                <small>Total room spend: {formatCurrency(paymentRoom.totalAmount)}</small>
              </div>
              <div>
                <span>Pay to</span>
                <strong>
                  {paymentReceiverMember
                    ? getMemberName(paymentReceiverMember)
                    : paymentDue.receiverName || paymentDue.receiverEmail}
                </strong>
                <small>{paymentDue.receiverEmail}</small>
              </div>
              <div>
                <span>Your due</span>
                <strong>{formatCurrency(paymentDue.amount)}</strong>
                <small>For {" "}{paymentDue.title}</small>
              </div>
            </div>

            <div className="split-room-payment-method">
              <WalletCards size={20} />
              <div>
                <strong>Pay from SplitVerse Wallet</strong>
                <small>{" "}Select one item or use Pay All for every pending due in this room.</small>
              </div>
            </div>

            <div className="split-room-payment-member-card">
              <div className="split-room-payment-member-head">
                {renderMemberMiniAvatar(paymentPayerMember ?? undefined)}
                <div>
                  <span>Member details</span>
                  <small>
                    {" "}Total items assigned to you: {" "} {formatCurrency(paymentMemberTotal)}
                  </small>
                </div>
              </div>

              <div className="split-room-payment-items">
                <span>Items you are entitled to</span>
                <div className="split-room-payment-item-list">
                  {paymentEntitledItems.length === 0 ? (
                    <p className="dashboard-muted-text">No assigned items found.</p>
                  ) : (
                    paymentEntitledItems.map((item) => {
                      const selectableDue = paymentPendingDueByItemId.get(item.id);
                      const selectable = Boolean(selectableDue);
                      const active = item.id === paymentDue.id;

                      return (
                        <div
                          className={[
                            "split-room-payment-item-row",
                            item.isCollected ? "paid" : "pending",
                            active ? "active" : "",
                            selectable ? "selectable" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={item.id}
                          role={selectable ? "button" : undefined}
                          tabIndex={selectable ? 0 : undefined}
                          onClick={() => {
                            if (selectableDue) {
                              setPaymentDueId(selectableDue.id);
                              setPaymentDialogError("");
                            }
                          }}
                          onKeyDown={(event) => {
                            if (
                              !selectableDue ||
                              (event.key !== "Enter" && event.key !== " ")
                            ) {
                              return;
                            }

                            event.preventDefault();
                            setPaymentDueId(selectableDue.id);
                            setPaymentDialogError("");
                          }}
                        >
                          <div>
                            <strong>{item.title}</strong>
                            <small>
                              {item.isCollected
                                ? "Paid"
                                : active
                                  ? "Selected for payment"
                                  : selectable
                                    ? "Tap to select"
                                    : "Pending"}
                            </small>
                          </div>
                          <em>{formatCurrency(item.amount)}</em>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {paymentPendingItems.length > 1 && (
              <p className="split-room-payment-note">
                You have {" "}{paymentPendingItems.length}{" "} pending items in this room.
                Use Pay All to clear every pending item in this room.
              </p>
            )}

            {paymentDialogError && (
              <p className="split-room-payment-error">{paymentDialogError}</p>
            )}

            <div className="split-room-payment-actions">
              <button
                className="dashboard-secondary-button"
                type="button"
                onClick={closePaymentDialog}
                disabled={Boolean(payingDueId)}
              >
                Cancel
              </button>
              <button
                className="dashboard-secondary-button"
                type="button"
                onClick={() => openPaymentPinDialog("all")}
                disabled={Boolean(payingDueId) || paymentRoomPendingDues.length === 0}
              >
                Pay All
              </button>
              <button
                className="dashboard-primary-button"
                type="button"
                onClick={() => openPaymentPinDialog("single")}
                disabled={Boolean(payingDueId)}
              >
                Pay {" "}{formatCurrency(paymentDue.amount)}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentPinDialogOpen && paymentRoom && paymentTargetDues.length > 0 && (
        <div className="split-room-payment-pin-backdrop" role="presentation">
          <form
            className="split-room-payment-pin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="split-room-payment-pin-title"
            onSubmit={handleConfirmWalletPayment}
          >
            <div className="split-room-payment-head">
              <div>
                <span>Wallet PIN</span>
                <h2 id="split-room-payment-pin-title">Confirm payment</h2>
              </div>
              <button
                type="button"
                aria-label="Close wallet PIN popup"
                onClick={closePaymentPinDialog}
                disabled={Boolean(payingDueId)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="split-room-payment-pin-summary">
              <span>{paymentMode === "all" ? "Pay All" : "Pay selected"}</span>
              <strong>{formatCurrency(paymentTargetAmount)}</strong>
              <small>
                {paymentMode === "all"
                  ? `${paymentTargetDues.length} pending dues in ${paymentRoom.name}`
                  : (paymentTargetDues[0]?.title ?? "Selected due")}
              </small>
            </div>

            <label className="settings-field split-room-payment-pin-field">
              <span>Wallet PIN</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4,6}"
                maxLength={6}
                placeholder="Enter 4 to 6 digit PIN"
                value={paymentWalletPin}
                disabled={Boolean(payingDueId)}
                onChange={(event) =>
                  setPaymentWalletPin(
                    event.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
              />
            </label>

            {paymentDialogError && (
              <p className="split-room-payment-error">{paymentDialogError}</p>
            )}

            <div className="split-room-payment-actions">
              <button
                className="dashboard-secondary-button"
                type="button"
                onClick={closePaymentPinDialog}
                disabled={Boolean(payingDueId)}
              >
                Cancel
              </button>
              <button
                className="dashboard-primary-button"
                type="submit"
                disabled={Boolean(payingDueId)}
              >
                {payingDueId
                  ? "Paying"
                  : paymentMode === "all"
                    ? `Pay All ${formatCurrency(paymentTargetAmount)}`
                    : `Pay ${formatCurrency(paymentTargetAmount)}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {historyDialogOpen && selectedRoom && (
        <div className="split-room-history-backdrop" role="presentation">
          <div
            className="split-room-history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="split-room-history-title"
          >
            <div className="split-room-history-head">
              <div>
                <span>Split room history</span>
                <h2 id="split-room-history-title">{selectedRoom.name}</h2>
              </div>
              <button
                type="button"
                aria-label="Close split room history"
                onClick={closeHistoryDialog}
                disabled={Boolean(updatingItemId || deletingItemId)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="split-room-history-stats">
              <div>
                <span>Total items</span>
                <strong>{selectedRoomItems.length}</strong>
              </div>
              <div>
                <span>Room total</span>
                <strong>{formatCurrency(selectedRoom.totalAmount)}</strong>
              </div>
            </div>

            <div className="split-room-history-list">
              {selectedRoomItems.length === 0 && (
                <p className="dashboard-muted-text">
                  No items added in this room yet.
                </p>
              )}

              {selectedRoomItems.map((item) => {
                const canManageItem =
                  Boolean(selectedRoom.isOwner) && !item.isCollected;
                const isEditing = editingItemId === item.id;

                return (
                  <div
                    className={[
                      "split-room-history-row",
                      item.isCollected ? "collected" : "",
                      isEditing ? "editing" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={item.id}
                  >
                    {isEditing ? (
                      <form
                        className="split-room-history-edit-form"
                        onSubmit={handleUpdateItem}
                      >
                        <label>
                          <span>Item name</span>
                          <input
                            type="text"
                            value={editItemTitle}
                            onChange={(event) =>
                              setEditItemTitle(event.target.value)
                            }
                            disabled={updatingItemId === item.id}
                          />
                        </label>

                        <label>
                          <span>Amount ({activeCurrency.symbol} {appCurrency})</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editItemAmount}
                            onChange={(event) =>
                              setEditItemAmount(event.target.value)
                            }
                            disabled={updatingItemId === item.id}
                          />
                        </label>

                        <div className="split-room-history-edit-actions">
                          <button
                            className="split-room-history-delete-button"
                            type="button"
                            onClick={() => handleDeleteItem(item)}
                            disabled={
                              deletingItemId === item.id ||
                              updatingItemId === item.id
                            }
                          >
                            <Trash2 size={14} />
                            {deletingItemId === item.id ? "Deleting" : "Delete"}
                          </button>

                          <div>
                            <button
                              className="dashboard-secondary-button"
                              type="button"
                              onClick={cancelEditingItem}
                              disabled={
                                deletingItemId === item.id ||
                                updatingItemId === item.id
                              }
                            >
                              Cancel
                            </button>
                            <button
                              className="dashboard-primary-button"
                              type="submit"
                              disabled={
                                deletingItemId === item.id ||
                                updatingItemId === item.id
                              }
                            >
                              {updatingItemId === item.id
                                ? "Saving"
                                : "Save changes"}
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <>
                        <ReceiptText size={16} />
                        <div className="room-item-meta">
                          <span>{item.title}</span>
                          <strong>
                            Assigned to{" "}
                            {getRoomItemMemberName(item.assigned_member_id)}
                          </strong>
                        </div>
                        <em>{formatCurrency(item.amount)}</em>
                        <span
                          className={
                            item.isCollected
                              ? "item-status-pill paid"
                              : "item-status-pill pending"
                          }
                        >
                          {item.isCollected ? "Collected" : "Pending"}
                        </span>
                        <button
                          className="split-room-history-manage-button"
                          type="button"
                          onClick={() => startEditingItem(item)}
                          disabled={
                            !canManageItem || deletingItemId === item.id
                          }
                          title={
                            canManageItem
                              ? "Manage item"
                              : "Collected items cannot be changed"
                          }
                        >
                          <Pencil size={14} />
                          Manage
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="split-room-history-footer">
              <p>
                Pending items can be edited or deleted. Collected items stay
                locked so expenses, wallet payments, and room balances remain
                safe.
              </p>
              <button
                className="dashboard-secondary-button"
                type="button"
                onClick={closeHistoryDialog}
                disabled={Boolean(updatingItemId || deletingItemId)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {membersDialogOpen && selectedRoom && (
        <div className="split-room-history-backdrop" role="presentation">
          <div
            className="split-room-history-dialog split-room-members-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="split-room-members-title"
          >
            <div className="split-room-history-head">
              <div>
                <span>Room member management</span>
                <h2 id="split-room-members-title">
                  Members ({selectedRoom.memberCount})
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close member management"
                onClick={closeMembersDialog}
                disabled={Boolean(removingMemberId)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="split-room-history-stats split-room-members-stats">
              <div>
                <span>Total members</span>
                <strong>{selectedRoom.memberCount}</strong>
              </div>
              <div>
                <span>Can remove</span>
                <strong>{removableMemberCount}</strong>
              </div>
            </div>

            <div className="split-room-members-list">
              {sortedMembers.map((member) => {
                const assignedItemCount = getMemberAssignedItemCount(member.id);
                const pendingItemCount = getMemberPendingItemCount(member.id);
                const removable = canRemoveMember(member);

                return (
                  <div
                    className={[
                      "split-room-member-row",
                      member.isOwner ? "host" : "",
                      removable ? "removable" : "locked",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={member.id}
                  >
                    {renderMemberMiniAvatar(member)}
                    <div className="split-room-member-meta">
                      <strong>{getMemberName(member)}</strong>
                      <span>{member.email || "No email saved"}</span>
                      <small>
                        {member.isOwner
                          ? "Room host"
                          : assignedItemCount > 0
                            ? `${assignedItemCount} room item${
                                assignedItemCount === 1 ? "" : "s"
                              }${
                                pendingItemCount > 0
                                  ? ` • ${pendingItemCount} pending`
                                  : ""
                              }`
                            : "No room items yet"}
                      </small>
                    </div>
                    <span
                      className={
                        removable
                          ? "split-room-member-status removable"
                          : "split-room-member-status locked"
                      }
                    >
                      {removable ? "Removable" : "Locked"}
                    </span>
                    <button
                      className="split-room-member-remove-button"
                      type="button"
                      onClick={() => handleRemoveRoomMember(member)}
                      disabled={!removable || removingMemberId === member.id}
                      title={getMemberRemoveReason(member)}
                    >
                      <UserMinus size={14} />
                      {removingMemberId === member.id ? "Removing" : "Remove"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="split-room-history-footer">
              <p>
                Members can only be removed when they have no room items. This
                keeps split history, dues, wallet payments, and dashboard totals
                safe.
              </p>
              <button
                className="dashboard-secondary-button"
                type="button"
                onClick={closeMembersDialog}
                disabled={Boolean(removingMemberId)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
