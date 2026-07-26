import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  setPersistence,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  auth,
  googleProvider,
  isFirebaseConfigured,
} from "../config/firebase";
import {
  clearCachedAuthToken,
  getCurrentDbUser,
  requestEmailLoginOtp,
  resendEmailLoginOtp as resendEmailLoginOtpApi,
  syncCurrentUser,
  verifyEmailLoginOtp,
  type DbUser,
} from "../lib/api";
import { AuthContext, type AuthContextValue } from "./useAuth";

export type { SocialProvider } from "./useAuth";

const socialProviders = {
  google: googleProvider,
};

const firebaseSetupError =
  "Firebase is not configured yet. Add your VITE_FIREBASE_* values to a local .env file and restart the dev server.";
const rememberedSessionExpiryKey = "splitverse-remembered-session-expires-at";
const rememberedSessionDurationMs = 15 * 24 * 60 * 60 * 1000;

function assertFirebaseConfigured() {
  if (!isFirebaseConfigured) {
    throw new Error(firebaseSetupError);
  }
}

function setRememberedSession(remember: boolean) {
  if (remember) {
    window.localStorage.setItem(
      rememberedSessionExpiryKey,
      String(Date.now() + rememberedSessionDurationMs),
    );
    return;
  }

  window.localStorage.removeItem(rememberedSessionExpiryKey);
}

function clearRememberedSession() {
  window.localStorage.removeItem(rememberedSessionExpiryKey);
}

function isRememberedSessionExpired() {
  const rawExpiresAt = window.localStorage.getItem(
    rememberedSessionExpiryKey,
  );

  if (!rawExpiresAt) return false;

  const expiresAt = Number(rawExpiresAt);

  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    clearRememberedSession();
    return true;
  }

  return Date.now() > expiresAt;
}

async function hasAuthorizedClientSession(user: User) {
  const tokenResult = await user.getIdTokenResult();
  const provider = String(tokenResult.signInProvider || "");

  if (provider === "password") return false;

  if (provider === "custom") {
    return tokenResult.claims.splitverseOtpVerified === true;
  }

  return Boolean(provider);
}

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [loading, setLoading] = useState(true);
  const credentialBootstrapInProgress = useRef(false);

  const refreshDbUser = useCallback(async () => {
    if (!auth.currentUser) {
      setDbUser(null);
      return null;
    }

    try {
      const response = await getCurrentDbUser();
      setDbUser(response.user);
      return response.user;
    } catch {
      clearCachedAuthToken();
      const synced = await syncCurrentUser();
      setDbUser(synced.user);
      return synced.user;
    }
  }, []);

  const syncSignedInUser = useCallback(async () => {
    clearCachedAuthToken();
    const response = await syncCurrentUser();
    setDbUser(response.user);
    return response.user;
  }, []);

  const logout = useCallback(async () => {
    clearRememberedSession();
    clearCachedAuthToken();
    setUser(null);
    setDbUser(null);
    await signOut(auth);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      clearCachedAuthToken();

      if (!currentUser) {
        setUser(null);
        setDbUser(null);
        setLoading(false);
        return;
      }

      if (credentialBootstrapInProgress.current) {
        // Email signup briefly creates a password-provider Firebase session.
        // It is used only to create/sync the account and is never exposed as an
        // authenticated SplitVerse session.
        setUser(null);
        setDbUser(null);
        setLoading(false);
        return;
      }

      try {
        const authorized = await hasAuthorizedClientSession(currentUser);

        if (!authorized || isRememberedSessionExpired()) {
          clearRememberedSession();
          await signOut(auth);
          setUser(null);
          setDbUser(null);
          return;
        }

        setUser(currentUser);
        await refreshDbUser();
      } catch (error) {
        console.error("Failed to load database user:", error);
        setUser(null);
        setDbUser(null);
        clearRememberedSession();
        await signOut(auth).catch(() => undefined);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [refreshDbUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      dbUser,
      loading,

      async startEmailLoginOtp(identifier, password) {
        assertFirebaseConfigured();
        return requestEmailLoginOtp(identifier.trim().toLowerCase(), password);
      },

      async resendEmailLoginOtp(sessionId) {
        return resendEmailLoginOtpApi(sessionId);
      },

      async completeEmailLoginWithOtp(remember, sessionId, otp) {
        assertFirebaseConfigured();

        const response = await verifyEmailLoginOtp(sessionId, otp);

        await setPersistence(
          auth,
          remember ? browserLocalPersistence : browserSessionPersistence,
        );
        clearCachedAuthToken();
        await signInWithCustomToken(auth, response.customToken);
        setRememberedSession(remember);
        await syncSignedInUser();
      },

      async signupWithEmail(name, email, password, username) {
        assertFirebaseConfigured();
        credentialBootstrapInProgress.current = true;
        let createdUser: User | null = null;

        try {
          const normalizedEmail = email.trim().toLowerCase();

          await setPersistence(auth, browserSessionPersistence);

          const credential = await createUserWithEmailAndPassword(
            auth,
            normalizedEmail,
            password,
          );
          createdUser = credential.user;

          if (name.trim()) {
            await updateProfile(credential.user, {
              displayName: name.trim(),
            });
            await credential.user.getIdToken(true);
          }

          clearCachedAuthToken();
          await syncCurrentUser({ username });

          return await requestEmailLoginOtp(normalizedEmail, password);
        } catch (error) {
          if (createdUser) {
            await deleteUser(createdUser).catch(() => undefined);
          }
          throw error;
        } finally {
          clearRememberedSession();
          clearCachedAuthToken();
          setUser(null);
          setDbUser(null);
          await signOut(auth).catch(() => undefined);
          credentialBootstrapInProgress.current = false;
        }
      },

      async loginWithProvider(provider, remember = true, signupUsername) {
        assertFirebaseConfigured();
        credentialBootstrapInProgress.current = true;

        try {
          await setPersistence(
            auth,
            remember ? browserLocalPersistence : browserSessionPersistence,
          );

          clearCachedAuthToken();
          const credential = await signInWithPopup(
            auth,
            socialProviders[provider],
          );
          const response = await syncCurrentUser(
            signupUsername
              ? { username: signupUsername, requireUsername: true }
              : {
                  requireUsername: false,
                  deferUsernameSetup: true,
                },
          );

          setUser(credential.user);
          setDbUser(response.user);
          setRememberedSession(remember);
        } catch (error) {
          clearRememberedSession();
          clearCachedAuthToken();
          setUser(null);
          setDbUser(null);
          await signOut(auth).catch(() => undefined);
          throw error;
        } finally {
          credentialBootstrapInProgress.current = false;
        }
      },

      refreshDbUser,
      logout,
    }),
    [user, dbUser, loading, refreshDbUser, syncSignedInUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
