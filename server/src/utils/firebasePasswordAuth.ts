export type FirebasePasswordCredential = {
  uid: string;
  email: string;
};

type IdentityToolkitResponse = {
  localId?: string;
  email?: string;
  error?: {
    message?: string;
  };
};

const identityToolkitBaseUrl =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";
const passwordAuthTimeoutMs = Number(
  process.env.FIREBASE_PASSWORD_AUTH_TIMEOUT_MS || 8000,
);

function makeHttpError(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code });
}

export async function verifyFirebaseEmailPassword(
  email: string,
  password: string,
): Promise<FirebasePasswordCredential> {
  const apiKey = process.env.FIREBASE_WEB_API_KEY?.trim();

  if (!apiKey) {
    throw makeHttpError(
      "Email login is temporarily unavailable.",
      503,
      "FIREBASE_PASSWORD_AUTH_NOT_CONFIGURED",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), passwordAuthTimeoutMs);

  try {
    const response = await fetch(
      `${identityToolkitBaseUrl}?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
        signal: controller.signal,
      },
    );

    const data = (await response
      .json()
      .catch(() => ({}))) as IdentityToolkitResponse;

    if (!response.ok) {
      const providerCode = String(data.error?.message || "").toUpperCase();
      const invalidCredential = [
        "INVALID_LOGIN_CREDENTIALS",
        "INVALID_PASSWORD",
        "EMAIL_NOT_FOUND",
        "USER_DISABLED",
      ].includes(providerCode);

      if (invalidCredential) {
        throw makeHttpError(
          "Incorrect email or password.",
          401,
          "INVALID_LOGIN_CREDENTIALS",
        );
      }

      if (providerCode === "TOO_MANY_ATTEMPTS_TRY_LATER") {
        throw makeHttpError(
          "Too many sign-in attempts. Please try again later.",
          429,
          "LOGIN_RATE_LIMITED",
        );
      }

      throw makeHttpError(
        "Email login is temporarily unavailable.",
        503,
        "FIREBASE_PASSWORD_AUTH_FAILED",
      );
    }

    const uid = String(data.localId || "").trim();
    const verifiedEmail = String(data.email || email)
      .trim()
      .toLowerCase();

    if (!uid || !verifiedEmail) {
      throw makeHttpError(
        "Email login is temporarily unavailable.",
        503,
        "FIREBASE_PASSWORD_AUTH_INVALID_RESPONSE",
      );
    }

    return { uid, email: verifiedEmail };
  } catch (error) {
    if (typeof error === "object" && error !== null && "statusCode" in error) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw makeHttpError(
        "Email login timed out. Please try again.",
        504,
        "FIREBASE_PASSWORD_AUTH_TIMEOUT",
      );
    }

    throw makeHttpError(
      "Email login is temporarily unavailable.",
      503,
      "FIREBASE_PASSWORD_AUTH_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timeout);
  }
}
