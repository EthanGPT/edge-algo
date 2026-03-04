/**
 * PortfolioBenchmarkTable
 *
 * Multi-bot portfolio benchmark view showing combined performance
 * across all bots with weighted contributions.
 */

import { Briefcase, TrendingUp, TrendingDown, Equal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { PortfolioBenchmark } from '@/types/bots';

interface PortfolioBenchmarkTableProps {
  benchmark: PortfolioBenchmark | null;
  loading?: boolean;
}

export function PortfolioBenchmarkTable({ benchmark, loading }: PortfolioBenchmarkTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Portfolio Benchmark
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!benchmark || benchmark.bots.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Portfolio Benchmark
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Create bots with backtest data to see portfolio-level benchmarks.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { bots, combined, period } = benchmark;

  const formatCurrency = (val: number) =>
    `${val >= 0 ? '+' : ''}$${Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const formatPct = (val: number) =>
    `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;

  // Performance indicator
  const PerformanceIcon = combined.performance_rating === 'outperforming'
    ? TrendingUp
    : combined.performance_rating === 'underperforming'
      ? TrendingDown
      : Equal;

  const performanceColor = combined.performance_rating === 'outperforming'
    ? 'text-success'
    : combined.performance_rating === 'underperforming'
      ? 'text-destructive'
      : 'text-warning';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Portfolio Benchmark - {period.month_name} {period.year}
            </CardTitle>
            <CardDescription>
              Combined performance across {bots.length} bot{bots.length > 1 ? 's' : ''}
            </CardDescription>
          </div>
          <div className={cn('flex items-center gap-1 text-sm font-medium', performanceColor)}>
            <PerformanceIcon className="h-4 w-4" />
            {combined.performance_rating === 'outperforming' ? 'Outperforming' :
             combined.performance_rating === 'underperforming' ? 'Underperforming' : 'Meeting'}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Portfolio Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-accent/5 border border-accent/30">
            <p className="text-xs text-accent font-medium">Live P&L</p>
            <p className={cn('text-xl font-bold', combined.total_live_pnl >= 0 ? 'text-success' : 'text-destructive')}>
              {formatCurrency(combined.total_live_pnl)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground">Expected P&L</p>
            <p className="text-xl font-bold">
              {formatCurrency(combined.total_benchmark_pnl)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground">Variance</p>
            <p className={cn('text-xl font-bold', combined.variance_pct >= 0 ? 'text-success' : 'text-destructive')}>
              {formatPct(combined.variance_pct)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground">Portfolio Sharpe</p>
            <p className="text-xl font-bold">{combined.portfolio_sharpe.toFixed(2)}</p>
          </div>
        </div>

        {/* Bot Breakdown Table */}
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bot</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead className="text-right">Contracts</TableHead>
                <TableHead className="text-right">Live P&L</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bots.map(bot => (
                <TableRow key={bot.bot_id}>
                  <TableCell className="font-medium">{bot.bot_name}</TableCell>
                  <TableCell>
                    <span className="px-2 py-0.5 rounded text-xs bg-muted">
                      {bot.instrument}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {bot.contracts}
                  </TableCell>
                  <TableCell className={cn(
                    'text-right tabular-nums font-medium',
                    bot.live_pnl >= 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {formatCurrency(bot.live_pnl)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(bot.benchmark_pnl)}
                  </TableCell>
                  <TableCell className={cn(
                    'text-right tabular-nums font-medium',
                    bot.variance_pct >= 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {formatPct(bot.variance_pct)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Footer Note */}
        <p className="text-xs text-muted-foreground text-center">
          Benchmark values scaled to match each bot's current contract size
        </p>
      </CardContent>
    </Card>
  );
}

export default PortfolioBenchmarkTable;
