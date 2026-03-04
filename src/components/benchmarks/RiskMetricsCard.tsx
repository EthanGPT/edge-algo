/**
 * RiskMetricsCard
 *
 * Displays risk-adjusted performance metrics with live vs benchmark comparison.
 * Shows Sharpe, Sortino, Calmar ratios and other risk metrics.
 */

import { Shield, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { RiskMetrics } from '@/types/bots';

interface RiskMetricsCardProps {
  liveMetrics: RiskMetrics;
  benchmarkMetrics?: RiskMetrics;
  title?: string;
  showComparison?: boolean;
}

const METRIC_INFO: Record<keyof RiskMetrics, { label: string; description: string; higherIsBetter: boolean; format?: (v: number) => string }> = {
  sharpe_ratio: {
    label: 'Sharpe Ratio',
    description: 'Risk-adjusted return (excess return / volatility). Higher is better. >1 is good, >2 is excellent.',
    higherIsBetter: true,
  },
  sortino_ratio: {
    label: 'Sortino Ratio',
    description: 'Like Sharpe but only penalizes downside volatility. Higher is better. >2 is good.',
    higherIsBetter: true,
  },
  calmar_ratio: {
    label: 'Calmar Ratio',
    description: 'Annualized return / Max Drawdown. Higher means better return per unit of drawdown risk.',
    higherIsBetter: true,
  },
  max_drawdown: {
    label: 'Max Drawdown',
    description: 'Largest peak-to-trough decline in equity.',
    higherIsBetter: false,
    format: (v) => `$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
  },
  max_drawdown_pct: {
    label: 'Max DD %',
    description: 'Maximum drawdown as percentage of peak equity.',
    higherIsBetter: false,
    format: (v) => `${v.toFixed(1)}%`,
  },
  avg_monthly_return: {
    label: 'Avg Monthly',
    description: 'Average monthly P&L.',
    higherIsBetter: true,
    format: (v) => `${v >= 0 ? '+' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
  },
  monthly_std_dev: {
    label: 'Monthly Volatility',
    description: 'Standard deviation of monthly returns. Lower means more consistent.',
    higherIsBetter: false,
    format: (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
  },
  downside_deviation: {
    label: 'Downside Dev',
    description: 'Volatility of negative returns only. Lower is better.',
    higherIsBetter: false,
    format: (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
  },
  win_rate: {
    label: 'Win Rate',
    description: 'Percentage of winning trades.',
    higherIsBetter: true,
    format: (v) => `${v.toFixed(1)}%`,
  },
  profit_factor: {
    label: 'Profit Factor',
    description: 'Gross profit / Gross loss. >1.5 is good, >2 is excellent.',
    higherIsBetter: true,
  },
  expectancy: {
    label: 'Expectancy',
    description: 'Expected profit per trade on average.',
    higherIsBetter: true,
    format: (v) => `${v >= 0 ? '+' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
  },
  recovery_factor: {
    label: 'Recovery Factor',
    description: 'Net profit / Max Drawdown. Shows how efficiently profits recover from drawdowns.',
    higherIsBetter: true,
  },
};

// Key metrics to display prominently
const PRIMARY_METRICS: (keyof RiskMetrics)[] = [
  'sharpe_ratio',
  'sortino_ratio',
  'calmar_ratio',
  'profit_factor',
];

const SECONDARY_METRICS: (keyof RiskMetrics)[] = [
  'win_rate',
  'expectancy',
  'max_drawdown',
  'recovery_factor',
];

export function RiskMetricsCard({
  liveMetrics,
  benchmarkMetrics,
  title = 'Risk-Adjusted Metrics',
  showComparison = true,
}: RiskMetricsCardProps) {
  const formatValue = (key: keyof RiskMetrics, value: number) => {
    const info = METRIC_INFO[key];
    if (info.format) return info.format(value);
    return value.toFixed(2);
  };

  const getComparisonIndicator = (key: keyof RiskMetrics, liveValue: number, benchValue: number) => {
    const info = METRIC_INFO[key];
    const isBetter = info.higherIsBetter ? liveValue >= benchValue : liveValue <= benchValue;
    const diff = liveValue - benchValue;
    const pctDiff = benchValue !== 0 ? (diff / Math.abs(benchValue)) * 100 : 0;

    return {
      isBetter,
      diff,
      pctDiff,
      icon: isBetter ? TrendingUp : TrendingDown,
      color: isBetter ? 'text-success' : 'text-destructive',
    };
  };

  const renderMetric = (key: keyof RiskMetrics, isPrimary: boolean = false) => {
    const info = METRIC_INFO[key];
    const liveValue = liveMetrics[key];
    const benchValue = benchmarkMetrics?.[key];
    const comparison = benchValue !== undefined ? getComparisonIndicator(key, liveValue, benchValue) : null;

    return (
      <TooltipProvider key={key}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              'p-3 rounded-lg bg-muted/30 cursor-help',
              isPrimary && 'border border-border/50'
            )}>
              <p className="text-xs text-muted-foreground mb-1">{info.label}</p>
              <div className="flex items-baseline gap-2">
                <span className={cn(
                  'font-semibold tabular-nums',
                  isPrimary ? 'text-xl' : 'text-lg'
                )}>
                  {formatValue(key, liveValue)}
                </span>
                {showComparison && comparison && (
                  <span className={cn('text-xs flex items-center gap-0.5', comparison.color)}>
                    <comparison.icon className="h-3 w-3" />
                    {comparison.pctDiff >= 0 ? '+' : ''}{comparison.pctDiff.toFixed(0)}%
                  </span>
                )}
              </div>
              {showComparison && benchValue !== undefined && (
                <p className="text-xs text-muted-foreground mt-1">
                  vs {formatValue(key, benchValue)}
                </p>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium">{info.label}</p>
            <p className="text-xs text-muted-foreground">{info.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primary Metrics - Large Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {PRIMARY_METRICS.map(key => renderMetric(key, true))}
        </div>

        {/* Secondary Metrics - Smaller Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {SECONDARY_METRICS.map(key => renderMetric(key, false))}
        </div>
      </CardContent>
    </Card>
  );
}

export default RiskMetricsCard;
