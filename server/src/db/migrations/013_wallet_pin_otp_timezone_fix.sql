-- Store wallet PIN reset OTP timestamps as real instants, not timezone-less values.
-- This prevents OTPs from appearing expired immediately on machines in a different timezone.

ALTER TABLE wallet_pin_reset_otps
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC',
  ALTER COLUMN consumed_at TYPE TIMESTAMPTZ USING consumed_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

UPDATE wallet_pin_reset_otps
SET consumed_at = NOW()
WHERE consumed_at IS NULL
AND expires_at <= NOW();
