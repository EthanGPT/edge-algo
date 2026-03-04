export interface Payout {
  id: string;
  date: string;
  amount: number;
  propFirm: string;
  method: 'bank_transfer' | 'crypto' | 'paypal' | 'other';
  notes?: string;
}

export interface Expense {
  id: string;
  date: string;
  amount: number;
  category: 'challenge_fee' | 'subscription' | 'software' | 'education' | 'other';
  propFirm?: string;
  notes?: string;
}

export type AccountType = 'evaluation' | 'funded' | 'demo';
export type EvaluationStatus = 'passed' | 'failed' | 'in_progress';
export type FundedStatus = 'active' | 'breached' | 'withdrawn';
export type DemoStatus = 'active' | 'closed';

export interface Account {
  id: string;
  type: AccountType;
  propFirm: string;
  accountSize: number;
  startDate: string;
  status: EvaluationStatus | FundedStatus | DemoStatus;
  endDate?: string;
  profitLoss: number;
  maxDrawdown?: number;    // max loss $ before auto-breach/fail
  profitTarget?: number;   // profit $ to auto-pass (evaluations) or optional demo target
  notes?: string;
}

export interface PropFirm {
  id: string;
  name: string;
  website?: string;
  notes?: string;
  rating?: number;
  totalPayouts: number;
}

export const PROP_FIRMS = [
  'FTMO',
  'MyForexFunds',
  'FundedNext',
  'The Funded Trader',
  'True Forex Funds',
  'E8 Funding',
  'Topstep',
  'Apex Trader Funding',
  'My Funded FX',
  'The5ers',
] as const;

export const PAYOUT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'crypto', label: 'Cryptocurrency' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'other', label: 'Other' },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: 'challenge_fee', label: 'Challenge Fee' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'software', label: 'Software' },
  { value: 'education', label: 'Education' },
  { value: 'other', label: 'Other' },
] as const;

export interface DailyEntry {
  id: string;
  date: string; // YYYY-MM-DD
  pnl?: number;
  notes?: string;
}

export type TradeDirection = 'long' | 'short';
export type TradeResult = 'win' | 'loss' | 'breakeven';

export interface TradingSetup {
  id: string;
  name: string;
  description?: string;
  rules?: string;
}

export interface Trade {
  id: string;
  date: string;
  time?: string;
  instrument: string;
  setupId: string;
  accountId?: string; // account ID or 'split' for equal split across active funded accounts
  direction: TradeDirection;
  entry?: number;
  exit?: number;
  stopLoss?: number;
  takeProfit?: number;
  contracts: number;
  pnl: number;
  result: TradeResult;
  riskReward?: number;
  rating?: number; // 1-5 execution quality
  notes?: string;
}

export const INSTRUMENTS = [
  'NQ', 'ES', 'YM', 'RTY', 'GC', 'CL',
  'EUR/USD', 'GBP/USD', 'USD/JPY',
] as const;

export const ACCOUNT_SIZES = [
  5000, 10000, 25000, 50000, 100000, 200000, 400000
] as const;

// Economic Calendar Types
export type EventImpact = 'low' | 'medium' | 'high';

export interface EconomicEvent {
  id: string;
  releaseId: number;       // FRED release ID
  name: string;            // e.g., "Non-Farm Payrolls"
  date: string;            // YYYY-MM-DD
  impact: EventImpact;
  description?: string;
  affectsInstruments: string[]; // e.g., ['MNQ', 'GC']
}

// High-impact releases that affect MNQ/Gold
// Times are in ET (Eastern Time)
export const HIGH_IMPACT_RELEASES = [
  { id: 'nfp', name: 'Non-Farm Payrolls', impact: 'high' as EventImpact, affects: ['MNQ', 'GC'], time: '08:30' },
  { id: 'cpi', name: 'CPI', impact: 'high' as EventImpact, affects: ['MNQ', 'GC'], time: '08:30' },
  { id: 'fomc', name: 'FOMC Rate Decision', impact: 'high' as EventImpact, affects: ['MNQ', 'GC'], time: '14:00' },
  { id: 'gdp', name: 'GDP', impact: 'high' as EventImpact, affects: ['MNQ', 'GC'], time: '08:30' },
  { id: 'pce', name: 'Core PCE Price Index', impact: 'high' as EventImpact, affects: ['MNQ', 'GC'], time: '08:30' },
  { id: 'ppi', name: 'PPI', impact: 'medium' as EventImpact, affects: ['MNQ', 'GC'], time: '08:30' },
  { id: 'retail', name: 'Retail Sales', impact: 'medium' as EventImpact, affects: ['MNQ'], time: '08:30' },
  { id: 'claims', name: 'Initial Jobless Claims', impact: 'medium' as EventImpact, affects: ['MNQ', 'GC'], time: '08:30' },
  { id: 'ism_mfg', name: 'ISM Manufacturing PMI', impact: 'high' as EventImpact, affects: ['MNQ'], time: '10:00' },
  { id: 'ism_svc', name: 'ISM Services PMI', impact: 'high' as EventImpact, affects: ['MNQ'], time: '10:00' },
  { id: 'adp', name: 'ADP Employment', impact: 'medium' as EventImpact, affects: ['MNQ'], time: '08:15' },
  { id: 'consumer_conf', name: 'Consumer Confidence', impact: 'medium' as EventImpact, affects: ['MNQ'], time: '10:00' },
  { id: 'durable', name: 'Durable Goods Orders', impact: 'medium' as EventImpact, affects: ['MNQ'], time: '08:30' },
  { id: 'michigan', name: 'Michigan Consumer Sentiment', impact: 'medium' as EventImpact, affects: ['MNQ', 'GC'], time: '10:00' },
] as const;
