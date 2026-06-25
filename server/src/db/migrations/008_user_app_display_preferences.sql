ALTER TABLE users
  ADD COLUMN IF NOT EXISTS app_currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS app_language TEXT NOT NULL DEFAULT 'en';

UPDATE users
SET app_currency = COALESCE(NULLIF(app_currency, ''), 'INR'),
    app_language = COALESCE(NULLIF(app_language, ''), 'en');

CREATE INDEX IF NOT EXISTS users_app_currency_idx
  ON users (app_currency);

CREATE INDEX IF NOT EXISTS users_app_language_idx
  ON users (app_language);
