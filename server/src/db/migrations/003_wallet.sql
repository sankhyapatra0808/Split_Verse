CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_transactions_user_created_idx
  ON wallet_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wallet_transactions_user_type_created_idx
  ON wallet_transactions (user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS wallet_transactions_user_type_amount_created_idx
  ON wallet_transactions (user_id, type, amount, created_at DESC);

CREATE INDEX IF NOT EXISTS settlements_from_status_created_idx
  ON settlements (from_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS settlements_to_status_created_idx
  ON settlements (to_user_id, status, created_at DESC);
