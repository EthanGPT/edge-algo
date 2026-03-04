-- Migration: Add 'demo' to bot_accounts status enum
-- Run this in your Supabase SQL Editor to fix the bot account creation issue

-- Drop the old constraint and add a new one with 'demo'
ALTER TABLE bot_accounts DROP CONSTRAINT IF EXISTS bot_accounts_status_check;
ALTER TABLE bot_accounts ADD CONSTRAINT bot_accounts_status_check
  CHECK (status IN ('demo', 'evaluation', 'funded', 'breached', 'passed', 'withdrawn'));
