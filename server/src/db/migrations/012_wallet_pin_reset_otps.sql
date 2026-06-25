-- Wallet PIN reset OTPs for safe forgot-PIN recovery.
-- OTP values are stored only as HMAC hashes and consumed after one successful reset.

CREATE TABLE IF NOT EXISTS wallet_pin_reset_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_pin_reset_otps_user_active_idx
  ON wallet_pin_reset_otps (user_id, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS wallet_pin_reset_otps_cleanup_idx
  ON wallet_pin_reset_otps (expires_at);
