-- Makes wallet transaction idempotency conflict handling work with PostgreSQL ON CONFLICT.
-- PostgreSQL requires ON CONFLICT to match a unique or exclusion index exactly.
-- A normal UNIQUE index still allows many NULL idempotency_key values, so existing
-- non-idempotent wallet transactions are safe.

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_user_idempotency_full_idx
  ON wallet_transactions (user_id, idempotency_key);
