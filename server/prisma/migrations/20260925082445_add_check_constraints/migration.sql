ALTER TABLE "users"
  ADD CONSTRAINT users_provider_check CHECK (provider IN ('local', 'google'));

ALTER TABLE "cards"
  ADD CONSTRAINT cards_last_four_check CHECK (char_length(last_four) = 4),
  ADD CONSTRAINT cards_expiry_month_check CHECK (expiry_month BETWEEN 1 AND 12);

ALTER TABLE "transactions"
  ADD CONSTRAINT transactions_type_check CHECK (type IN ('income', 'expense'));

ALTER TABLE "budgets"
  ADD CONSTRAINT budgets_period_check CHECK (period IN ('weekly', 'monthly', 'yearly'));