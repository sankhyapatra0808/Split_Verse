CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS profile_identity_change_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('name', 'email')),
  pending_value TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  resend_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  last_sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profile_identity_change_otps_user_created_idx
  ON profile_identity_change_otps (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_identity_change_otps_active_idx
  ON profile_identity_change_otps (user_id, change_type, expires_at DESC)
  WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION prevent_splitverse_username_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.username IS DISTINCT FROM NEW.username THEN
    RAISE EXCEPTION 'SplitVerse usernames are permanent and cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_prevent_username_change ON users;

CREATE TRIGGER users_prevent_username_change
BEFORE UPDATE OF username ON users
FOR EACH ROW
EXECUTE FUNCTION prevent_splitverse_username_change();

UPDATE public_pages
SET
  content = jsonb_set(
    COALESCE(content, '{}'::jsonb),
    '{sections}',
    COALESCE(content->'sections', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'heading', 'Permanent username and account identity',
        'body', 'You choose a unique SplitVerse username during signup. Usernames are case-insensitive, cannot be transferred, and cannot be changed after the account is created. Changes to your account name or registered email require a one-time verification code sent to your current registered email address.'
      )
    ),
    TRUE
  ),
  updated_at = NOW()
WHERE slug = 'terms';
