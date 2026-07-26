ALTER TABLE users
  ALTER COLUMN username DROP NOT NULL;

CREATE OR REPLACE FUNCTION prevent_splitverse_username_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.username IS NOT NULL AND OLD.username IS DISTINCT FROM NEW.username THEN
    RAISE EXCEPTION 'SplitVerse usernames are permanent and cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
