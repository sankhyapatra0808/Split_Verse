ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS avatar_mode TEXT NOT NULL DEFAULT 'photo';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_avatar_mode_check;

ALTER TABLE users
  ADD CONSTRAINT users_avatar_mode_check
  CHECK (avatar_mode IN ('photo', 'initials'));

CREATE INDEX IF NOT EXISTS users_avatar_mode_idx
  ON users (avatar_mode);
