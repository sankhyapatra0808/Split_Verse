-- Durable email/password login OTP challenges.
-- Passwords and plaintext OTPs are never stored in this table.

CREATE TABLE IF NOT EXISTS email_login_otp_sessions (
  id UUID PRIMARY KEY,
  firebase_uid TEXT NOT NULL,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  resend_count INTEGER NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_login_otp_sessions_uid_created_idx
  ON email_login_otp_sessions (firebase_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS email_login_otp_sessions_active_idx
  ON email_login_otp_sessions (id, consumed_at, expires_at);

CREATE INDEX IF NOT EXISTS email_login_otp_sessions_cleanup_idx
  ON email_login_otp_sessions (expires_at);
