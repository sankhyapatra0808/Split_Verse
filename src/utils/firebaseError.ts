import { FirebaseError } from "firebase/app";

const firebaseErrorMessages: Record<string, string> = {
  "auth/account-exists-with-different-credential":
    "An account already exists with this email using a different login method.",
  "auth/email-already-in-use": "This email is already registered. Please log in instead.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/missing-password": "Please enter your password.",
  "auth/network-request-failed": "Network error. Please check your internet connection.",
  "auth/popup-closed-by-user": "Login popup was closed before completion.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
  "auth/user-not-found": "No account found with this email.",
  "auth/weak-password": "Password should be at least 6 characters.",
  "auth/wrong-password": "Invalid email or password.",
};

export function getFirebaseErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    return firebaseErrorMessages[error.code] ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
