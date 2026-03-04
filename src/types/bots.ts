// Bot Trading System Types
// These types represent the collaborative bot tracking system stored in Supabase

export type BotStatus = 'active' | 'paused' | 'retired';
export type BotAccountStatus = 'evaluation' | 'funded' | 'breached' | 'passed' | 'withdrawn' | 'demo';
export type BotTradeStatus = 'open' | 'closed' | 'cancelled';
export type BotTradeSource = 'webhook' | 'manual';
export type TradeDirection = 'long' | 'short';

export interface Bot {
  id: string;
  created_by: string; // user UUID
  name: string;
  version: string;
  instrument: string;
  default_contracts: number;
  description?: string;
  strategy_notes?: string;
  strategy_code?: string;  // Pine Script or strategy source code
  webhook_url?: string;    // TradersPost webhook URL
  status: BotStatus;
  created_at: string;
  updated_at: string;
}

export interface BotAccount {
  id: string;
  bot_id: string;
  account_name: string;
  prop_firm: string;
  account_size: number;
  contract_size: number;
  status: BotAccountStatus;
  // Drawdown rules
  max_drawdown: number;
  daily_drawdown: number;
  profit_target?: number; // for evaluations
  min_trading_days?: number;
  scaling_rules?: ScalingRules;
  // Balance tracking
  start_date: string;
  current_balance: number;
  high_water_mark: number; // for trailing DD calculations
  starting_balance: number;
  // Calculated fields (from trades)
  total_pnl?: number;
  current_daily_pnl?: number;
  trading_days_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ScalingRules {
  enabled: boolean;
  rules: ScalingRule[];
}

export interface ScalingRule {
  profit_threshold: number; // profit $ to reach
  new_contract_limit: number;
  description?: string;
}

export interface BotTrade {
  id: string;
  bot_id: string;
  bot_account_id?: string; // nullable if not linked to specific account
  external_id?: string; // TradersPost order ID
  timestamp: string;
  instrument: string;
  direction: TradeDirection;
  entry_price: number;
  exit_price?: number;
  contracts: number;
  pnl?: number;
  commission?: number;
  status: BotTradeStatus;
  source: BotTradeSource;
  raw_payload?: Record<string, unknown>; // original webhook data
  notes?: string;
  created_at: string;
}

export interface BotBacktestData {
  id: string;
  bot_id: string;
  period_start: string;
  period_end: string;
  total_trades: number;
  win_count: number;
  loss_count: number;
  gross_pnl: number;
  net_pnl: number;
  max_drawdown: number;
  max_daily_drawdown: number;
  avg_winner: number;
  avg_loser: number;
  largest_winner: number;
  largest_loser: number;
  avg_rr_ratio?: number;
  contract_size: number; // baseline for scaling comparisons
  notes?: string;
  created_at: string;
}

// Computed performance metrics for benchmark
export interface BotPerformanceMetrics {
  total_trades: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  net_pnl: number;
  max_drawdown: number;
  avg_winner: number;
  avg_loser: number;
  profit_factor: number;
}

// Form types for creating/editing
export type BotFormData = Omit<Bot, 'id' | 'created_by' | 'created_at' | 'updated_at'>;
export type BotAccountFormData = Omit<BotAccount, 'id' | 'created_at' | 'updated_at' | 'total_pnl' | 'current_daily_pnl' | 'trading_days_count'>;
export type BotTradeFormData = Omit<BotTrade, 'id' | 'created_at'>;
export type BotBacktestFormData = Omit<BotBacktestData, 'id' | 'created_at'>;

// Common instruments for bots
export const BOT_INSTRUMENTS = [
  'MNQ', 'NQ', 'MES', 'ES', 'MYM', 'YM', 'M2K', 'RTY',
  'MGC', 'GC', 'MCL', 'CL',
] as const;

// Common prop firms for bot accounts
export const BOT_PROP_FIRMS = [
  'Demo Account',
  'Apex Trader Funding',
  'Topstep',
  'Tradeify',
  'Earn2Trade',
  'Take Profit Trader',
  'Bulenox',
  'TradeDay',
  'Elite Trader Funding',
] as const;
