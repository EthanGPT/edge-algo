// Key Level Breakout System (KLBS) Backtest Statistics
// Data: Databento CME Futures | June 2019 - Feb 2026 (6.7 years)
// Account: $100,000 starting capital
// Contracts: 4 MNQ, 4 MES, 2 MGC (low risk allocation)
// Mode: Trail Only (no breakeven), Level Locks Only (no session direction lock)
// Fees: ~$1.50/contract round-trip INCLUDED

export interface InstrumentStats {
  symbol: string;
  name: string;
  contracts: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  tp: number;
  sl: number;
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
  mode: 'Trail Only + Level Locks',
  feesIncluded: true,
  feePerContract: 1.50,
} as const;

export const INSTRUMENT_STATS: InstrumentStats[] = [
  {
    symbol: 'MNQ',
    name: 'Micro Nasdaq',
    contracts: 4,
    tp: 35,
    sl: 50,
    trades: 6957,
    wins: 4444,
    losses: 2513,
    winRate: 63.9,
    grossPnl: 630130,
    fees: 41742,
    netPnl: 588388,
    profitFactor: 1.58,
    avgWin: 362,
    avgLoss: -406,
    maxDrawdown: -6138,
    sharpeRatio: 6.56,
    sortinoRatio: 15.01,
  },
  {
    symbol: 'MES',
    name: 'Micro S&P 500',
    contracts: 4,
    tp: 25,
    sl: 25,
    trades: 6169,
    wins: 3502,
    losses: 2667,
    winRate: 56.8,
    grossPnl: 430200,
    fees: 37014,
    netPnl: 393186,
    profitFactor: 1.29,
    avgWin: 498,
    avgLoss: -506,
    maxDrawdown: -5657,
    sharpeRatio: 5.08,
    sortinoRatio: 11.69,
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
    grossPnl: 147086,
    fees: 7875,
    netPnl: 139211,
    profitFactor: 1.27,
    avgWin: 420,
    avgLoss: -503,
    maxDrawdown: -5887,
    sharpeRatio: 3.26,
    sortinoRatio: 8.21,
  },
];

export const COMBINED_STATS = {
  totalTrades: 15751,
  totalWins: 9527,
  totalLosses: 6224,
  winRate: 60.5,
  grossPnl: 1207416,
  totalFees: 86631,
  netPnl: 1120785,
  profitFactor: 1.38,
  maxDrawdown: -6138,
  avgDrawdown: -1200,
  avgAnnualReturn: 167281, // $1.12M / 6.7 years
  returnOnCapital: 1121, // 1121% total return (net)
  // Risk-adjusted metrics (averaged across instruments)
  sharpeRatio: 4.97,
  sortinoRatio: 11.64,
  calmarRatio: 9.46,
  recoveryFactor: 182.6,
} as const;

export const YEARLY_STATS: YearStats[] = [
  { year: 2019, pnl: 32542, winRate: 58.7, trades: 972 },
  { year: 2020, pnl: 158812, winRate: 60.2, trades: 2311 },
  { year: 2021, pnl: 144107, winRate: 61.4, trades: 2304 },
  { year: 2022, pnl: 237852, winRate: 62.0, trades: 2464 },
  { year: 2023, pnl: 124128, winRate: 59.5, trades: 2314 },
  { year: 2024, pnl: 185144, winRate: 60.5, trades: 2452 },
  { year: 2025, pnl: 203187, winRate: 59.6, trades: 2522 },
  { year: 2026, pnl: 35013, winRate: 57.7, trades: 412 },
];

// Key highlights
export const BACKTEST_HIGHLIGHTS = {
  totalReturn: '+1,121%',
  totalPnl: '$1.12M',
  netPnl: '$1.12M',
  grossPnl: '$1.21M',
  totalFees: '$87K',
  winRate: '60.5%',
  profitFactor: '1.38',
  dataYears: '6.7',
  totalTrades: '15,751',
  profitableYears: '8/8',
  avgYearlyReturn: '$167K',
  riskLevel: 'Low',
  contractAllocation: '4 MNQ + 4 MES + 2 MGC',
  feesIncluded: 'Yes (~$1.50/contract)',
} as const;

// Performance breakdowns (net of fees)
export const DAY_OF_WEEK_STATS = [
  { day: 'Monday', trades: 3058, winRate: 60.1, pnl: 186797 },
  { day: 'Tuesday', trades: 3220, winRate: 59.8, pnl: 195945 },
  { day: 'Wednesday', trades: 3192, winRate: 60.8, pnl: 233009 },
  { day: 'Thursday', trades: 3186, winRate: 60.4, pnl: 218870 },
  { day: 'Friday', trades: 3095, winRate: 61.4, pnl: 286164 },
];

export const SESSION_STATS = [
  { session: 'London', trades: 13264, winRate: 60.6, pnl: 834382 },
  { session: 'NY', trades: 2487, winRate: 59.8, pnl: 286403 },
];

export const MONTH_STATS = [
  { month: 'Jan', trades: 1495, winRate: 59.0, pnl: 77420 },
  { month: 'Feb', trades: 1164, winRate: 58.5, pnl: 85138 },
  { month: 'Mar', trades: 1395, winRate: 61.7, pnl: 120025 },
  { month: 'Apr', trades: 1070, winRate: 59.1, pnl: 78294 },
  { month: 'May', trades: 1364, winRate: 63.3, pnl: 111475 },
  { month: 'Jun', trades: 1194, winRate: 59.0, pnl: 72789 },
  { month: 'Jul', trades: 1487, winRate: 61.3, pnl: 91494 },
  { month: 'Aug', trades: 1240, winRate: 60.2, pnl: 88119 },
  { month: 'Sep', trades: 1468, winRate: 61.3, pnl: 103370 },
  { month: 'Oct', trades: 1226, winRate: 59.9, pnl: 85267 },
  { month: 'Nov', trades: 1435, winRate: 63.4, pnl: 132852 },
  { month: 'Dec', trades: 1213, winRate: 57.7, pnl: 74542 },
];

export const LEVEL_STATS = [
  { level: 'PDH', trades: 823, winRate: 58.4, pnl: 63339 },
  { level: 'PDL', trades: 931, winRate: 57.7, pnl: 67201 },
  { level: 'PMH', trades: 4055, winRate: 60.9, pnl: 290640 },
  { level: 'PML', trades: 4072, winRate: 64.0, pnl: 384323 },
  { level: 'LPH', trades: 2973, winRate: 57.5, pnl: 152106 },
  { level: 'LPL', trades: 2897, winRate: 59.5, pnl: 163176 },
];

// Format helpers
export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
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
