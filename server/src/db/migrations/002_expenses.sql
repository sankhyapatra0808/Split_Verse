CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS expense_date DATE NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS expenses_user_expense_date_idx
  ON expenses (user_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS expenses_user_created_at_idx
  ON expenses (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS expenses_shared_room_lookup_idx
  ON expenses (user_id, category, title, amount)
  WHERE category = 'Shared room';
