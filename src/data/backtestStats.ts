// Key Level Breakout System (KLBS) Backtest Statistics
// Data: Databento CME Futures | June 2019 - Feb 2026 (6.7 years)
// Account: $100,000 starting capital
// Contracts: 4 MNQ, 4 MES, 2 MGC (low risk allocation)
// Mode: Trail Only (no breakeven) - OPTIMIZED SETTINGS

export interface InstrumentStats {
  symbol: string;
  name: string;
  contracts: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  tp: number;  // Take profit in pts
  sl: number;  // Stop loss in pts
}

export interface YearStats {
  year: number;
  pnl: number;
  winRate: number;
  trades: number;
}

export const BACKTEST_CONFIG = {
  startingCapital: 100_000,
  dataStart: '2019-06-02',
  dataEnd: '2026-02-26',
  dataYears: 6.7,
  dataSource: 'Databento CME Futures',
  timeframe: '15-minute bars',
  mode: 'Trail Only', // No breakeven - just trail at TP
} as const;

export const INSTRUMENT_STATS: InstrumentStats[] = [
  {
    symbol: 'MNQ',
    name: 'Micro Nasdaq',
    contracts: 4,
    tp: 35,  // OPTIMIZED
    sl: 50,  // OPTIMIZED
    trades: 6296,
    wins: 3914,
    losses: 2382,
    winRate: 62.2,
    totalPnl: 555978,
    profitFactor: 1.58,
    avgWin: 385,
    avgLoss: 400,
  },
  {
    symbol: 'MES',
    name: 'Micro S&P 500',
    contracts: 4,
    tp: 25,  // OPTIMIZED
    sl: 25,  // OPTIMIZED
    trades: 5602,
    wins: 3163,
    losses: 2439,
    winRate: 56.5,
    totalPnl: 383150,
    profitFactor: 1.31,
    avgWin: 507,
    avgLoss: 500,
  },
  {
    symbol: 'MGC',
    name: 'Micro Gold',
    contracts: 2,
    tp: 20,  // OPTIMIZED
    sl: 25,  // OPTIMIZED
    trades: 2317,
    wins: 1397,
    losses: 920,
    winRate: 60.3,
    totalPnl: 137554,
    profitFactor: 1.30,
    avgWin: 428,
    avgLoss: 500,
  },
];

export const COMBINED_STATS = {
  totalTrades: 14215,
  totalWins: 8474,
  totalLosses: 5741,
  winRate: 59.6,
  totalPnl: 1076682,
  profitFactor: 1.40,
  grossProfit: 3862156,
  grossLoss: 2785474,
  maxDrawdown: -7444, // Best single instrument max DD
  avgDrawdown: -1850, // Average drawdown when in loss
  avgAnnualReturn: 160698, // $1.077M / 6.7 years
  returnOnCapital: 1077, // 1077% total return
  // Risk-adjusted metrics (from Trail Only backtest)
  sharpeRatio: 4.17, // Annualized risk-adjusted return
  sortinoRatio: 9.22, // Downside risk-adjusted return
  calmarRatio: 21.6, // Annual return / Max DD
  recoveryFactor: 144.6, // Total P&L / Max DD
} as const;

export const YEARLY_STATS: YearStats[] = [
  { year: 2019, pnl: 38587, winRate: 59.0, trades: 899 },
  { year: 2020, pnl: 152164, winRate: 60.0, trades: 2096 },
  { year: 2021, pnl: 123130, winRate: 59.5, trades: 2068 },
  { year: 2022, pnl: 215914, winRate: 60.5, trades: 2214 },
  { year: 2023, pnl: 128087, winRate: 58.8, trades: 2093 },
  { year: 2024, pnl: 184739, winRate: 59.5, trades: 2190 },
  { year: 2025, pnl: 201331, winRate: 58.2, trades: 2283 },
  { year: 2026, pnl: 32730, winRate: 55.1, trades: 372 }, // YTD
];

// Key highlights for marketing
export const BACKTEST_HIGHLIGHTS = {
  totalReturn: '+1,077%',
  totalPnl: '$1.08M',
  winRate: '60%',
  profitFactor: '1.40',
  dataYears: '6.7',
  totalTrades: '14,215',
  profitableYears: '7/7', // All complete years profitable
  avgYearlyReturn: '$161K',
  riskLevel: 'Low', // Only micro contracts
  contractAllocation: '4 MNQ + 4 MES + 2 MGC',
} as const;

// Performance breakdowns
export const DAY_OF_WEEK_STATS = [
  { day: 'Monday', trades: 3058, winRate: 60.1, pnl: 203645 },
  { day: 'Tuesday', trades: 3220, winRate: 59.8, pnl: 213672 },
  { day: 'Wednesday', trades: 3192, winRate: 60.8, pnl: 250553 },
  { day: 'Thursday', trades: 3186, winRate: 60.4, pnl: 236399 },
  { day: 'Friday', trades: 3095, winRate: 61.4, pnl: 303147 },
];

export const SESSION_STATS = [
  { session: 'London', trades: 13264, winRate: 60.6, pnl: 907090 },
  { session: 'NY', trades: 2487, winRate: 59.8, pnl: 300326 },
];

export const MONTH_STATS = [
  { month: 'Jan', trades: 1495, winRate: 59.0, pnl: 84094 },
  { month: 'Feb', trades: 1164, winRate: 58.5, pnl: 92324 },
  { month: 'Mar', trades: 1395, winRate: 61.7, pnl: 130244 },
  { month: 'Apr', trades: 1070, winRate: 59.1, pnl: 84970 },
  { month: 'May', trades: 1364, winRate: 63.3, pnl: 120950 },
  { month: 'Jun', trades: 1194, winRate: 59.0, pnl: 78988 },
  { month: 'Jul', trades: 1487, winRate: 61.3, pnl: 99321 },
  { month: 'Aug', trades: 1240, winRate: 60.2, pnl: 95672 },
  { month: 'Sep', trades: 1468, winRate: 61.3, pnl: 112228 },
  { month: 'Oct', trades: 1226, winRate: 59.9, pnl: 92592 },
  { month: 'Nov', trades: 1435, winRate: 63.4, pnl: 144230 },
  { month: 'Dec', trades: 1213, winRate: 57.7, pnl: 71803 },
];

export const LEVEL_STATS = [
  { level: 'PDH', trades: 823, winRate: 58.4, pnl: 68082 },
  { level: 'PDL', trades: 931, winRate: 57.7, pnl: 72565 },
  { level: 'PMH', trades: 4055, winRate: 60.9, pnl: 312579 },
  { level: 'PML', trades: 4072, winRate: 64.0, pnl: 406319 },
  { level: 'LPH', trades: 2973, winRate: 57.5, pnl: 168561 },
  { level: 'LPL', trades: 2897, winRate: 59.5, pnl: 179310 },
];

// Format helpers
export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

export function formatPnl(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${formatCurrency(value)}`;
}
