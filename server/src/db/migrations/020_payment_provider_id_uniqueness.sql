-- Prevent a payment provider transaction from being attached or credited more
-- than once, even if application-level idempotency checks are bypassed.

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_payment_unique_idx
  ON payment_orders (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_provider_payment_unique_idx
  ON wallet_transactions (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
