/**
 * RollingBenchmarkCard
 *
 * Displays live vs benchmark comparison for the current month.
 * Shows how current month's live performance compares to historical
 * same-month averages from backtest data.
 */

import { TrendingUp, TrendingDown, Equal, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { RollingBenchmarkComparison } from '@/types/bots';

interface RollingBenchmarkCardProps {
  benchmark: RollingBenchmarkComparison | null;
  loading?: boolean;
}

export function RollingBenchmarkCard({ benchmark, loading }: RollingBenchmarkCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Rolling Monthly Benchmark
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-1/2" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-20 bg-muted rounded" />
              <div className="h-20 bg-muted rounded" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!benchmark) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Rolling Monthly Benchmark
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No backtest data available. Import backtest trades to enable monthly benchmarks.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { live, benchmark: bench, variance, month_name, contract_scale_factor } = benchmark;

  // Performance indicator
  const PerformanceIcon = variance.performance_rating === 'outperforming'
    ? TrendingUp
    : variance.performance_rating === 'underperforming'
      ? TrendingDown
      : Equal;

  const performanceColor = variance.performance_rating === 'outperforming'
    ? 'text-success'
    : variance.performance_rating === 'underperforming'
      ? 'text-destructive'
      : 'text-warning';

  const formatCurrency = (val: number) =>
    `${val >= 0 ? '+' : ''}$${Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {month_name} Benchmark
          </CardTitle>
          <div className={cn('flex items-center gap-1 text-sm font-medium', performanceColor)}>
            <PerformanceIcon className="h-4 w-4" />
            {variance.performance_rating === 'outperforming' ? 'Outperforming' :
             variance.performance_rating === 'underperforming' ? 'Underperforming' : 'Meeting'}
          </div>
        </div>
        {contract_scale_factor !== 1 && (
          <p className="text-xs text-muted-foreground">
            Benchmark scaled {contract_scale_factor.toFixed(2)}x to match live contract size
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live vs Benchmark Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Live Performance */}
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
            <p className="text-xs text-accent font-medium mb-2">Live (This Month)</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Trades</span>
                <span className="text-sm font-semibold">{live.trades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Net P&L</span>
                <span className={cn('text-sm font-semibold', live.net_pnl >= 0 ? 'text-success' : 'text-destructive')}>
                  {formatCurrency(live.net_pnl)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Win Rate</span>
                <span className="text-sm font-semibold">{live.win_rate.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Avg/Trade</span>
                <span className={cn('text-sm font-semibold', live.avg_per_trade >= 0 ? 'text-success' : 'text-destructive')}>
                  {formatCurrency(live.avg_per_trade)}
                </span>
              </div>
            </div>
          </div>

          {/* Benchmark */}
          <div className="rounded-lg border border-border/50 bg-secondary/30 p-3">
            <p className="text-xs text-muted-foreground mb-2">
              Expected ({bench.years_sampled}yr avg)
            </p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Trades</span>
                <span className="text-sm font-medium">{bench.trades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Net P&L</span>
                <span className="text-sm font-medium">{formatCurrency(bench.net_pnl)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Win Rate</span>
                <span className="text-sm font-medium">{bench.win_rate.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Avg/Trade</span>
                <span className="text-sm font-medium">{formatCurrency(bench.avg_per_trade)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Variance Summary */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div className="text-sm">
            <span className="text-muted-foreground">P&L vs Expected: </span>
            <span className={cn('font-semibold', variance.pnl_vs_expected >= 0 ? 'text-success' : 'text-destructive')}>
              {variance.pnl_vs_expected >= 0 ? '+' : ''}{variance.pnl_vs_expected.toFixed(1)}%
            </span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Win Rate Diff: </span>
            <span className={cn('font-semibold', variance.win_rate_diff >= 0 ? 'text-success' : 'text-destructive')}>
              {variance.win_rate_diff >= 0 ? '+' : ''}{variance.win_rate_diff.toFixed(1)}pp
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default RollingBenchmarkCard;
