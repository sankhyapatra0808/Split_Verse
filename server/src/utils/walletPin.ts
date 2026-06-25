import argon2 from "argon2";
import type { PoolClient } from "pg";

export class WalletPinError extends Error {
  statusCode: number;
  attemptsRemaining?: number;
  lockedUntil?: string;

  constructor(
    message: string,
    statusCode = 400,
    options: { attemptsRemaining?: number; lockedUntil?: string } = {},
  ) {
    super(message);
    this.name = "WalletPinError";
    this.statusCode = statusCode;
    this.attemptsRemaining = options.attemptsRemaining;
    this.lockedUntil = options.lockedUntil;
  }
}

const walletPinMaxFailedAttempts = Number(
  process.env.WALLET_PIN_MAX_FAILED_ATTEMPTS || 5,
);
const walletPinLockMs = Number(process.env.WALLET_PIN_LOCK_MS || 15 * 60 * 1000);

export function normalizeWalletPin(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function assertWalletPinShape(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new WalletPinError("Enter your 4 to 6 digit wallet PIN", 400);
  }
}

export async function verifyWalletPinForUser(
  client: PoolClient,
  userId: string,
  rawPin: unknown,
) {
  const pin = normalizeWalletPin(rawPin);
  assertWalletPinShape(pin);

  const userResult = await client.query<{
    id: string;
    wallet_pin_hash: string | null;
    wallet_pin_failed_attempts: number;
    wallet_pin_locked_until: Date | string | null;
  }>(
    `
    SELECT
      id,
      wallet_pin_hash,
      wallet_pin_failed_attempts,
      wallet_pin_locked_until
    FROM users
    WHERE id = $1
    FOR UPDATE;
    `,
    [userId],
  );

  const user = userResult.rows[0];

  if (!user) {
    throw new WalletPinError("User not found", 404);
  }

  if (!user.wallet_pin_hash) {
    throw new WalletPinError("Set a wallet PIN before paying from wallet", 400);
  }

  const lockedUntil = user.wallet_pin_locked_until
    ? new Date(user.wallet_pin_locked_until).getTime()
    : 0;

  if (lockedUntil > Date.now()) {
    throw new WalletPinError(
      "Wallet PIN is temporarily locked. Try again later.",
      423,
      { lockedUntil: new Date(lockedUntil).toISOString() },
    );
  }

  const matches = await argon2.verify(user.wallet_pin_hash, pin);

  if (!matches) {
    const nextAttempts = Number(user.wallet_pin_failed_attempts || 0) + 1;
    const shouldLock = nextAttempts >= walletPinMaxFailedAttempts;
    const lockedUntilValue = shouldLock
      ? new Date(Date.now() + walletPinLockMs)
      : null;

    await client.query(
      `
      UPDATE users
      SET
        wallet_pin_failed_attempts = $2,
        wallet_pin_locked_until = $3,
        updated_at = NOW()
      WHERE id = $1;
      `,
      [user.id, nextAttempts, lockedUntilValue],
    );

    throw new WalletPinError(
      shouldLock
        ? "Too many wrong wallet PIN attempts. Wallet PIN is temporarily locked."
        : "Incorrect wallet PIN",
      shouldLock ? 423 : 401,
      {
        attemptsRemaining: Math.max(walletPinMaxFailedAttempts - nextAttempts, 0),
        lockedUntil: lockedUntilValue?.toISOString(),
      },
    );
  }

  await client.query(
    `
    UPDATE users
    SET
      wallet_pin_failed_attempts = 0,
      wallet_pin_locked_until = NULL,
      updated_at = NOW()
    WHERE id = $1;
    `,
    [user.id],
  );

  return true;
}

export function sendWalletPinError(res: { status: (code: number) => { json: (body: unknown) => unknown } }, error: unknown) {
  if (!(error instanceof WalletPinError)) {
    return false;
  }

  res.status(error.statusCode).json({
    message: error.message,
    attemptsRemaining: error.attemptsRemaining,
    lockedUntil: error.lockedUntil,
  });

  return true;
}
