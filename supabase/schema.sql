-- Bot Trading System Schema for Supabase
-- Run this in your Supabase SQL Editor to set up the database

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- BOTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'v1.0',
  instrument TEXT NOT NULL,
  default_contracts INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  strategy_notes TEXT,
  strategy_code TEXT,  -- Store Pine Script or strategy source code
  webhook_url TEXT,    -- TradersPost or other webhook URL
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bots_created_by ON bots(created_by);
CREATE INDEX IF NOT EXISTS idx_bots_status ON bots(status);

-- ============================================
-- BOT ACCOUNTS TABLE (Prop firm accounts linked to bots)
-- ============================================
CREATE TABLE IF NOT EXISTS bot_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  prop_firm TEXT NOT NULL,
  account_size DECIMAL(12,2) NOT NULL,
  contract_size INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'evaluation' CHECK (status IN ('demo', 'evaluation', 'funded', 'breached', 'passed', 'withdrawn')),
  -- Drawdown rules
  max_drawdown DECIMAL(12,2) NOT NULL,
  daily_drawdown DECIMAL(12,2) NOT NULL,
  profit_target DECIMAL(12,2), -- nullable, for evaluations
  min_trading_days INTEGER,
  scaling_rules JSONB, -- flexible rules per firm
  -- Balance tracking
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  starting_balance DECIMAL(12,2) NOT NULL,
  current_balance DECIMAL(12,2) NOT NULL,
  high_water_mark DECIMAL(12,2) NOT NULL, -- for trailing DD
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bot_accounts_bot_id ON bot_accounts(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_accounts_status ON bot_accounts(status);

-- ============================================
-- BOT TRADES TABLE (Live trades from webhooks or manual entry)
-- ============================================
CREATE TABLE IF NOT EXISTS bot_trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  bot_account_id UUID REFERENCES bot_accounts(id) ON DELETE SET NULL,
  external_id TEXT, -- TradersPost order ID
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  instrument TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price DECIMAL(12,4) NOT NULL,
  exit_price DECIMAL(12,4),
  contracts INTEGER NOT NULL DEFAULT 1,
  pnl DECIMAL(12,2),
  commission DECIMAL(8,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('webhook', 'manual')),
  raw_payload JSONB, -- store original webhook data
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_bot_trades_bot_id ON bot_trades(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_trades_account_id ON bot_trades(bot_account_id);
CREATE INDEX IF NOT EXISTS idx_bot_trades_timestamp ON bot_trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_bot_trades_external_id ON bot_trades(external_id);

-- ============================================
-- BOT BACKTEST DATA TABLE (Historical performance baselines)
-- ============================================
CREATE TABLE IF NOT EXISTS bot_backtest_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_trades INTEGER NOT NULL,
  win_count INTEGER NOT NULL,
  loss_count INTEGER NOT NULL,
  gross_pnl DECIMAL(12,2) NOT NULL,
  net_pnl DECIMAL(12,2) NOT NULL,
  max_drawdown DECIMAL(12,2) NOT NULL,
  max_daily_drawdown DECIMAL(12,2) NOT NULL,
  avg_winner DECIMAL(12,2) NOT NULL,
  avg_loser DECIMAL(12,2) NOT NULL,
  largest_winner DECIMAL(12,2) NOT NULL,
  largest_loser DECIMAL(12,2) NOT NULL,
  avg_rr_ratio DECIMAL(6,2),
  contract_size INTEGER NOT NULL DEFAULT 1, -- baseline for scaling
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_backtest_bot_id ON bot_backtest_data(bot_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- Allow authenticated users to read/write all bot data
-- (Simple policy - all authenticated users share data)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_backtest_data ENABLE ROW LEVEL SECURITY;

-- Bots: all authenticated users can CRUD all bots
CREATE POLICY "Authenticated users can view all bots"
  ON bots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert bots"
  ON bots FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update all bots"
  ON bots FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete all bots"
  ON bots FOR DELETE
  TO authenticated
  USING (true);

-- Bot Accounts: all authenticated users can CRUD
CREATE POLICY "Authenticated users can view all bot_accounts"
  ON bot_accounts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert bot_accounts"
  ON bot_accounts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update bot_accounts"
  ON bot_accounts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete bot_accounts"
  ON bot_accounts FOR DELETE TO authenticated USING (true);

-- Bot Trades: all authenticated users can CRUD
CREATE POLICY "Authenticated users can view all bot_trades"
  ON bot_trades FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert bot_trades"
  ON bot_trades FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update bot_trades"
  ON bot_trades FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete bot_trades"
  ON bot_trades FOR DELETE TO authenticated USING (true);

-- Bot Backtest Data: all authenticated users can CRUD
CREATE POLICY "Authenticated users can view all bot_backtest_data"
  ON bot_backtest_data FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert bot_backtest_data"
  ON bot_backtest_data FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update bot_backtest_data"
  ON bot_backtest_data FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete bot_backtest_data"
  ON bot_backtest_data FOR DELETE TO authenticated USING (true);

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER trigger_bots_updated_at
  BEFORE UPDATE ON bots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_bot_accounts_updated_at
  BEFORE UPDATE ON bot_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- HELPFUL VIEWS
-- ============================================

-- Bot performance summary (aggregated from trades)
CREATE OR REPLACE VIEW bot_performance_summary AS
SELECT
  b.id as bot_id,
  b.name as bot_name,
  b.version,
  b.instrument,
  b.status,
  COUNT(DISTINCT ba.id) as account_count,
  COUNT(bt.id) as total_trades,
  SUM(CASE WHEN bt.pnl > 0 THEN 1 ELSE 0 END) as win_count,
  SUM(CASE WHEN bt.pnl < 0 THEN 1 ELSE 0 END) as loss_count,
  COALESCE(SUM(bt.pnl), 0) as total_pnl,
  COALESCE(AVG(CASE WHEN bt.pnl > 0 THEN bt.pnl END), 0) as avg_winner,
  COALESCE(AVG(CASE WHEN bt.pnl < 0 THEN bt.pnl END), 0) as avg_loser
FROM bots b
LEFT JOIN bot_accounts ba ON ba.bot_id = b.id
LEFT JOIN bot_trades bt ON bt.bot_id = b.id AND bt.status = 'closed'
GROUP BY b.id, b.name, b.version, b.instrument, b.status;

-- Account daily P&L tracking
CREATE OR REPLACE VIEW account_daily_pnl AS
SELECT
  ba.id as account_id,
  ba.account_name,
  ba.bot_id,
  DATE(bt.timestamp) as trade_date,
  SUM(bt.pnl) as daily_pnl,
  COUNT(bt.id) as trade_count
FROM bot_accounts ba
JOIN bot_trades bt ON bt.bot_account_id = ba.id AND bt.status = 'closed'
GROUP BY ba.id, ba.account_name, ba.bot_id, DATE(bt.timestamp)
ORDER BY trade_date DESC;
