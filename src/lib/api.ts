import { auth } from "../config/firebase";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

type CachedAuthToken = {
  uid: string;
  token: string;
  expiresAt: number;
};

let cachedAuthToken: CachedAuthToken | null = null;
const authTokenExpiryBufferMs = 60 * 1000;
const smallApiCache = new Map<
  string,
  { expiresAt: number; promise: Promise<unknown> }
>();

function cachedApiRequest<T>(
  cacheKey: string,
  ttlMs: number,
  request: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = smallApiCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.promise as Promise<T>;
  }

  const promise = request().catch((error) => {
    smallApiCache.delete(cacheKey);
    throw error;
  });

  smallApiCache.set(cacheKey, {
    expiresAt: now + ttlMs,
    promise,
  });

  return promise;
}

function clearApiCache(prefix?: string) {
  if (!prefix) {
    smallApiCache.clear();
    return;
  }

  Array.from(smallApiCache.keys())
    .filter((key) => key.startsWith(prefix))
    .forEach((key) => smallApiCache.delete(key));
}

if (typeof window !== "undefined") {
  window.addEventListener("splitverse:data-updated", () => {
    clearApiCache("friends");
    clearApiCache("dues");
    clearApiCache("profile");
  });
}


async function getCachedAuthToken() {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("User is not authenticated");
  }

  const now = Date.now();

  if (
    cachedAuthToken &&
    cachedAuthToken.uid === currentUser.uid &&
    cachedAuthToken.expiresAt > now + authTokenExpiryBufferMs
  ) {
    return cachedAuthToken.token;
  }

  const tokenResult = await currentUser.getIdTokenResult();

  cachedAuthToken = {
    uid: currentUser.uid,
    token: tokenResult.token,
    expiresAt: new Date(tokenResult.expirationTime).getTime(),
  };

  return tokenResult.token;
}

export type AvatarMode = "photo" | "initials";

export type DbUser = {
  id: string;
  firebase_uid: string;
  name: string | null;
  email: string;
  photo_url: string | null;
  profile_photo_url?: string | null;
  avatar_mode?: AvatarMode | null;
  display_photo_url?: string | null;
  app_currency?: string | null;
  app_language?: string | null;
  has_wallet_pin?: boolean | null;
  provider: string | null;
  created_at: string;
  updated_at: string;
};

const profileDisplayCacheKey = "splitverse-profile-display";

export type CachedProfileDisplay = {
  uid: string;
  avatarMode: AvatarMode;
  displayPhotoUrl: string;
  updatedAt: number;
};

function getUserDisplayPhotoUrl(user: Pick<DbUser, "avatar_mode" | "display_photo_url" | "profile_photo_url" | "photo_url">) {
  if (user.avatar_mode === "initials") {
    return "";
  }

  return user.display_photo_url || user.profile_photo_url || user.photo_url || "";
}

export function readCachedProfileDisplay(uid?: string | null) {
  if (!uid) {
    return null;
  }

  try {
    const cached = window.localStorage.getItem(profileDisplayCacheKey);
    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached) as CachedProfileDisplay;
    return parsed.uid === uid ? parsed : null;
  } catch {
    return null;
  }
}

export function cacheProfileDisplay(user: DbUser, uid = auth.currentUser?.uid || user.firebase_uid) {
  if (!uid) {
    return;
  }

  const payload: CachedProfileDisplay = {
    uid,
    avatarMode: user.avatar_mode === "initials" ? "initials" : "photo",
    displayPhotoUrl: getUserDisplayPhotoUrl(user),
    updatedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(profileDisplayCacheKey, JSON.stringify(payload));
  } catch {
    // localStorage can be blocked; profile still works without the cache.
  }
}

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
    currentMonthTotal?: number;
    currentMonthLabel?: string;
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

// Transaction History Page Integration

export type TransactionStatus =
  | "all"
  | "received"
  | "paid"
  | "pending"
  | "added";

export type TransactionItem = {
  id: string;
  title: string;
  room: string;
  amount: number;
  status: "received" | "paid" | "pending" | "added" | string;
  displayStatus: string;
  type: string;
  createdAt: string;
  displayDate?: string;
};

export type TransactionsResponse = {
  transactions: TransactionItem[];
  summary: {
    netMovement: number;
    count: number;
    totalTillDate?: number;
    visibleCount?: number;
    accountCreatedAt?: string;
  };
};

// wallet topup integration

export type WalletTopUpMethod = "UPI" | "Card" | "Net banking";

export type WalletTopUpPayload = {
  amount: number;
  method?: WalletTopUpMethod;
};

export type WalletTopUpResponse = {
  message: string;
  transaction: {
    id: string;
    type: "credit" | "debit";
    amount: number;
    description: string | null;
    created_at: string;
  };
  walletBalance: number;
};

export type WalletTopUpItem = {
  id: string;
  amount: number;
  method: string;
  createdAt: string;
  displayDate?: string;
};

export type WalletTopUpsResponse = {
  topUps: WalletTopUpItem[];
};

export async function topUpWallet(payload: WalletTopUpPayload) {
  return apiFetch<WalletTopUpResponse>("/api/wallet/top-up", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getRecentWalletTopUps() {
  return apiFetch<WalletTopUpsResponse>("/api/wallet/top-ups");
}

// wallet summary
export type WalletSummaryResponse = {
  summary: {
    availableBalance: number;
    pendingIncoming: number;
    pendingOutgoing: number;
    netPosition: number;
  };

  recentWalletTransactions: {
    id: string;
    type: "credit" | "debit";
    amount: number;
    description: string | null;
    createdAt: string;
    displayDate?: string;
  }[];

  pendingSettlements: {
    id: string;
    amount: number;
    status: string;
    direction: "incoming" | "outgoing";
    title?: string;
    roomName?: string;
    fromName: string | null;
    fromEmail: string;
    toName: string | null;
    toEmail: string;
    createdAt: string;
    displayDate?: string;
  }[];
};

export async function getWalletSummary() {
  return apiFetch<WalletSummaryResponse>("/api/wallet/summary");
}

// split roommembers

export type SplitRoomMember = {
  id: string;
  room_id: string;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  photo_url?: string | null;
  profile_photo_url?: string | null;
  avatar_mode?: AvatarMode | null;
  display_photo_url?: string | null;
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

export type UpdateSplitRoomItemPayload = {
  title: string;
  amount: number;
};

export type PendingDue = {
  id: string;
  title: string;
  amount: number;
  roomId: string;
  roomName: string;
  receiverName: string | null;
  receiverEmail: string;
  createdAt: string;
};

export async function getPendingDues() {
  return cachedApiRequest("dues:pending", 8_000, () =>
    apiFetch<{ dues: PendingDue[] }>("/api/split-rooms/pending-dues"),
  );
}

export async function paySplitRoomDue(
  itemId: string,
  payload: { walletPin: string },
) {
  return apiFetch<{
    message: string;
    paidItem: {
      id: string;
      roomId: string;
      title: string;
      amount: number;
      expenseId: string;
    };
  }>(`/api/split-rooms/items/${itemId}/pay`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type Friend = {
  id: string;
  name: string | null;
  email: string;
  photo_url: string | null;
  profile_photo_url?: string | null;
  avatar_mode?: AvatarMode | null;
  display_photo_url?: string | null;
  friendship_created_at: string;
  friendship_days: number;
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


export type ExchangeRatesSource = "live" | "cache" | "stale-cache" | "fallback";

export type ExchangeRatesResponse = {
  base: string;
  rates: Record<string, number>;
  source: ExchangeRatesSource;
  provider: string;
  fetchedAt: string | null;
  expiresAt: string | null;
};

export async function getExchangeRates(
  base = "INR",
  symbols: string[] = [],
) {
  const searchParams = new URLSearchParams({ base });

  if (symbols.length > 0) {
    searchParams.set("symbols", symbols.join(","));
  }

  const response = await fetch(
    `${API_URL}/api/exchange-rates?${searchParams.toString()}`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to load exchange rates");
  }

  return data as ExchangeRatesResponse;
}


async function publicApiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "API request failed");
  }

  return data;
}

export async function requestPasswordResetOtp(email: string) {
  return publicApiFetch<{ message: string; expiresInSeconds: number }>(
    "/api/auth/password-reset/request",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export type ResetPasswordWithOtpPayload = {
  email: string;
  otp: string;
  password: string;
  confirmPassword: string;
};

export async function resetPasswordWithOtp(
  payload: ResetPasswordWithOtpPayload,
) {
  return publicApiFetch<{ message: string }>(
    "/api/auth/password-reset/confirm",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getCachedAuthToken();

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

export type EmailLoginOtpSession = {
  sessionId: string;
  email: string;
  expiresAt: string;
};

export async function requestEmailLoginOtp() {
  return apiFetch<EmailLoginOtpSession>("/api/auth/email-login-otp/request", {
    method: "POST",
  });
}

export async function verifyEmailLoginOtp(sessionId: string, otp: string) {
  const response = await fetch(`${API_URL}/api/auth/email-login-otp/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, otp }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to verify login code");
  }

  return data as { verified: boolean };
}

export async function deleteAccount(confirmationText: string) {
  return apiFetch<{ message: string }>("/api/auth/account", {
    method: "DELETE",
    body: JSON.stringify({ confirmationText }),
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

export async function updateSplitRoomItem(
  itemId: string,
  payload: UpdateSplitRoomItemPayload,
) {
  return apiFetch<{ message: string; item: SplitRoomItem }>(
    `/api/split-rooms/items/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteSplitRoomItem(itemId: string) {
  return apiFetch<{ message: string }>(`/api/split-rooms/items/${itemId}`, {
    method: "DELETE",
  });
}

export async function removeSplitRoomMember(roomId: string, memberId: string) {
  return apiFetch<{ message: string; removedMemberId: string }>(
    `/api/split-rooms/${roomId}/members/${memberId}`,
    {
      method: "DELETE",
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
  return cachedApiRequest("friends:summary", 10_000, () =>
    apiFetch<FriendsSummary>("/api/friends"),
  );
}

export async function sendFriendRequest(email: string) {
  const response = await apiFetch<{ message: string; request: FriendRequest }>(
    "/api/friends/requests",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
  clearApiCache("friends");
  return response;
}

export async function acceptFriendRequest(requestId: string) {
  const response = await apiFetch<{ message: string }>(
    `/api/friends/requests/${requestId}/accept`,
    {
      method: "POST",
    },
  );
  clearApiCache("friends");
  return response;
}

export async function deleteFriend(friendId: string) {
  const response = await apiFetch<{ message: string }>(`/api/friends/${friendId}`, {
    method: "DELETE",
  });
  clearApiCache("friends");
  return response;
}

// Transaction History Export function

export async function getTransactions(params?: {
  search?: string;
  status?: TransactionStatus;
  limit?: number;
  exportMode?: "count" | "year";
  year?: number;
}) {
  const searchParams = new URLSearchParams();

  if (params?.search) {
    searchParams.set("search", params.search);
  }

  if (params?.status && params.status !== "all") {
    searchParams.set("status", params.status);
  }

  if (params?.limit) {
    searchParams.set("limit", String(params.limit));
  }

  if (params?.exportMode) {
    searchParams.set("exportMode", params.exportMode);
  }

  if (params?.year) {
    searchParams.set("year", String(params.year));
  }

  const queryString = searchParams.toString();

  return apiFetch<TransactionsResponse>(
    `/api/transactions${queryString ? `?${queryString}` : ""}`,
  );
}

export async function getCurrentDbUser() {
  return cachedApiRequest("profile:me", 8_000, async () => {
    const response = await apiFetch<{ user: DbUser }>("/api/auth/me");
    cacheProfileDisplay(response.user);
    return response;
  });
}

export type UpdateProfileSettingsPayload = {
  avatarMode?: AvatarMode;
  profilePhotoUrl?: string | null;
  appCurrency?: string;
  appLanguage?: string;
};

export async function updateProfileSettings(
  payload: UpdateProfileSettingsPayload,
) {
  const response = await apiFetch<{ message: string; user: DbUser }>("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  clearApiCache("profile");
  cacheProfileDisplay(response.user);
  return response;
}

export async function uploadProfilePhoto(file: File) {
  const token = await getCachedAuthToken();
  const formData = new FormData();
  formData.append("photo", file);

  const response = await fetch(`${API_URL}/api/auth/profile-photo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to upload profile photo");
  }

  clearApiCache("profile");
  cacheProfileDisplay(data.user);
  return data as { message: string; user: DbUser };
}

export type SaveWalletPinPayload = {
  pin: string;
  currentPin?: string;
};

export async function saveWalletPin(payload: SaveWalletPinPayload) {
  const response = await apiFetch<{ message: string; user: DbUser }>("/api/auth/wallet-pin", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  clearApiCache("profile");
  cacheProfileDisplay(response.user);
  return response;
}

export async function requestWalletPinResetOtp() {
  return apiFetch<{ message: string; expiresInSeconds: number }>(
    "/api/auth/wallet-pin/reset-otp/request",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export type ResetWalletPinWithOtpPayload = {
  otp: string;
  pin: string;
};

export async function resetWalletPinWithOtp(
  payload: ResetWalletPinWithOtpPayload,
) {
  const response = await apiFetch<{ message: string; user: DbUser }>(
    "/api/auth/wallet-pin/reset",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  clearApiCache("profile");
  cacheProfileDisplay(response.user);
  return response;
}

export async function verifyWalletPin(pin: string) {
  return apiFetch<{ verified: boolean }>("/api/auth/wallet-pin/verify", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export type RazorpayWalletOrderResponse = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: {
    name?: string;
    email?: string;
  };
};

export async function createRazorpayWalletOrder(payload: {
  amount: number;
  method?: WalletTopUpMethod;
}) {
  return apiFetch<RazorpayWalletOrderResponse>(
    "/api/payments/razorpay/wallet-order",
    {
      method: "POST",
      body: JSON.stringify({ ...payload, currency: "INR" }),
    },
  );
}

export async function verifyRazorpayWalletPayment(payload: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  return apiFetch<{ message: string; walletBalance: number }>(
    "/api/payments/razorpay/verify-wallet-payment",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export type UserDataExport = {
  exportedAt: string;
  user: DbUser;
  dashboard: DashboardSummary;
  wallet: WalletSummaryResponse;
  walletTopUps: WalletTopUpItem[];
  friends: FriendsSummary;
  splitRooms: SplitRoom[];
  transactions: TransactionItem[];
  transactionSummary: TransactionsResponse["summary"];
};

export async function downloadMyData() {
  const [
    userResponse,
    dashboard,
    wallet,
    topUps,
    friends,
    splitRooms,
    transactions,
  ] = await Promise.all([
    getCurrentDbUser(),
    getDashboardSummary(),
    getWalletSummary(),
    getRecentWalletTopUps(),
    getFriendsSummary(),
    getSplitRooms(),
    getTransactions({ exportMode: "count", limit: 1000 }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user: userResponse.user,
    dashboard,
    wallet,
    walletTopUps: topUps.topUps,
    friends,
    splitRooms: splitRooms.rooms,
    transactions: transactions.transactions,
    transactionSummary: transactions.summary,
  } satisfies UserDataExport;
}
