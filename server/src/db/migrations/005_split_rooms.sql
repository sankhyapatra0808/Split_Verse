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

ALTER TABLE split_rooms
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS split_rooms_owner_created_idx
  ON split_rooms (owner_user_id, created_at DESC);

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

CREATE INDEX IF NOT EXISTS split_room_members_room_created_idx
  ON split_room_members (room_id, created_at ASC);

CREATE INDEX IF NOT EXISTS split_room_members_user_room_idx
  ON split_room_members (user_id, room_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS split_room_members_lower_email_room_idx
  ON split_room_members (LOWER(email), room_id)
  WHERE email IS NOT NULL;

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

CREATE INDEX IF NOT EXISTS split_room_items_room_created_idx
  ON split_room_items (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS split_room_items_room_assigned_collected_idx
  ON split_room_items (room_id, assigned_member_id, collected_at);

CREATE INDEX IF NOT EXISTS split_room_items_assigned_collected_idx
  ON split_room_items (assigned_member_id, collected_at);

CREATE INDEX IF NOT EXISTS split_room_items_expense_id_idx
  ON split_room_items (expense_id)
  WHERE expense_id IS NOT NULL;
