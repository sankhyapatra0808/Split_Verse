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


export async function getCurrentDbUser() {
  return apiFetch<{ user: DbUser }>("/api/auth/me");
}
