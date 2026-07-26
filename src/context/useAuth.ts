import { createContext, useContext } from "react";
import type { User } from "firebase/auth";

import type { DbUser, EmailLoginOtpSession } from "../lib/api";

export type SocialProvider = "google";

export type AuthContextValue = {
  user: User | null;
  dbUser: DbUser | null;
  loading: boolean;
  startEmailLoginOtp: (
    email: string,
    password: string,
    remember?: boolean,
  ) => Promise<EmailLoginOtpSession>;
  resendEmailLoginOtp: (
    sessionId: string,
  ) => Promise<EmailLoginOtpSession>;
  completeEmailLoginWithOtp: (
    remember: boolean,
    sessionId: string,
    otp: string,
  ) => Promise<void>;
  signupWithEmail: (
    name: string,
    email: string,
    password: string,
    username: string,
  ) => Promise<EmailLoginOtpSession>;
  loginWithProvider: (
    provider: SocialProvider,
    remember?: boolean,
    signupUsername?: string,
  ) => Promise<void>;
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
