CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS exchange_rate_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  rate NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
  provider TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exchange_rate_cache_unique_pair UNIQUE (base_currency, target_currency)
);

CREATE INDEX IF NOT EXISTS exchange_rate_cache_pair_idx
  ON exchange_rate_cache (base_currency, target_currency);

CREATE INDEX IF NOT EXISTS exchange_rate_cache_expires_at_idx
  ON exchange_rate_cache (expires_at);

CREATE INDEX IF NOT EXISTS exchange_rate_cache_fetched_at_idx
  ON exchange_rate_cache (fetched_at);
