// Key Level Breakout System (KLBS) Backtest Statistics
// Data: Databento CME Futures | June 2019 - Feb 2026 (6.7 years)
// Account: $100,000 starting capital
// Contracts: 4 MNQ, 4 MES, 2 MGC (low risk allocation)
// Mode: Trail Only (no breakeven), Level Locks Only (no session direction lock)

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
  mode: 'Trail Only + Level Locks', // No BE, no session direction lock
} as const;

export const INSTRUMENT_STATS: InstrumentStats[] = [
  {
    symbol: 'MNQ',
    name: 'Micro Nasdaq',
    contracts: 4,
    tp: 35,
    sl: 50,
    trades: 6957,
    wins: 4446,
    losses: 2511,
    winRate: 63.9,
    totalPnl: 630130,
    profitFactor: 1.65,
    avgWin: 390,
    avgLoss: 400,
  },
  {
    symbol: 'MES',
    name: 'Micro S&P 500',
    contracts: 4,
    tp: 25,
    sl: 25,
    trades: 6169,
    wins: 3504,
    losses: 2665,
    winRate: 56.8,
    totalPnl: 430200,
    profitFactor: 1.35,
    avgWin: 510,
    avgLoss: 500,
  },
  {
    symbol: 'MGC',
    name: 'Micro Gold',
    contracts: 2,
    tp: 20,
    sl: 25,
    trades: 2625,
    wins: 1581,
    losses: 1044,
    winRate: 60.2,
    totalPnl: 147086,
    profitFactor: 1.32,
    avgWin: 430,
    avgLoss: 500,
  },
];

export const COMBINED_STATS = {
  totalTrades: 15751,
  totalWins: 9527,
  totalLosses: 6224,
  winRate: 60.5,
  totalPnl: 1207416,
  profitFactor: 1.45,
  grossProfit: 4200000,
  grossLoss: 2900000,
  maxDrawdown: -7500,
  avgDrawdown: -1900,
  avgAnnualReturn: 180212, // $1.21M / 6.7 years
  returnOnCapital: 1207, // 1207% total return
  // Risk-adjusted metrics
  sharpeRatio: 4.35,
  sortinoRatio: 9.80,
  calmarRatio: 24.0,
  recoveryFactor: 161.0,
} as const;

export const YEARLY_STATS: YearStats[] = [
  { year: 2019, pnl: 38374, winRate: 58.7, trades: 972 },
  { year: 2020, pnl: 171415, winRate: 60.5, trades: 2311 },
  { year: 2021, pnl: 156743, winRate: 61.4, trades: 2304 },
  { year: 2022, pnl: 251484, winRate: 62.1, trades: 2464 },
  { year: 2023, pnl: 136968, winRate: 59.5, trades: 2314 },
  { year: 2024, pnl: 198485, winRate: 60.6, trades: 2452 },
  { year: 2025, pnl: 216717, winRate: 60.1, trades: 2522 },
  { year: 2026, pnl: 37230, winRate: 57.8, trades: 412 }, // YTD
];

// Key highlights
export const BACKTEST_HIGHLIGHTS = {
  totalReturn: '+1,207%',
  totalPnl: '$1.21M',
  winRate: '60.5%',
  profitFactor: '1.45',
  dataYears: '6.7',
  totalTrades: '15,751',
  profitableYears: '8/8', // All years profitable including 2026 YTD
  avgYearlyReturn: '$180K',
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
