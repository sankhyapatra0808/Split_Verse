-- Razorpay wallet payment integration.

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;

CREATE INDEX IF NOT EXISTS payment_orders_provider_payment_idx
  ON payment_orders (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wallet_transactions_provider_payment_idx
  ON wallet_transactions (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
