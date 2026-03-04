/**
 * useBenchmarks Hook
 *
 * Provides risk-adjusted metrics calculations and benchmark comparisons
 * for AI hedge fund performance tracking.
 */

import { useMemo, useCallback } from 'react';
import type {
  BotTrade,
  BotBacktestTrade,
  RiskMetrics,
  RollingBenchmarkComparison,
  PortfolioBenchmark,
  MONTH_NAMES,
} from '@/types/bots';

// Risk-free rate for Sharpe/Sortino (annualized, ~5%)
const RISK_FREE_RATE = 0.05;
const TRADING_DAYS_PER_YEAR = 252;

// ============================================
// HELPER FUNCTIONS
// ============================================

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function standardDeviation(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

function getMonthName(month: number): string {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return names[month - 1] || 'Unknown';
}

// Group trades by month and sum P&L
function groupByMonth(trades: Array<{ pnl_usd?: number; pnl?: number; trade_date?: string; timestamp?: string }>, scale: number = 1): number[] {
  const monthMap = new Map<string, number>();

  trades.forEach(t => {
    const dateStr = t.trade_date || t.timestamp;
    if (!dateStr) return;

    const date = new Date(dateStr);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const pnl = (t.pnl_usd ?? t.pnl ?? 0) * scale;
    monthMap.set(key, (monthMap.get(key) || 0) + pnl);
  });

  return Array.from(monthMap.values());
}

// Calculate maximum drawdown and duration
function calculateMaxDrawdown(
  trades: Array<{ pnl_usd?: number; pnl?: number; trade_date?: string; timestamp?: string }>,
  scale: number = 1
): { maxDD: number; maxDDPct: number; maxDDDuration: number } {
  // Sort by date
  const sorted = [...trades].sort((a, b) => {
    const dateA = new Date(a.trade_date || a.timestamp || 0).getTime();
    const dateB = new Date(b.trade_date || b.timestamp || 0).getTime();
    return dateA - dateB;
  });

  let cumPnl = 0;
  let peak = 0;
  let maxDD = 0;
  let maxDDPct = 0;
  let maxDDDuration = 0;
  let ddStart: Date | null = null;

  for (const trade of sorted) {
    cumPnl += (trade.pnl_usd ?? trade.pnl ?? 0) * scale;

    if (cumPnl > peak) {
      peak = cumPnl;
      ddStart = null;
    } else if (peak > 0) {
      const dd = peak - cumPnl;
      const ddPct = dd / peak;

      if (dd > maxDD) {
        maxDD = dd;
        maxDDPct = ddPct;

        if (!ddStart) {
          ddStart = new Date(trade.trade_date || trade.timestamp || 0);
        }

        const currentDate = new Date(trade.trade_date || trade.timestamp || 0);
        maxDDDuration = Math.floor(
          (currentDate.getTime() - ddStart.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
    }
  }

  return { maxDD, maxDDPct, maxDDDuration };
}

// ============================================
// MAIN HOOK
// ============================================

export function useBenchmarks() {

  /**
   * Calculate comprehensive risk-adjusted metrics for a set of trades
   */
  const calculateRiskMetrics = useCallback((
    trades: Array<BotTrade | BotBacktestTrade>,
    contractScale: number = 1
  ): RiskMetrics => {
    if (trades.length === 0) {
      return {
        sharpe_ratio: 0,
        sortino_ratio: 0,
        calmar_ratio: 0,
        max_drawdown: 0,
        max_drawdown_pct: 0,
        avg_monthly_return: 0,
        monthly_std_dev: 0,
        downside_deviation: 0,
        win_rate: 0,
        profit_factor: 0,
        expectancy: 0,
        recovery_factor: 0,
      };
    }

    // Group by month for monthly returns
    const monthlyReturns = groupByMonth(trades as any[], contractScale);
    const avgMonthly = mean(monthlyReturns);
    const stdDev = standardDeviation(monthlyReturns);

    // Downside deviation (only negative returns)
    const negativeReturns = monthlyReturns.filter(r => r < 0);
    const downsideDev = negativeReturns.length > 0
      ? standardDeviation(negativeReturns)
      : 0;

    // Max drawdown
    const { maxDD, maxDDPct, maxDDDuration } = calculateMaxDrawdown(trades as any[], contractScale);

    // Annualized return (monthly * 12)
    const annualizedReturn = avgMonthly * 12;

    // Sharpe Ratio = (Return - RiskFree) / StdDev (annualized)
    const sharpeRatio = stdDev > 0
      ? (annualizedReturn - RISK_FREE_RATE) / (stdDev * Math.sqrt(12))
      : 0;

    // Sortino Ratio = (Return - RiskFree) / DownsideDev (annualized)
    const sortinoRatio = downsideDev > 0
      ? (annualizedReturn - RISK_FREE_RATE) / (downsideDev * Math.sqrt(12))
      : annualizedReturn > 0 ? Infinity : 0;

    // Calmar Ratio = AnnualizedReturn / MaxDrawdown
    const calmarRatio = maxDD > 0 ? annualizedReturn / maxDD : 0;

    // Win rate and profit factor
    const getPnl = (t: any) => (t.pnl_usd ?? t.pnl ?? 0) * contractScale;
    const wins = trades.filter(t => getPnl(t) > 0);
    const losses = trades.filter(t => getPnl(t) < 0);
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;

    const grossProfit = wins.reduce((s, t) => s + Math.abs(getPnl(t)), 0);
    const grossLoss = losses.reduce((s, t) => s + Math.abs(getPnl(t)), 0);
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Expectancy = (WinRate * AvgWin) - (LossRate * AvgLoss)
    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

    // Recovery Factor = Total P&L / Max Drawdown
    const totalPnl = trades.reduce((s, t) => s + getPnl(t), 0);
    const recoveryFactor = maxDD > 0 ? totalPnl / maxDD : 0;

    return {
      sharpe_ratio: Number(sharpeRatio.toFixed(2)),
      sortino_ratio: Number(sortinoRatio.toFixed(2)),
      calmar_ratio: Number(calmarRatio.toFixed(2)),
      max_drawdown: Number(maxDD.toFixed(2)),
      max_drawdown_pct: Number((maxDDPct * 100).toFixed(2)),
      avg_monthly_return: Number(avgMonthly.toFixed(2)),
      monthly_std_dev: Number(stdDev.toFixed(2)),
      downside_deviation: Number(downsideDev.toFixed(2)),
      win_rate: Number(winRate.toFixed(1)),
      profit_factor: Number(Math.min(profitFactor, 999).toFixed(2)),
      expectancy: Number(expectancy.toFixed(2)),
      recovery_factor: Number(recoveryFactor.toFixed(2)),
    };
  }, []);

  /**
   * Get rolling benchmark comparison for current month
   * Compares live trades against historical same-month performance
   */
  const getRollingBenchmark = useCallback((
    liveTrades: BotTrade[],
    backtestTrades: BotBacktestTrade[],
    liveContracts: number,
    backtestContracts: number = 1
  ): RollingBenchmarkComparison | null => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();

    if (backtestTrades.length === 0) return null;

    // Filter live trades for current month/year
    const liveMonthTrades = liveTrades.filter(t => {
      const d = new Date(t.timestamp);
      return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear && t.status === 'closed';
    });

    // Filter backtest trades for same calendar month (any year)
    const btMonthTrades = backtestTrades.filter(t => t.month === currentMonth);

    if (btMonthTrades.length === 0) return null;

    // Contract scaling factor
    const scaleFactor = liveContracts / backtestContracts;

    // Calculate years of historical data
    const yearsOfData = new Set(btMonthTrades.map(t => t.year)).size;

    // Live metrics
    const livePnl = liveMonthTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const liveMetrics = calculateRiskMetrics(liveMonthTrades, 1);

    // Benchmark metrics (scaled)
    const btTotalPnl = btMonthTrades.reduce((s, t) => s + (t.pnl_usd || 0), 0);
    const avgMonthlyBtPnl = (btTotalPnl / yearsOfData) * scaleFactor;
    const btMetrics = calculateRiskMetrics(btMonthTrades, scaleFactor);

    // Variance calculation
    const pnlVariance = avgMonthlyBtPnl !== 0
      ? ((livePnl - avgMonthlyBtPnl) / Math.abs(avgMonthlyBtPnl)) * 100
      : livePnl > 0 ? 100 : livePnl < 0 ? -100 : 0;

    // Performance rating
    let rating: 'outperforming' | 'meeting' | 'underperforming' = 'meeting';
    if (pnlVariance > 15) rating = 'outperforming';
    else if (pnlVariance < -15) rating = 'underperforming';

    return {
      live: {
        trades: liveMonthTrades.length,
        net_pnl: Number(livePnl.toFixed(2)),
        win_rate: liveMetrics.win_rate,
        avg_per_trade: liveMonthTrades.length > 0 ? Number((livePnl / liveMonthTrades.length).toFixed(2)) : 0,
        risk_metrics: liveMetrics,
      },
      benchmark: {
        trades: Math.round(btMonthTrades.length / yearsOfData),
        net_pnl: Number(avgMonthlyBtPnl.toFixed(2)),
        win_rate: btMetrics.win_rate,
        avg_per_trade: btMonthTrades.length > 0
          ? Number(((btTotalPnl / btMonthTrades.length) * scaleFactor).toFixed(2))
          : 0,
        risk_metrics: btMetrics,
        years_sampled: yearsOfData,
      },
      variance: {
        pnl_vs_expected: Number(pnlVariance.toFixed(1)),
        win_rate_diff: Number((liveMetrics.win_rate - btMetrics.win_rate).toFixed(1)),
        performance_rating: rating,
      },
      current_month: currentMonth,
      month_name: getMonthName(currentMonth),
      contract_scale_factor: scaleFactor,
    };
  }, [calculateRiskMetrics]);

  /**
   * Get portfolio-level benchmark across multiple bots
   */
  const getPortfolioBenchmark = useCallback((
    bots: Array<{
      id: string;
      name: string;
      instrument: string;
      contracts: number;
      liveTrades: BotTrade[];
      backtestTrades: BotBacktestTrade[];
      backtestContracts: number;
    }>,
    weights?: Record<string, number>  // bot_id -> weight (0-1)
  ): PortfolioBenchmark => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Default to equal weighting
    const defaultWeight = 1 / bots.length;

    const botData = bots.map(bot => {
      const weight = weights?.[bot.id] ?? defaultWeight;
      const scaleFactor = bot.contracts / bot.backtestContracts;

      // Live P&L for current month
      const liveMonthTrades = bot.liveTrades.filter(t => {
        const d = new Date(t.timestamp);
        return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear && t.status === 'closed';
      });
      const livePnl = liveMonthTrades.reduce((s, t) => s + (t.pnl || 0), 0);

      // Benchmark P&L (avg monthly for same calendar month, scaled)
      const btMonthTrades = bot.backtestTrades.filter(t => t.month === currentMonth);
      const yearsOfData = new Set(btMonthTrades.map(t => t.year)).size || 1;
      const btPnl = btMonthTrades.reduce((s, t) => s + (t.pnl_usd || 0), 0);
      const avgBenchPnl = (btPnl / yearsOfData) * scaleFactor;

      const variance = avgBenchPnl !== 0
        ? ((livePnl - avgBenchPnl) / Math.abs(avgBenchPnl)) * 100
        : 0;

      return {
        bot_id: bot.id,
        bot_name: bot.name,
        instrument: bot.instrument,
        weight,
        contracts: bot.contracts,
        live_pnl: Number(livePnl.toFixed(2)),
        benchmark_pnl: Number(avgBenchPnl.toFixed(2)),
        variance_pct: Number(variance.toFixed(1)),
      };
    });

    // Portfolio totals (weighted)
    const totalLivePnl = botData.reduce((s, b) => s + b.live_pnl, 0);
    const totalBenchPnl = botData.reduce((s, b) => s + b.benchmark_pnl, 0);
    const portfolioVariance = totalBenchPnl !== 0
      ? ((totalLivePnl - totalBenchPnl) / Math.abs(totalBenchPnl)) * 100
      : 0;

    // Combined risk metrics (all live trades)
    const allLiveTrades = bots.flatMap(b =>
      b.liveTrades.filter(t => t.status === 'closed')
    );
    const portfolioMetrics = calculateRiskMetrics(allLiveTrades, 1);

    // Performance rating
    let rating: 'outperforming' | 'meeting' | 'underperforming' = 'meeting';
    if (portfolioVariance > 15) rating = 'outperforming';
    else if (portfolioVariance < -15) rating = 'underperforming';

    return {
      bots: botData,
      combined: {
        total_live_pnl: Number(totalLivePnl.toFixed(2)),
        total_benchmark_pnl: Number(totalBenchPnl.toFixed(2)),
        variance_pct: Number(portfolioVariance.toFixed(1)),
        portfolio_sharpe: portfolioMetrics.sharpe_ratio,
        portfolio_sortino: portfolioMetrics.sortino_ratio,
        performance_rating: rating,
      },
      period: {
        month: currentMonth,
        year: currentYear,
        month_name: getMonthName(currentMonth),
      },
    };
  }, [calculateRiskMetrics]);

  return {
    calculateRiskMetrics,
    getRollingBenchmark,
    getPortfolioBenchmark,
  };
}

export default useBenchmarks;
