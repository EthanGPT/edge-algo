-- Personal Trading Journal Schema for Supabase
-- Run this AFTER schema.sql in your Supabase SQL Editor
-- These tables are SEPARATE from the bot tracking system

-- ============================================
-- JOURNAL TRADING SETUPS
-- ============================================
CREATE TABLE IF NOT EXISTS journal_setups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rules TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_setups_user ON journal_setups(user_id);

-- ============================================
-- JOURNAL PROP FIRMS
-- ============================================
CREATE TABLE IF NOT EXISTS journal_prop_firms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  notes TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  total_payouts DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_prop_firms_user ON journal_prop_firms(user_id);

-- ============================================
-- JOURNAL ACCOUNTS (Personal prop firm accounts)
-- ============================================
CREATE TABLE IF NOT EXISTS journal_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('evaluation', 'funded', 'demo')),
  prop_firm TEXT NOT NULL,
  account_size DECIMAL(12,2) NOT NULL,
  start_date DATE NOT NULL,
  status TEXT NOT NULL,
  end_date DATE,
  profit_loss DECIMAL(12,2) NOT NULL DEFAULT 0,
  max_drawdown DECIMAL(12,2),
  profit_target DECIMAL(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_accounts_user ON journal_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_accounts_status ON journal_accounts(status);

-- ============================================
-- JOURNAL TRADES (Personal trades)
-- ============================================
CREATE TABLE IF NOT EXISTS journal_trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time TEXT,
  instrument TEXT NOT NULL,
  setup_id TEXT, -- references journal_setups.id or old string ID
  account_id TEXT, -- references journal_accounts.id or 'split'
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry DECIMAL(12,4) NOT NULL,
  exit DECIMAL(12,4),
  stop_loss DECIMAL(12,4),
  take_profit DECIMAL(12,4),
  contracts INTEGER NOT NULL DEFAULT 1,
  pnl DECIMAL(12,2) NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'breakeven')),
  risk_reward DECIMAL(6,2),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_trades_user ON journal_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_trades_date ON journal_trades(date);
CREATE INDEX IF NOT EXISTS idx_journal_trades_account ON journal_trades(account_id);

-- ============================================
-- JOURNAL PAYOUTS
-- ============================================
CREATE TABLE IF NOT EXISTS journal_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  prop_firm TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('bank_transfer', 'crypto', 'paypal', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_payouts_user ON journal_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_payouts_date ON journal_payouts(date);

-- ============================================
-- JOURNAL EXPENSES
-- ============================================
CREATE TABLE IF NOT EXISTS journal_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('challenge_fee', 'subscription', 'software', 'education', 'other')),
  prop_firm TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_expenses_user ON journal_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_expenses_date ON journal_expenses(date);

-- ============================================
-- JOURNAL DAILY ENTRIES
-- ============================================
CREATE TABLE IF NOT EXISTS journal_daily_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  pnl DECIMAL(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_journal_daily_user ON journal_daily_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_daily_date ON journal_daily_entries(date);

-- ============================================
-- ROW LEVEL SECURITY - Users can only see their own data
-- ============================================

ALTER TABLE journal_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_prop_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_daily_entries ENABLE ROW LEVEL SECURITY;

-- Setups
CREATE POLICY "Users can view own setups" ON journal_setups FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own setups" ON journal_setups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own setups" ON journal_setups FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own setups" ON journal_setups FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Prop Firms
CREATE POLICY "Users can view own prop_firms" ON journal_prop_firms FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own prop_firms" ON journal_prop_firms FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own prop_firms" ON journal_prop_firms FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own prop_firms" ON journal_prop_firms FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Accounts
CREATE POLICY "Users can view own accounts" ON journal_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts" ON journal_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts" ON journal_accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts" ON journal_accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Trades
CREATE POLICY "Users can view own trades" ON journal_trades FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trades" ON journal_trades FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trades" ON journal_trades FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trades" ON journal_trades FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Payouts
CREATE POLICY "Users can view own payouts" ON journal_payouts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own payouts" ON journal_payouts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own payouts" ON journal_payouts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own payouts" ON journal_payouts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Expenses
CREATE POLICY "Users can view own expenses" ON journal_expenses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own expenses" ON journal_expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own expenses" ON journal_expenses FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own expenses" ON journal_expenses FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Daily Entries
CREATE POLICY "Users can view own daily_entries" ON journal_daily_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own daily_entries" ON journal_daily_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily_entries" ON journal_daily_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own daily_entries" ON journal_daily_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================
CREATE TRIGGER trigger_journal_accounts_updated_at
  BEFORE UPDATE ON journal_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
