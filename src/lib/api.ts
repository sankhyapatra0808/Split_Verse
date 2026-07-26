import { auth } from "../config/firebase";

function resolveApiUrl() {
  const configuredUrl = String(import.meta.env.VITE_API_URL || "").trim();
  const fallbackUrl = import.meta.env.DEV
    ? "http://localhost:5000"
    : typeof window !== "undefined"
      ? window.location.origin
      : "";
  const rawUrl = configuredUrl || fallbackUrl;

  if (!rawUrl) {
    throw new Error("VITE_API_URL is required for production builds.");
  }

  if (rawUrl.startsWith("/")) {
    return rawUrl.replace(/\/$/, "");
  }

  const parsedUrl = new URL(rawUrl);
  const localDevelopmentHost =
    import.meta.env.DEV &&
    ["localhost", "127.0.0.1", "10.0.2.2"].includes(parsedUrl.hostname);

  if (parsedUrl.protocol !== "https:" && !localDevelopmentHost) {
    throw new Error(
      "VITE_API_URL must use HTTPS. Local HTTP is allowed only during development.",
    );
  }

  return parsedUrl.toString().replace(/\/$/, "");
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds?: number;

  constructor(options: {
    message: string;
    status: number;
    code?: string;
    retryAfterSeconds?: number;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code || "API_ERROR";
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

type ApiErrorPayload = {
  message?: unknown;
  code?: unknown;
  retryAfterSeconds?: unknown;
};

async function readJsonResponse(response: Response) {
  const rawText = await response.text();

  if (!rawText) return null;

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    if (response.ok) {
      throw new ApiError({
        message: "The server returned an unreadable response.",
        status: response.status,
        code: "INVALID_RESPONSE",
      });
    }

    return null;
  }
}

function throwApiResponseError(response: Response, data: unknown): never {
  const payload =
    typeof data === "object" && data !== null
      ? (data as ApiErrorPayload)
      : {};

  throw new ApiError({
    message:
      typeof payload.message === "string" && payload.message.trim()
        ? payload.message
        : "API request failed",
    status: response.status,
    code:
      typeof payload.code === "string" && payload.code.trim()
        ? payload.code
        : "API_ERROR",
    retryAfterSeconds:
      Number.isFinite(Number(payload.retryAfterSeconds))
        ? Number(payload.retryAfterSeconds)
        : undefined,
  });
}

type CachedAuthToken = {
  uid: string;
  token: string;
  expiresAt: number;
};

let cachedAuthToken: CachedAuthToken | null = null;

export function clearCachedAuthToken() {
  cachedAuthToken = null;
}

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
  username?: string | null;
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
  settledAmount?: number;
  pendingAmount?: number;
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
  paidByUserId?: string | null;
  paidByName?: string | null;
  paidByEmail?: string | null;
  isOwner: boolean;
  isArchived?: boolean;
  isFinalized?: boolean;
  archivedAt?: string | null;
  finalizedAt?: string | null;
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
  paidByEmail?: string;
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

export type NetSettlementBreakdown = {
  itemId: string;
  roomId: string;
  roomName: string;
  title: string;
  direction: string;
  amount: number;
  originalAmount: number;
  settledAmount: number;
  createdAt: string;
};

export type NetSettlement = {
  fromUserId: string;
  fromName: string | null;
  fromEmail: string;
  toUserId: string;
  toName: string | null;
  toEmail: string;
  amount: number;
  currency: "INR";
  isOutgoing: boolean;
  isIncoming: boolean;
  breakdown: NetSettlementBreakdown[];
};

export type NetSettlementsResponse = {
  settlements: NetSettlement[];
  summary: {
    outgoingTotal: number;
    incomingTotal: number;
    netPosition: number;
    currency: "INR";
  };
};

export async function getPendingDues() {
  return cachedApiRequest("dues:pending", 8_000, () =>
    apiFetch<{ dues: PendingDue[] }>("/api/split-rooms/pending-dues"),
  );
}

export async function getNetSettlements() {
  return cachedApiRequest("dues:net-settlements", 8_000, () =>
    apiFetch<NetSettlementsResponse>("/api/split-rooms/net-settlements"),
  );
}

export async function payNetSettlement(payload: {
  toUserId: string;
  walletPin: string;
}) {
  const response = await apiFetch<{
    message: string;
    settlement: {
      fromUserId: string;
      toUserId: string;
      amount: number;
      currency: "INR";
      offsetAmount: number;
      expenseId: string;
    };
  }>("/api/split-rooms/net-settlements/pay", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  clearApiCache("dues");
  return response;
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
  username?: string | null;
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
  requester_username?: string | null;
  requester_email: string;
  recipient_user_id?: string | null;
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

export type GlobalPerson = {
  id: string;
  name: string | null;
  username: string;
  emailHint: string;
  photo_url: string | null;
  profile_photo_url?: string | null;
  avatar_mode?: AvatarMode | null;
  display_photo_url?: string | null;
  relationshipStatus: "friends" | "request_sent" | "request_received" | "none";
};

export type FriendActivitySummary = {
  roomsTogether: number;
  totalSettled: number;
  pendingWithFriend: number;
  netPosition: number;
};

export type FriendActivityItem = {
  id: string;
  title: string;
  amount: number;
  direction: "incoming" | "outgoing" | "neutral";
  source: string;
  createdAt: string;
};

export type FriendActivityResponse = {
  friend: Friend;
  summary: FriendActivitySummary;
  recentActivity: FriendActivityItem[];
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

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throwApiResponseError(response, data);
  }

  return data as T;
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

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throwApiResponseError(response, data);
  }

  return data as T;
}

export type PublicPageContent = {
  sections?: {
    heading: string;
    body: string;
    bullets?: string[];
  }[];
  highlights?: { label: string; value: string }[];
  actions?: { label: string; href: string }[];
  contactChannels?: { label: string; value: string; href?: string }[];
};

export type PublicPage = {
  slug: string;
  title: string;
  eyebrow: string | null;
  summary: string | null;
  content: PublicPageContent;
  updatedAt: string;
};

export async function getPublicPage(slug: string) {
  return publicApiFetch<{ page: PublicPage }>(`/api/public-pages/${slug}`);
}

export async function sendContactMessage(payload: {
  name: string;
  email: string;
  subject?: string;
  message: string;
}) {
  return publicApiFetch<{ message: string; request: { id: string; createdAt: string } }>(
    "/api/public-pages/contact/messages",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function createSupportTicket(payload: {
  name: string;
  email: string;
  subject: string;
  category?: string;
  message: string;
}) {
  return publicApiFetch<{ message: string; ticket: { id: string; createdAt: string } }>(
    "/api/public-pages/support/tickets",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getDashboardSummary() {
  return apiFetch<DashboardSummary>("/api/dashboard/summary");
}

export async function syncCurrentUser(
  payload: {
    username?: string;
    requireUsername?: boolean;
    deferUsernameSetup?: boolean;
  } = {},
) {
  return apiFetch<{ message: string; user: DbUser }>("/api/auth/sync-user", {
    method: "POST",
    body: JSON.stringify({
      requireUsername: payload.requireUsername ?? true,
      deferUsernameSetup: payload.deferUsernameSetup ?? false,
      ...(payload.username ? { username: payload.username } : {}),
    }),
  });
}

export async function checkUsernameAvailability(username: string) {
  return publicApiFetch<{ username: string; available: boolean }>(
    "/api/auth/username/availability",
    {
      method: "POST",
      body: JSON.stringify({ username }),
    },
  );
}

export type EmailLoginOtpSession = {
  sessionId: string;
  email: string;
  expiresAt: string;
};

export async function requestEmailLoginOtp(
  identifier: string,
  password: string,
) {
  return publicApiFetch<EmailLoginOtpSession>(
    "/api/auth/email-login-otp/request",
    {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    },
  );
}

export async function resendEmailLoginOtp(sessionId: string) {
  return publicApiFetch<EmailLoginOtpSession>(
    "/api/auth/email-login-otp/resend",
    {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    },
  );
}

export async function verifyEmailLoginOtp(sessionId: string, otp: string) {
  return publicApiFetch<{
    verified: boolean;
    customToken: string;
    email: string;
  }>("/api/auth/email-login-otp/verify", {
    method: "POST",
    body: JSON.stringify({ sessionId, otp }),
  });
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

export async function finalizeSplitRoom(roomId: string) {
  const response = await apiFetch<{ message: string; finalizedAt: string }>(
    `/api/split-rooms/${roomId}/finalize`,
    { method: "POST" },
  );
  clearApiCache("dues");
  return response;
}

export async function archiveSplitRoom(roomId: string) {
  const response = await apiFetch<{ message: string; archivedAt: string }>(
    `/api/split-rooms/${roomId}/archive`,
    { method: "POST" },
  );
  clearApiCache("dues");
  return response;
}

export async function sendSplitRoomReminder(roomId: string) {
  return apiFetch<{ message: string; remindedCount: number }>(
    `/api/split-rooms/${roomId}/reminders`,
    { method: "POST" },
  );
}

export async function muteSplitRoomReminder(roomId: string, mutedHours = 24) {
  const response = await apiFetch<{ message: string; mutedUntil: string }>(
    `/api/split-rooms/${roomId}/reminders/mute`,
    {
      method: "POST",
      body: JSON.stringify({ mutedHours }),
    },
  );
  clearApiCache("dues");
  return response;
}

export async function markSplitRoomReminderDiscussed(roomId: string) {
  const response = await apiFetch<{ message: string }>(
    `/api/split-rooms/${roomId}/reminders/discussed`,
    { method: "POST" },
  );
  clearApiCache("dues");
  return response;
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

export async function getFriendActivity(friendId: string) {
  return cachedApiRequest(`friends:activity:${friendId}`, 10_000, () =>
    apiFetch<FriendActivityResponse>(`/api/friends/${friendId}/activity`),
  );
}

export async function searchGlobalPeople(query: string) {
  const searchParams = new URLSearchParams({ query });

  return apiFetch<{ people: GlobalPerson[] }>(
    `/api/friends/people?${searchParams.toString()}`,
  );
}

export async function sendSplitVerseInvite(email: string) {
  return apiFetch<{ message: string; emailStatus: string }>(
    "/api/friends/invites",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export async function sendFriendRequest(
  identifier: string,
  recipientUserId?: string,
) {
  const response = await apiFetch<{ message: string; request: FriendRequest }>(
    "/api/friends/requests",
    {
      method: "POST",
      body: JSON.stringify({
        identifier,
        recipientUserId,
      }),
    },
  );
  clearApiCache("friends");
  return response;
}

export async function deleteFriendRequest(requestId: string) {
  const response = await apiFetch<{ message: string }>(
    `/api/friends/requests/${requestId}`,
    { method: "DELETE" },
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

export type BlockedUser = Friend & { blocked_at?: string };

export async function getBlockedUsers() {
  return apiFetch<{ blockedUsers: BlockedUser[] }>("/api/friends/blocked");
}

export async function blockFriend(friendId: string) {
  const response = await apiFetch<{ message: string; blockedUser: BlockedUser }>(
    `/api/friends/${friendId}/block`,
    { method: "POST" },
  );
  clearApiCache("friends");
  return response;
}

export async function unblockUser(userId: string) {
  const response = await apiFetch<{ message: string }>(
    `/api/friends/blocked/${userId}`,
    { method: "DELETE" },
  );
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
  month?: number | string;
  friendId?: string;
  roomId?: string;
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

  if (params?.month) {
    searchParams.set("month", String(params.month));
  }

  if (params?.friendId) {
    searchParams.set("friendId", params.friendId);
  }

  if (params?.roomId) {
    searchParams.set("roomId", params.roomId);
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

export type ProfileIdentityField = "name" | "email";

export type ProfileIdentityChangeRequest = {
  requestId: string;
  field: ProfileIdentityField;
  currentEmailHint: string;
  expiresAt: string;
  message: string;
};

export async function requestProfileIdentityChange(
  field: ProfileIdentityField,
  value: string,
) {
  return apiFetch<ProfileIdentityChangeRequest>(
    "/api/auth/profile/identity-change/request",
    {
      method: "POST",
      body: JSON.stringify({ field, value }),
    },
  );
}

export async function confirmProfileIdentityChange(
  requestId: string,
  otp: string,
) {
  const response = await apiFetch<{
    message: string;
    field: ProfileIdentityField;
    user: DbUser;
  }>("/api/auth/profile/identity-change/confirm", {
    method: "POST",
    body: JSON.stringify({ requestId, otp }),
  });

  clearApiCache("profile");
  cacheProfileDisplay(response.user);
  clearCachedAuthToken();
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
  username?: string;
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
