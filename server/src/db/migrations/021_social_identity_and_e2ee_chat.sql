CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username TEXT;

DO $$
DECLARE
  user_row RECORD;
  base_username TEXT;
  candidate TEXT;
  suffix_index INTEGER;
BEGIN
  FOR user_row IN
    SELECT id, email
    FROM users
    WHERE username IS NULL OR BTRIM(username) = ''
    ORDER BY created_at, id
  LOOP
    base_username := LOWER(REGEXP_REPLACE(SPLIT_PART(user_row.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'));

    IF LENGTH(base_username) < 3 THEN
      base_username := 'user_' || SUBSTRING(REPLACE(user_row.id::text, '-', '') FROM 1 FOR 8);
    END IF;

    base_username := LEFT(base_username, 24);
    candidate := base_username;
    suffix_index := 0;

    WHILE EXISTS (
      SELECT 1
      FROM users
      WHERE LOWER(username) = LOWER(candidate)
      AND id <> user_row.id
    ) LOOP
      suffix_index := suffix_index + 1;
      candidate := LEFT(base_username, GREATEST(3, 29 - LENGTH(suffix_index::text))) || '_' || suffix_index::text;
    END LOOP;

    UPDATE users
    SET username = candidate
    WHERE id = user_row.id;
  END LOOP;
END $$;

ALTER TABLE users
  ALTER COLUMN username SET NOT NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_username_format_check;

ALTER TABLE users
  ADD CONSTRAINT users_username_format_check
  CHECK (username ~ '^[a-z0-9_]{3,30}$');

CREATE UNIQUE INDEX IF NOT EXISTS users_lower_username_unique_idx
  ON users (LOWER(username));

CREATE INDEX IF NOT EXISTS users_search_username_name_email_idx
  ON users (LOWER(username), LOWER(COALESCE(name, '')), LOWER(email));

ALTER TABLE friend_requests
  ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE;

UPDATE friend_requests request
SET recipient_user_id = recipient.id
FROM users recipient
WHERE request.recipient_user_id IS NULL
AND LOWER(request.recipient_email) = LOWER(recipient.email);

CREATE INDEX IF NOT EXISTS friend_requests_recipient_user_status_idx
  ON friend_requests (recipient_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT 'Web browser',
  public_key_jwk JSONB NOT NULL,
  signing_public_key_jwk JSONB NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS chat_devices_user_last_seen_idx
  ON chat_devices (user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_type TEXT NOT NULL CHECK (conversation_type IN ('direct', 'group')),
  title TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  direct_user_one_id UUID REFERENCES users(id) ON DELETE CASCADE,
  direct_user_two_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (
    (conversation_type = 'direct' AND direct_user_one_id IS NOT NULL AND direct_user_two_id IS NOT NULL AND direct_user_one_id <> direct_user_two_id)
    OR
    (conversation_type = 'group' AND direct_user_one_id IS NULL AND direct_user_two_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_direct_pair_unique_idx
  ON chat_conversations (direct_user_one_id, direct_user_two_id)
  WHERE conversation_type = 'direct';

CREATE INDEX IF NOT EXISTS chat_conversations_updated_idx
  ON chat_conversations (updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_conversation_members (
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  left_at TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_conversation_members_user_idx
  ON chat_conversation_members (user_id, conversation_id);

CREATE TABLE IF NOT EXISTS chat_key_envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_device_id UUID NOT NULL REFERENCES chat_devices(id) ON DELETE CASCADE,
  recipient_device_id UUID NOT NULL REFERENCES chat_devices(id) ON DELETE CASCADE,
  key_version INTEGER NOT NULL DEFAULT 1,
  algorithm TEXT NOT NULL DEFAULT 'ECDH-P256-HKDF-SHA256-AES-GCM',
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, recipient_device_id, key_version)
);

CREATE INDEX IF NOT EXISTS chat_key_envelopes_recipient_idx
  ON chat_key_envelopes (recipient_device_id, conversation_id, key_version DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_device_id UUID NOT NULL REFERENCES chat_devices(id) ON DELETE CASCADE,
  client_message_id UUID NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  algorithm TEXT NOT NULL DEFAULT 'AES-256-GCM',
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  signature TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'system')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (sender_device_id, client_message_id)
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx
  ON chat_messages (conversation_id, created_at DESC, id DESC);
