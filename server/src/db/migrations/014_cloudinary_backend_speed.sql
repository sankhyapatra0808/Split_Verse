-- Move production-only setup out of request handlers and improve lookup speed.
-- Run with: npm run db:migrate

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Keep table creation in migrations so normal /api/friends and /api/split-rooms requests do not perform DDL.
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

CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_unique_pending_idx
  ON friend_requests (requester_user_id, LOWER(recipient_email))
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_one_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_two_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT friendships_distinct_users CHECK (user_one_id <> user_two_id),
  CONSTRAINT friendships_unique_pair UNIQUE (user_one_id, user_two_id)
);

CREATE TABLE IF NOT EXISTS split_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  payment_status TEXT NOT NULL DEFAULT 'no_one_paid',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE split_rooms
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'no_one_paid';

CREATE TABLE IF NOT EXISTS split_room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES split_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS split_room_members_room_email_idx
  ON split_room_members (room_id, LOWER(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS split_room_members_room_user_idx
  ON split_room_members (room_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS split_room_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES split_rooms(id) ON DELETE CASCADE,
  assigned_member_id UUID NOT NULL REFERENCES split_room_members(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  collected_at TIMESTAMP,
  expense_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE split_room_items
  ADD COLUMN IF NOT EXISTS collected_at TIMESTAMP;

ALTER TABLE split_room_items
  ADD COLUMN IF NOT EXISTS expense_id UUID;

-- Faster auth/profile lookups.
CREATE INDEX IF NOT EXISTS users_firebase_uid_idx ON users (firebase_uid);
CREATE INDEX IF NOT EXISTS users_lower_email_idx ON users (LOWER(email));

-- Faster friends page and notification lookups.
CREATE INDEX IF NOT EXISTS friend_requests_recipient_status_idx
  ON friend_requests (LOWER(recipient_email), status, created_at DESC);

CREATE INDEX IF NOT EXISTS friend_requests_requester_status_idx
  ON friend_requests (requester_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS friendships_user_one_created_idx
  ON friendships (user_one_id, created_at DESC);

CREATE INDEX IF NOT EXISTS friendships_user_two_created_idx
  ON friendships (user_two_id, created_at DESC);

-- Faster split rooms and dues lookups.
CREATE INDEX IF NOT EXISTS split_rooms_owner_created_idx
  ON split_rooms (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS split_room_members_user_room_idx
  ON split_room_members (user_id, room_id);

CREATE INDEX IF NOT EXISTS split_room_members_lower_email_room_idx
  ON split_room_members (LOWER(email), room_id)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS split_room_items_room_created_idx
  ON split_room_items (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS split_room_items_assigned_pending_idx
  ON split_room_items (assigned_member_id, collected_at)
  WHERE collected_at IS NULL;

-- Faster wallet and transactions.
CREATE INDEX IF NOT EXISTS wallet_transactions_user_created_idx
  ON wallet_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS expenses_user_created_idx
  ON expenses (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS expenses_user_date_idx
  ON expenses (user_id, expense_date DESC);
