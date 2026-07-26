import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";

import { useAuth } from "../context/useAuth";
import { checkUsernameAvailability, saveWalletPin } from "../lib/api";
import { withTopProgress } from "../utils/topProgress";

function normalizePin(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function getPinStrengthError(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) {
    return "Wallet PIN must be 4 to 6 digits.";
  }

  if (/^(\d)\1+$/.test(pin)) {
    return "Use a stronger PIN. Repeated digits are too easy to guess.";
  }

  const commonPins = new Set([
    "0000",
    "1111",
    "2222",
    "3333",
    "4444",
    "5555",
    "6666",
    "7777",
    "8888",
    "9999",
    "1234",
    "4321",
    "12345",
    "54321",
    "123456",
    "654321",
    "1122",
    "1212",
    "2580",
  ]);

  if (commonPins.has(pin)) {
    return "Use a stronger PIN. This PIN is too common.";
  }

  const digits = pin.split("").map(Number);
  const increasing = digits.every(
    (digit, index) => index === 0 || digit === digits[index - 1] + 1,
  );
  const decreasing = digits.every(
    (digit, index) => index === 0 || digit === digits[index - 1] - 1,
  );

  if (increasing || decreasing) {
    return "Use a stronger PIN. Sequential digits are too easy to guess.";
  }

  return "";
}

export default function MandatoryWalletPinSetup() {
  const { dbUser, refreshDbUser } = useAuth();
  const needsGoogleUsername = Boolean(
    !dbUser?.username &&
      ["google", "google.com"].includes(String(dbUser?.provider || "")),
  );
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function normalizeUsername(value: string) {
    return value.trim().toLowerCase().replace(/^@+/, "");
  }

  async function ensureUsernameAvailable() {
    const normalizedUsername = normalizeUsername(username);

    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      setUsernameStatus("idle");
      setError(
        "Username must be 3 to 30 characters using lowercase letters, numbers, or underscores.",
      );
      return null;
    }

    try {
      setUsernameStatus("checking");
      const result = await checkUsernameAvailability(normalizedUsername);
      setUsernameStatus(result.available ? "available" : "taken");

      if (!result.available) {
        setError("That username is already taken. Choose another one.");
        return null;
      }

      return result.username;
    } catch (availabilityError) {
      setUsernameStatus("idle");
      setError(
        availabilityError instanceof Error
          ? availabilityError.message
          : "Could not check username availability.",
      );
      return null;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const permanentUsername = needsGoogleUsername
      ? await ensureUsernameAvailable()
      : null;

    if (needsGoogleUsername && !permanentUsername) {
      return;
    }

    const strengthError = getPinStrengthError(pin);

    if (strengthError) {
      setError(strengthError);
      return;
    }

    if (pin !== confirmPin) {
      setError("Wallet PIN confirmation does not match.");
      return;
    }

    try {
      setSaving(true);
      await withTopProgress(() =>
        saveWalletPin({
          pin,
          ...(permanentUsername ? { username: permanentUsername } : {}),
        }),
      );
      await refreshDbUser();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not set wallet PIN.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mandatory-wallet-pin-screen">
      <form className="mandatory-wallet-pin-card" onSubmit={handleSubmit}>
        <div className="mandatory-wallet-pin-icon">
          <ShieldCheck size={26} />
        </div>

        <span>Security setup required</span>
        <h1>
          {needsGoogleUsername
            ? "Choose your username and wallet PIN"
            : "Set your wallet PIN"}
        </h1>
        <p>
          {needsGoogleUsername
            ? "Choose your permanent public username, then create a private 4 to 6 digit PIN. Your username cannot be changed later."
            : "Before opening SplitVerse, create a private 4 to 6 digit PIN. This PIN protects wallet payments and split-room dues."}
        </p>

        {needsGoogleUsername ? (
          <label>
            <span>Permanent username</span>
            <input
              className="mandatory-wallet-pin-username"
              type="text"
              autoFocus
              autoComplete="username"
              spellCheck={false}
              maxLength={30}
              placeholder="your_username"
              value={username}
              disabled={saving}
              onBlur={() => {
                if (username.trim()) {
                  void ensureUsernameAvailable();
                }
              }}
              onChange={(event) => {
                setUsername(event.target.value.toLowerCase());
                setUsernameStatus("idle");
                setError("");
              }}
            />
            <small
              className={`mandatory-wallet-pin-username-note username-${usernameStatus}`}
              aria-live="polite"
            >
              {usernameStatus === "checking"
                ? "Checking availability..."
                : usernameStatus === "available"
                  ? "Username is available and will become permanent."
                  : usernameStatus === "taken"
                    ? "That username is already in use."
                    : "Use lowercase letters, numbers, or underscores."}
            </small>
          </label>
        ) : null}

        <label>
          <span>New wallet PIN</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoFocus={!needsGoogleUsername}
            value={pin}
            disabled={saving}
            onChange={(event) => setPin(normalizePin(event.target.value))}
          />
        </label>

        <label>
          <span>Confirm wallet PIN</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmPin}
            disabled={saving}
            onChange={(event) =>
              setConfirmPin(normalizePin(event.target.value))
            }
          />
        </label>

        {error && <p className="mandatory-wallet-pin-error">{error}</p>}

        <button type="submit" disabled={saving}>
          {saving
            ? "Completing setup"
            : needsGoogleUsername
              ? "Complete setup"
              : "Set wallet PIN"}
        </button>

        <small>
          {needsGoogleUsername
            ? "This window cannot be closed until your permanent username and wallet PIN are set. Your PIN is stored only as a secure hash."
            : "This window cannot be closed until the PIN is set. Your PIN is stored only as a secure hash."}
        </small>
      </form>
    </div>
  );
}
