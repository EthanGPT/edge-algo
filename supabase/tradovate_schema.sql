-- Tradovate Integration Schema
-- Run this after the main schema.sql

-- ============================================
-- BROKER CONNECTIONS TABLE (Tradovate and other brokers)
-- ============================================
CREATE TABLE IF NOT EXISTS broker_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker TEXT NOT NULL DEFAULT 'tradovate' CHECK (broker IN ('tradovate', 'ninjatrader', 'tradestation')),
  name TEXT NOT NULL,  -- User-friendly name like "Apex Account 1"
  environment TEXT NOT NULL DEFAULT 'demo' CHECK (environment IN ('demo', 'live')),
  -- Credentials (encrypted at rest by Supabase)
  username TEXT NOT NULL,
  -- Note: In production, use Supabase Vault for sensitive credentials
  -- For now, we'll store hashed/encrypted in the app layer
  credentials_encrypted TEXT NOT NULL,
  -- Connection status
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  -- Metadata
  broker_user_id INTEGER,  -- Tradovate user ID after auth
  broker_accounts JSONB,   -- Cache of broker account list
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_broker_connections_user ON broker_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_broker_connections_active ON broker_connections(is_active);

-- ============================================
-- BROKER ACCOUNT MAPPINGS (Link broker accounts to bot_accounts)
-- ============================================
CREATE TABLE IF NOT EXISTS broker_account_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broker_connection_id UUID NOT NULL REFERENCES broker_connections(id) ON DELETE CASCADE,
  bot_account_id UUID NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  broker_account_id INTEGER NOT NULL,  -- Tradovate account ID
  broker_account_name TEXT NOT NULL,   -- e.g., "APEX-12345"
  auto_sync BOOLEAN NOT NULL DEFAULT true,
  sync_interval_minutes INTEGER DEFAULT 5,
  last_sync_at TIMESTAMPTZ,
  last_fill_id INTEGER,  -- Track last synced fill for incremental sync
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(broker_connection_id, broker_account_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_broker_mappings_connection ON broker_account_mappings(broker_connection_id);
CREATE INDEX IF NOT EXISTS idx_broker_mappings_bot_account ON broker_account_mappings(bot_account_id);

-- ============================================
-- UPDATE bot_trades to track Tradovate IDs
-- ============================================
ALTER TABLE bot_trades
ADD COLUMN IF NOT EXISTS tradovate_fill_id INTEGER,
ADD COLUMN IF NOT EXISTS tradovate_order_id INTEGER,
ADD COLUMN IF NOT EXISTS broker_connection_id UUID REFERENCES broker_connections(id) ON DELETE SET NULL;

-- Index for deduplication
CREATE INDEX IF NOT EXISTS idx_bot_trades_tradovate_fill ON bot_trades(tradovate_fill_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE broker_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_account_mappings ENABLE ROW LEVEL SECURITY;

-- Users can only see their own broker connections
CREATE POLICY "Users can view own broker connections"
  ON broker_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own broker connections"
  ON broker_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own broker connections"
  ON broker_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own broker connections"
  ON broker_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Users can manage mappings for their connections
CREATE POLICY "Users can view own mappings"
  ON broker_account_mappings FOR SELECT
  USING (
    broker_connection_id IN (
      SELECT id FROM broker_connections WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own mappings"
  ON broker_account_mappings FOR INSERT
  WITH CHECK (
    broker_connection_id IN (
      SELECT id FROM broker_connections WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own mappings"
  ON broker_account_mappings FOR UPDATE
  USING (
    broker_connection_id IN (
      SELECT id FROM broker_connections WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own mappings"
  ON broker_account_mappings FOR DELETE
  USING (
    broker_connection_id IN (
      SELECT id FROM broker_connections WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- FUNCTION: Update timestamp on record change
-- ============================================
CREATE OR REPLACE FUNCTION update_broker_connection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_broker_connections_timestamp
  BEFORE UPDATE ON broker_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_broker_connection_timestamp();
