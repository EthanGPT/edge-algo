/**
 * SimpleBenchmark - Clean backtest vs live comparison
 * Per-instrument contract scaling
 */

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { BotTrade, BotBacktestTrade, Bot } from '@/types/bots';

// Backtest was run at these contract sizes
const BACKTEST_CONTRACTS: Record<string, number> = {
  MNQ: 4,
  MES: 4,
  MGC: 2,
  ZB: 2,
  ZN: 2,
  '6E': 1,
  '6J': 1,
};

interface SimpleBenchmarkProps {
  bots: Bot[];
  liveTrades: BotTrade[];
  backtestTrades: BotBacktestTrade[];
}

interface Stats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  netPnl: number;
  sharpe: number;
  sortino: number;
}

function calculateStats(trades: { pnl: number }[]): Stats {
  if (trades.length === 0) {
    return { trades: 0, wins: 0, losses: 0, winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0, netPnl: 0, sharpe: 0, sortino: 0 };
  }

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const winRate = (wins.length / trades.length) * 100;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : wins.length > 0 ? 999 : 0;

  // Sharpe & Sortino (simplified - using trade returns)
  const returns = trades.map(t => t.pnl);
  const avgReturn = netPnl / trades.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / trades.length;
  const stdDev = Math.sqrt(variance);
  const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  // Sortino - only downside deviation
  const negReturns = returns.filter(r => r < 0);
  const downsideVar = negReturns.length > 0
    ? negReturns.reduce((s, r) => s + Math.pow(r, 2), 0) / negReturns.length
    : 0;
  const downsideDev = Math.sqrt(downsideVar);
  const sortino = downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(252) : 0;

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgWin,
    avgLoss,
    profitFactor: Math.min(profitFactor, 99),
    netPnl,
    sharpe,
    sortino,
  };
}

function StatsRow({ label, backtest, live, format, higherIsBetter = true }: {
  label: string;
  backtest: number;
  live: number;
  format: (v: number) => string;
  higherIsBetter?: boolean;
}) {
  const diff = live - backtest;
  const isBetter = higherIsBetter ? diff >= 0 : diff <= 0;

  return (
    <tr className="border-b border-border/50">
      <td className="py-3 px-4 font-medium">{label}</td>
      <td className="py-3 px-4 text-center tabular-nums">{format(backtest)}</td>
      <td className="py-3 px-4 text-center tabular-nums">{format(live)}</td>
      <td className={cn(
        "py-3 px-4 text-center tabular-nums font-medium",
        live === 0 && backtest === 0 ? "text-muted-foreground" :
        isBetter ? "text-success" : "text-destructive"
      )}>
        {live === 0 && backtest === 0 ? "-" :
         diff >= 0 ? `+${format(Math.abs(diff))}` : `-${format(Math.abs(diff))}`}
      </td>
    </tr>
  );
}

interface BenchmarkTableProps {
  backtest: Stats;
  live: Stats;
  title: string;
  backtestContracts: number;
  liveContracts: number;
  onContractsChange: (v: number) => void;
}

function BenchmarkTable({ backtest, live, title, backtestContracts, liveContracts, onContractsChange }: BenchmarkTableProps) {
  const fmt = (v: number) => `$${Math.round(v).toLocaleString()}`;
  const pct = (v: number) => `${v.toFixed(1)}%`;
  const num = (v: number) => v.toFixed(2);

  // Scale backtest dollar values: backtest was at X contracts, user wants Y contracts
  // Scale factor = liveContracts / backtestContracts
  const scale = liveContracts / backtestContracts;
  const scaledBacktest = {
    ...backtest,
    avgWin: backtest.avgWin * scale,
    avgLoss: backtest.avgLoss * scale,
    netPnl: backtest.netPnl * scale,
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Backtest: {backtest.trades.toLocaleString()} trades @ {backtestContracts}ct | Live: {live.trades} trades
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Your contracts:</span>
            <Select value={liveContracts.toString()} onValueChange={(v) => onContractsChange(parseInt(v))}>
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <SelectItem key={n} value={n.toString()}>{n} ct</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="py-2 px-4 text-left font-medium">Metric</th>
              <th className="py-2 px-4 text-center font-medium">Backtest ({liveContracts}ct)</th>
              <th className="py-2 px-4 text-center font-medium">Live</th>
              <th className="py-2 px-4 text-center font-medium">Diff</th>
            </tr>
          </thead>
          <tbody>
            <StatsRow label="Win Rate" backtest={backtest.winRate} live={live.winRate} format={pct} />
            <StatsRow label="Avg Win" backtest={scaledBacktest.avgWin} live={live.avgWin} format={fmt} />
            <StatsRow label="Avg Loss" backtest={scaledBacktest.avgLoss} live={live.avgLoss} format={fmt} higherIsBetter={false} />
            <StatsRow label="Profit Factor" backtest={backtest.profitFactor} live={live.profitFactor} format={num} />
            <StatsRow label="Sharpe" backtest={backtest.sharpe} live={live.sharpe} format={num} />
            <StatsRow label="Sortino" backtest={backtest.sortino} live={live.sortino} format={num} />
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function SimpleBenchmark({ bots, liveTrades, backtestTrades }: SimpleBenchmarkProps) {
  // Per-instrument contract settings (user's live contracts)
  const [contractSettings, setContractSettings] = useState<Record<string, number>>({
    MNQ: 2,
    MES: 2,
    MGC: 2,
    ZB: 1,
    ZN: 1,
    '6E': 1,
    '6J': 1,
  });

  // Get unique instruments
  const instruments = useMemo(() => {
    const set = new Set(bots.map(b => b.instrument));
    return Array.from(set).sort();
  }, [bots]);

  // Calculate per-instrument stats
  const instrumentStats = useMemo(() => {
    console.log('[SimpleBenchmark] Total backtestTrades received:', backtestTrades.length);
    console.log('[SimpleBenchmark] Instruments from bots:', instruments);
    if (backtestTrades.length > 0) {
      const sampleTrade = backtestTrades[0];
      console.log('[SimpleBenchmark] Sample trade:', sampleTrade);
      const uniqueInstruments = [...new Set(backtestTrades.map(t => t.instrument))];
      console.log('[SimpleBenchmark] Unique instruments in backtest data:', uniqueInstruments);
    }

    return instruments.map(instrument => {
      const botIds = bots.filter(b => b.instrument === instrument).map(b => b.id);
      // Filter backtest trades by instrument directly (not bot_id) for reliability
      const btTrades = backtestTrades
        .filter(t => t.instrument === instrument)
        .map(t => ({ pnl: t.pnl_usd || 0 }));
      console.log(`[SimpleBenchmark] ${instrument}: ${btTrades.length} backtest trades`);
      const ltTrades = liveTrades
        .filter(t => botIds.includes(t.bot_id) && t.status === 'closed')
        .map(t => ({ pnl: t.pnl || 0 }));

      return {
        instrument,
        backtest: calculateStats(btTrades),
        live: calculateStats(ltTrades),
        backtestContracts: BACKTEST_CONTRACTS[instrument] || 1,
      };
    });
  }, [instruments, bots, backtestTrades, liveTrades]);

  // Calculate combined stats (weighted by contract scaling)
  const combinedStats = useMemo(() => {
    // For combined, we need to scale each instrument's backtest to user's contracts first
    let scaledBtPnls: number[] = [];
    let livePnls: number[] = [];

    instrumentStats.forEach(({ instrument, backtestContracts }) => {
      const botIds = bots.filter(b => b.instrument === instrument).map(b => b.id);
      const userContracts = contractSettings[instrument] || 1;
      const scale = userContracts / backtestContracts;

      // Scale backtest PnLs - filter by instrument directly
      backtestTrades
        .filter(t => t.instrument === instrument)
        .forEach(t => scaledBtPnls.push((t.pnl_usd || 0) * scale));

      // Live PnLs (already at user's contract size)
      liveTrades
        .filter(t => botIds.includes(t.bot_id) && t.status === 'closed')
        .forEach(t => livePnls.push(t.pnl || 0));
    });

    return {
      backtest: calculateStats(scaledBtPnls.map(pnl => ({ pnl }))),
      live: calculateStats(livePnls.map(pnl => ({ pnl }))),
    };
  }, [instrumentStats, bots, backtestTrades, liveTrades, contractSettings]);

  const updateContracts = (instrument: string, value: number) => {
    setContractSettings(prev => ({ ...prev, [instrument]: value }));
  };

  if (backtestTrades.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No backtest data loaded. Run the import script first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Backtest vs Live Benchmark</h3>
        <p className="text-sm text-muted-foreground">Set your contracts per instrument</p>
      </div>

      <Tabs defaultValue="combined" className="space-y-4">
        <TabsList>
          <TabsTrigger value="combined">Combined</TabsTrigger>
          {instruments.map(i => (
            <TabsTrigger key={i} value={i}>{i}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="combined">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All Instruments Combined</CardTitle>
              <p className="text-xs text-muted-foreground">
                Backtest scaled to your contract sizes | Live: {combinedStats.live.trades} trades
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="py-2 px-4 text-left font-medium">Metric</th>
                    <th className="py-2 px-4 text-center font-medium">Backtest (scaled)</th>
                    <th className="py-2 px-4 text-center font-medium">Live</th>
                    <th className="py-2 px-4 text-center font-medium">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  <StatsRow label="Win Rate" backtest={combinedStats.backtest.winRate} live={combinedStats.live.winRate} format={(v) => `${v.toFixed(1)}%`} />
                  <StatsRow label="Avg Win" backtest={combinedStats.backtest.avgWin} live={combinedStats.live.avgWin} format={(v) => `$${Math.round(v).toLocaleString()}`} />
                  <StatsRow label="Avg Loss" backtest={combinedStats.backtest.avgLoss} live={combinedStats.live.avgLoss} format={(v) => `$${Math.round(v).toLocaleString()}`} higherIsBetter={false} />
                  <StatsRow label="Profit Factor" backtest={combinedStats.backtest.profitFactor} live={combinedStats.live.profitFactor} format={(v) => v.toFixed(2)} />
                  <StatsRow label="Sharpe" backtest={combinedStats.backtest.sharpe} live={combinedStats.live.sharpe} format={(v) => v.toFixed(2)} />
                  <StatsRow label="Sortino" backtest={combinedStats.backtest.sortino} live={combinedStats.live.sortino} format={(v) => v.toFixed(2)} />
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Contract settings summary */}
          <div className="mt-4 p-3 rounded-lg bg-muted/30 text-sm">
            <p className="font-medium mb-2">Your contract settings:</p>
            <div className="flex flex-wrap gap-3">
              {instruments.map(i => (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-muted-foreground">{i}:</span>
                  <Select
                    value={(contractSettings[i] || 1).toString()}
                    onValueChange={(v) => updateContracts(i, parseInt(v))}
                  >
                    <SelectTrigger className="w-16 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <SelectItem key={n} value={n.toString()}>{n}ct</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">(bt: {BACKTEST_CONTRACTS[i] || 1})</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {instrumentStats.map(({ instrument, backtest, live, backtestContracts }) => (
          <TabsContent key={instrument} value={instrument}>
            <BenchmarkTable
              title={instrument}
              backtest={backtest}
              live={live}
              backtestContracts={backtestContracts}
              liveContracts={contractSettings[instrument] || 1}
              onContractsChange={(v) => updateContracts(instrument, v)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default SimpleBenchmark;
