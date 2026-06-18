import { initializeApp, getApp, getApps } from "firebase/app";
import {
  FacebookAuthProvider,
  getAuth,
  GoogleAuthProvider,
  TwitterAuthProvider,
} from "firebase/auth";

const requiredFirebaseEnv = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(requiredFirebaseEnv).every(
  (value) => value && !value.startsWith("your_")
);

const firebaseConfig = {
  apiKey: requiredFirebaseEnv.apiKey || "demo_firebase_api_key",
  authDomain: requiredFirebaseEnv.authDomain || "demo-project.firebaseapp.com",
  projectId: requiredFirebaseEnv.projectId || "demo-project",
  storageBucket: requiredFirebaseEnv.storageBucket || "demo-project.appspot.com",
  messagingSenderId: requiredFirebaseEnv.messagingSenderId || "000000000000",
  appId: requiredFirebaseEnv.appId || "1:000000000000:web:0000000000000000000000",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();
export const twitterProvider = new TwitterAuthProvider();

export default app;
