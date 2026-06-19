import { auth } from "../config/firebase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export type DbUser = {
  id: string;
  firebase_uid: string;
  name: string | null;
  email: string;
  photo_url: string | null;
  provider: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardSummary = {
  metrics: {
    todayExpense: number;
    pendingPayment: number;
    todaySavings: number;
    walletBalance: number;
  };

  expenseTracker?: {
    totalSpentToday: number;
    categories: {
      label: string;
      amount: number;
      value: number;
    }[];
    timeSlots?: {
      label: string;
      amount: number;
      peakHour?: string;
    }[];
  };

  walletHealth?: {
    availableBalance: number;
    receivable: number;
  };

  monthlySpend?: {
    graphTotal: number;
    months: {
      label: string;
      amount: number;
      value: number;
      peakDay?: number | string;
      peakSpendingDay?: number | string;
    }[];
  };

  spendingInsight: {
    text: string;
  };
};

export type CreateExpensePayload = {
  title: string;
  category: string;
  amount: number;
  expenseDate?: string;
};

export type Expense = {
  id: string;
  title: string;
  category: string | null;
  amount: number;
  expense_date: string;
  created_at: string;
};

export type SplitRoomMember = {
  id: string;
  room_id: string;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  role: string;
  status: string;
  isMe: boolean;
  isOwner: boolean;
};

export type SplitRoomBalance = {
  memberId: string;
  name: string | null;
  detail: string;
  amount: number;
  outstandingAmount: number;
  collectedAmount: number;
  isMe: boolean;
  isCollected: boolean;
  itemCount: number;
};

export type SplitRoomItem = {
  id: string;
  room_id: string;
  assigned_member_id: string;
  title: string;
  amount: number;
  collected_at: string | null;
  expense_id: string | null;
  isCollected: boolean;
  created_at: string;
};

export type SplitRoom = {
  id: string;
  name: string;
  category: string | null;
  created_at: string;
  paymentStatus: RoomPaymentStatus;
  isOwner: boolean;
  memberCount: number;
  totalAmount: number;
  outstandingAmount: number;
  collectedAmount: number;
  status: string;
  members: SplitRoomMember[];
  balances: SplitRoomBalance[];
  items: SplitRoomItem[];
};

export type RoomPaymentStatus = "no_one_paid" | "all_paid" | "complete";

export type CreateSplitRoomPayload = {
  name: string;
  category: string;
  members: string[];
};

export type CreateSplitRoomItemPayload = {
  title: string;
  amount: number;
  assignedMemberId: string;
};

export type Friend = {
  id: string;
  name: string | null;
  email: string;
  photo_url: string | null;
};

export type FriendRequest = {
  id: string;
  requester_user_id: string;
  requester_name: string | null;
  requester_email: string;
  recipient_email: string;
  status: string;
  token?: string;
  acceptUrl?: string;
  emailStatus?: string;
  created_at: string;
  updated_at: string;
};

export type FriendsSummary = {
  friends: Friend[];
  receivedRequests: FriendRequest[];
  sentRequests: FriendRequest[];
};

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("User is not authenticated");
  }

  const token = await currentUser.getIdToken();

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "API request failed");
  }

  return data;
}

export async function getDashboardSummary() {
  return apiFetch<DashboardSummary>("/api/dashboard/summary");
}

export async function syncCurrentUser() {
  return apiFetch<{ message: string; user: DbUser }>("/api/auth/sync-user", {
    method: "POST",
  });
}


export async function createExpense(payload: CreateExpensePayload) {
  return apiFetch<{ message: string; expense: Expense }>("/api/expenses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSplitRooms() {
  return apiFetch<{ rooms: SplitRoom[] }>("/api/split-rooms");
}

export async function createSplitRoom(payload: CreateSplitRoomPayload) {
  return apiFetch<{ message: string; room: SplitRoom }>("/api/split-rooms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createSplitRoomItem(
  roomId: string,
  payload: CreateSplitRoomItemPayload,
) {
  return apiFetch<{ message: string; item: SplitRoomItem }>(
    `/api/split-rooms/${roomId}/items`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteSplitRoom(roomId: string) {
  return apiFetch<{ message: string }>(`/api/split-rooms/${roomId}`, {
    method: "DELETE",
  });
}

export async function collectSplitRoomMemberDues(
  roomId: string,
  memberId: string,
) {
  return apiFetch<{ message: string; updatedCount: number }>(
    `/api/split-rooms/${roomId}/members/${memberId}/collect`,
    {
      method: "POST",
    },
  );
}

export async function updateSplitRoomPaymentStatus(
  roomId: string,
  paymentStatus: RoomPaymentStatus,
) {
  return apiFetch<{ message: string; paymentStatus: RoomPaymentStatus }>(
    `/api/split-rooms/${roomId}/payment-status`,
    {
      method: "PATCH",
      body: JSON.stringify({ paymentStatus }),
    },
  );
}

export async function getFriendsSummary() {
  return apiFetch<FriendsSummary>("/api/friends");
}

export async function sendFriendRequest(email: string) {
  return apiFetch<{ message: string; request: FriendRequest }>(
    "/api/friends/requests",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export async function acceptFriendRequest(requestId: string) {
  return apiFetch<{ message: string }>(
    `/api/friends/requests/${requestId}/accept`,
    {
      method: "POST",
    },
  );
}



export async function getCurrentDbUser() {
  return apiFetch<{ user: DbUser }>("/api/auth/me");
}
