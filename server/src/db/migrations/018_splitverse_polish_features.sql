CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE split_rooms
  ADD COLUMN IF NOT EXISTS paid_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE split_rooms
SET paid_by_user_id = owner_user_id
WHERE paid_by_user_id IS NULL;

ALTER TABLE split_rooms
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS finalized_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

CREATE INDEX IF NOT EXISTS split_rooms_paid_by_idx
  ON split_rooms (paid_by_user_id, created_at DESC)
  WHERE paid_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS split_rooms_archived_idx
  ON split_rooms (archived_at, created_at DESC);

CREATE TABLE IF NOT EXISTS split_room_reminder_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES split_rooms(id) ON DELETE CASCADE,
  muted_until TIMESTAMP,
  muted_at TIMESTAMP,
  marked_discussed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT split_room_reminder_preferences_unique UNIQUE (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS split_room_reminder_preferences_user_room_idx
  ON split_room_reminder_preferences (user_id, room_id);
