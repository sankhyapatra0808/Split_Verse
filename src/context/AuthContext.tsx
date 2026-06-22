import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  auth,
  facebookProvider,
  googleProvider,
  isFirebaseConfigured,
  twitterProvider,
} from "../config/firebase";

import {
  getCurrentDbUser,
  requestEmailLoginOtp,
  syncCurrentUser,
  verifyEmailLoginOtp,
  type DbUser,
} from "../lib/api";
import {
  AuthContext,
  type AuthContextValue,
} from "./useAuth";

export type { SocialProvider } from "./useAuth";

const socialProviders = {
  google: googleProvider,
  facebook: facebookProvider,
  twitter: twitterProvider,
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
      String(Date.now() + rememberedSessionDurationMs)
    );
    return;
  }

  window.localStorage.removeItem(rememberedSessionExpiryKey);
}

function isRememberedSessionExpired() {
  const expiresAt = Number(
    window.localStorage.getItem(rememberedSessionExpiryKey) || 0
  );

  return expiresAt > 0 && Date.now() > expiresAt;
}

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && isRememberedSessionExpired()) {
        window.localStorage.removeItem(rememberedSessionExpiryKey);
        setUser(null);
        setDbUser(null);
        await signOut(auth);
        setLoading(false);
        return;
      }

      setUser(currentUser);

      if (!currentUser) {
        setDbUser(null);
        setLoading(false);
        return;
      }

      try {
        const response = await getCurrentDbUser();
        setDbUser(response.user);
      } catch (error) {
        console.error("Failed to load database user:", error);
        setDbUser(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      dbUser,
      loading,

      async loginWithEmail(email, password, remember = true) {
        assertFirebaseConfigured();

        await setPersistence(
          auth,
          remember ? browserLocalPersistence : browserSessionPersistence
        );

        await signInWithEmailAndPassword(auth, email, password);
        setRememberedSession(remember);

        const response = await syncCurrentUser();
        setDbUser(response.user);
      },

      async startEmailLoginOtp(email, password, remember = true) {
        assertFirebaseConfigured();

        await setPersistence(
          auth,
          remember ? browserLocalPersistence : browserSessionPersistence
        );

        let signedInForOtp = false;

        try {
          await signInWithEmailAndPassword(auth, email, password);
          signedInForOtp = true;

          return await requestEmailLoginOtp();
        } finally {
          if (signedInForOtp) {
            window.localStorage.removeItem(rememberedSessionExpiryKey);
            setUser(null);
            setDbUser(null);
            await signOut(auth);
          }
        }
      },

      async completeEmailLoginWithOtp(
        email,
        password,
        remember,
        sessionId,
        otp,
      ) {
        assertFirebaseConfigured();

        await verifyEmailLoginOtp(sessionId, otp);

        await setPersistence(
          auth,
          remember ? browserLocalPersistence : browserSessionPersistence
        );

        await signInWithEmailAndPassword(auth, email, password);
        setRememberedSession(remember);

        const response = await syncCurrentUser();
        setDbUser(response.user);
      },

      async signupWithEmail(name, email, password) {
        assertFirebaseConfigured();

        await setPersistence(auth, browserLocalPersistence);

        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        if (credential.user && name.trim()) {
          await updateProfile(credential.user, {
            displayName: name.trim(),
          });

          await credential.user.getIdToken(true);
        }

        const response = await syncCurrentUser();
        setRememberedSession(true);
        setDbUser(response.user);
      },

      async loginWithProvider(provider, remember = true) {
        assertFirebaseConfigured();

        await setPersistence(
          auth,
          remember ? browserLocalPersistence : browserSessionPersistence
        );

        await signInWithPopup(auth, socialProviders[provider]);
        setRememberedSession(remember);

        const response = await syncCurrentUser();
        setDbUser(response.user);
      },

      async resetPassword(email) {
        assertFirebaseConfigured();
        await sendPasswordResetEmail(auth, email);
      },

      async logout() {
        window.localStorage.removeItem(rememberedSessionExpiryKey);
        setDbUser(null);
        await signOut(auth);
      },
    }),
    [user, dbUser, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
