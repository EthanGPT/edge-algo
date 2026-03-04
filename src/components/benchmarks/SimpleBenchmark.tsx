/**
 * SimpleBenchmark - Clean backtest vs live comparison
 */

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { BotTrade, BotBacktestTrade, Bot } from '@/types/bots';

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

function BenchmarkTable({ backtest, live, title, contracts }: { backtest: Stats; live: Stats; title: string; contracts: number }) {
  const fmt = (v: number) => `$${Math.round(v).toLocaleString()}`;
  const pct = (v: number) => `${v.toFixed(1)}%`;
  const num = (v: number) => v.toFixed(2);

  // Scale backtest dollar values by contracts (backtest was at 1 contract)
  const scaledBacktest = {
    ...backtest,
    avgWin: backtest.avgWin * contracts,
    avgLoss: backtest.avgLoss * contracts,
    netPnl: backtest.netPnl * contracts,
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Backtest: {backtest.trades.toLocaleString()} trades @ {contracts}ct | Live: {live.trades} trades
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="py-2 px-4 text-left font-medium">Metric</th>
              <th className="py-2 px-4 text-center font-medium">Backtest</th>
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
            <StatsRow label="Net P&L" backtest={scaledBacktest.netPnl} live={live.netPnl} format={fmt} />
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function SimpleBenchmark({ bots, liveTrades, backtestTrades }: SimpleBenchmarkProps) {
  const [contracts, setContracts] = useState(1);

  // Get unique instruments
  const instruments = useMemo(() => {
    const set = new Set(bots.map(b => b.instrument));
    return Array.from(set).sort();
  }, [bots]);

  // Calculate combined stats
  const combinedStats = useMemo(() => {
    const btTrades = backtestTrades.map(t => ({ pnl: t.pnl_usd || 0 }));
    const ltTrades = liveTrades.filter(t => t.status === 'closed').map(t => ({ pnl: t.pnl || 0 }));
    return {
      backtest: calculateStats(btTrades),
      live: calculateStats(ltTrades),
    };
  }, [backtestTrades, liveTrades]);

  // Calculate per-instrument stats
  const instrumentStats = useMemo(() => {
    return instruments.map(instrument => {
      const botIds = bots.filter(b => b.instrument === instrument).map(b => b.id);
      const btTrades = backtestTrades
        .filter(t => botIds.includes(t.bot_id))
        .map(t => ({ pnl: t.pnl_usd || 0 }));
      const ltTrades = liveTrades
        .filter(t => botIds.includes(t.bot_id) && t.status === 'closed')
        .map(t => ({ pnl: t.pnl || 0 }));

      return {
        instrument,
        backtest: calculateStats(btTrades),
        live: calculateStats(ltTrades),
      };
    });
  }, [instruments, bots, backtestTrades, liveTrades]);

  if (backtestTrades.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No backtest data loaded. Run the import script first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Contract Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Backtest vs Live Benchmark</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Scale backtest to:</span>
          <Select value={contracts.toString()} onValueChange={(v) => setContracts(parseInt(v))}>
            <SelectTrigger className="w-24">
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

      <Tabs defaultValue="combined" className="space-y-4">
        <TabsList>
          <TabsTrigger value="combined">Combined</TabsTrigger>
          {instruments.map(i => (
            <TabsTrigger key={i} value={i}>{i}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="combined">
          <BenchmarkTable
            title="All Instruments Combined"
            backtest={combinedStats.backtest}
            live={combinedStats.live}
            contracts={contracts}
          />
        </TabsContent>

        {instrumentStats.map(({ instrument, backtest, live }) => (
          <TabsContent key={instrument} value={instrument}>
            <BenchmarkTable
              title={instrument}
              backtest={backtest}
              live={live}
              contracts={contracts}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default SimpleBenchmark;
