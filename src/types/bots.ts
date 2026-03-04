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

// ============================================
// BACKTEST TRADES & BENCHMARKING TYPES
// ============================================

export type BacktestOutcome = 'WIN' | 'LOSS' | 'BE';
export type TradingSession = 'London' | 'NY';
export type LevelType = 'PDH' | 'PDL' | 'PMH' | 'PML' | 'LPH' | 'LPL';
export type BacktestDirection = 'LONG' | 'SHORT';

// Individual backtest trade (granular data for monthly benchmarks)
export interface BotBacktestTrade {
  id: string;
  bot_id: string;
  trade_date: string;
  exit_time?: string;
  instrument: string;
  level: LevelType;
  direction: BacktestDirection;
  entry_price: number;
  exit_price?: number;
  tp_price?: number;
  sl_price?: number;
  contracts: number;
  outcome: BacktestOutcome;
  pnl_pts?: number;
  pnl_usd_gross?: number;
  fees_usd?: number;
  pnl_usd?: number;
  session?: TradingSession;
  day_of_week?: string;
  hour?: number;
  year: number;
  month: number;
  bars_held?: number;
  max_favorable_excursion?: number;
  max_adverse_excursion?: number;
  trailing_active?: boolean;
  source_file?: string;
  created_at: string;
}

// Monthly benchmark aggregate (from view)
export interface MonthlyBenchmark {
  bot_id: string;
  instrument: string;
  month: number;  // 1-12
  total_trades: number;
  win_count: number;
  loss_count: number;
  net_pnl: number;
  avg_winner: number;
  avg_loser: number;
  largest_winner: number;
  largest_loser: number;
  avg_contracts: number;
  years_of_data: number;
}

// Risk-adjusted performance metrics
export interface RiskMetrics {
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  max_drawdown: number;
  max_drawdown_pct: number;
  avg_monthly_return: number;
  monthly_std_dev: number;
  downside_deviation: number;
  win_rate: number;
  profit_factor: number;
  expectancy: number;
  recovery_factor: number;
}

// Rolling benchmark comparison (live vs historical same-month)
export interface RollingBenchmarkComparison {
  live: {
    trades: number;
    net_pnl: number;
    win_rate: number;
    avg_per_trade: number;
    risk_metrics: RiskMetrics;
  };
  benchmark: {
    trades: number;
    net_pnl: number;  // scaled by contract ratio
    win_rate: number;
    avg_per_trade: number;
    risk_metrics: RiskMetrics;
    years_sampled: number;
  };
  variance: {
    pnl_vs_expected: number;       // percentage
    win_rate_diff: number;         // percentage points
    performance_rating: 'outperforming' | 'meeting' | 'underperforming';
  };
  current_month: number;
  month_name: string;
  contract_scale_factor: number;
}

// Portfolio-level benchmark (combined across multiple bots)
export interface PortfolioBenchmark {
  bots: Array<{
    bot_id: string;
    bot_name: string;
    instrument: string;
    weight: number;  // percentage of portfolio (0-1)
    contracts: number;
    live_pnl: number;
    benchmark_pnl: number;
    variance_pct: number;
  }>;
  combined: {
    total_live_pnl: number;
    total_benchmark_pnl: number;
    variance_pct: number;
    portfolio_sharpe: number;
    portfolio_sortino: number;
    performance_rating: 'outperforming' | 'meeting' | 'underperforming';
  };
  period: {
    month: number;
    year: number;
    month_name: string;
  };
}

// Form types for creating/editing
export type BotFormData = Omit<Bot, 'id' | 'created_by' | 'created_at' | 'updated_at'>;
export type BotAccountFormData = Omit<BotAccount, 'id' | 'created_at' | 'updated_at' | 'total_pnl' | 'current_daily_pnl' | 'trading_days_count'>;
export type BotTradeFormData = Omit<BotTrade, 'id' | 'created_at'>;
export type BotBacktestFormData = Omit<BotBacktestData, 'id' | 'created_at'>;
export type BotBacktestTradeFormData = Omit<BotBacktestTrade, 'id' | 'created_at'>;

// Common instruments for bots (including bonds and currencies)
export const BOT_INSTRUMENTS = [
  'MNQ', 'NQ', 'MES', 'ES', 'MYM', 'YM', 'M2K', 'RTY',
  'MGC', 'GC', 'MCL', 'CL',
  'ZN', 'ZB',  // Bonds
  '6E', '6J',  // Currencies
] as const;

// Month names for display
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
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
