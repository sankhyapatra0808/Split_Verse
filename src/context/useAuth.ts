import { createContext, useContext } from "react";
import type { User } from "firebase/auth";

import type { DbUser, EmailLoginOtpSession } from "../lib/api";

export type SocialProvider = "google";

export type AuthContextValue = {
  user: User | null;
  dbUser: DbUser | null;
  loading: boolean;
  loginWithEmail: (
    email: string,
    password: string,
    remember?: boolean
  ) => Promise<void>;
  startEmailLoginOtp: (
    email: string,
    password: string,
    remember?: boolean
  ) => Promise<EmailLoginOtpSession>;
  completeEmailLoginWithOtp: (
    email: string,
    password: string,
    remember: boolean,
    sessionId: string,
    otp: string
  ) => Promise<void>;
  signupWithEmail: (
    name: string,
    email: string,
    password: string
  ) => Promise<void>;
  loginWithProvider: (
    provider: SocialProvider,
    remember?: boolean
  ) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshDbUser: () => Promise<DbUser | null>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
