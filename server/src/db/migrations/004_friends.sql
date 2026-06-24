CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP
);

ALTER TABLE friend_requests
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_unique_pending_idx
  ON friend_requests (requester_user_id, LOWER(recipient_email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS friend_requests_recipient_status_created_idx
  ON friend_requests (LOWER(recipient_email), status, created_at DESC);

CREATE INDEX IF NOT EXISTS friend_requests_requester_created_idx
  ON friend_requests (requester_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_one_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_two_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT friendships_distinct_users CHECK (user_one_id <> user_two_id),
  CONSTRAINT friendships_unique_pair UNIQUE (user_one_id, user_two_id)
);

CREATE INDEX IF NOT EXISTS friendships_user_one_idx
  ON friendships (user_one_id);

CREATE INDEX IF NOT EXISTS friendships_user_two_idx
  ON friendships (user_two_id);
