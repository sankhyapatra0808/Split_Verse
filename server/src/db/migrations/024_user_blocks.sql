CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_blocks_distinct_users CHECK (blocker_user_id <> blocked_user_id),
  CONSTRAINT user_blocks_unique_pair UNIQUE (blocker_user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_created_idx
  ON user_blocks (blocker_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx
  ON user_blocks (blocked_user_id);
