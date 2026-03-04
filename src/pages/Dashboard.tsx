import { useMemo } from "react";
import { format, parseISO, subDays } from "date-fns";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Target,
  Bot,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart3,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { useBots } from "@/context/BotContext";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LoginForm } from "@/components/auth/LoginForm";

const Dashboard = () => {
  const { user, isConfigured } = useAuth();
  const { bots, botAccounts, botTrades, backtestData, loading } = useBots();

  // Active accounts
  const activeAccounts = useMemo(() => {
    return botAccounts.filter(a => a.status === "active" || a.status === "evaluation");
  }, [botAccounts]);

  // Closed trades only
  const closedTrades = useMemo(() => {
    return botTrades.filter(t => t.status === "closed");
  }, [botTrades]);

  // Bot name map
  const botMap = useMemo(() => {
    const m = new Map<string, string>();
    bots.forEach(b => m.set(b.id, `${b.name} ${b.version}`));
    return m;
  }, [bots]);

  // Key metrics
  const metrics = useMemo(() => {
    const t = closedTrades;
    if (t.length === 0) {
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnl: 0,
        avgTrade: 0,
        profitFactor: 0,
      };
    }

    const wins = t.filter(x => (x.pnl || 0) > 0);
    const losses = t.filter(x => (x.pnl || 0) < 0);
    const grossProfit = wins.reduce((s, x) => s + (x.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, x) => s + (x.pnl || 0), 0));
    const totalPnl = t.reduce((s, x) => s + (x.pnl || 0), 0);
    const winRate = t.length > 0 ? (wins.length / t.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    const avgTrade = t.length > 0 ? totalPnl / t.length : 0;

    return {
      totalTrades: t.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      totalPnl,
      avgTrade,
      profitFactor,
    };
  }, [closedTrades]);

  // Total account value
  const totalAccountValue = useMemo(() => {
    return activeAccounts.reduce((sum, a) => sum + a.current_balance, 0);
  }, [activeAccounts]);

  // Equity curve from trades
  const equityCurve = useMemo(() => {
    if (closedTrades.length === 0) return [];
    const sorted = [...closedTrades].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const dayMap = new Map<string, number>();
    let cumPnl = 0;
    for (const t of sorted) {
      cumPnl += t.pnl || 0;
      const date = t.timestamp.slice(0, 10);
      dayMap.set(date, cumPnl);
    }
    return Array.from(dayMap.entries()).map(([date, pnl]) => ({
      date,
      pnl,
    }));
  }, [closedTrades]);

  // Recent trades
  const recentTrades = useMemo(() => {
    return [...closedTrades]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 8);
  }, [closedTrades]);

  // Bot performance summary
  const botPerformance = useMemo(() => {
    return bots.map(bot => {
      const trades = closedTrades.filter(t => t.bot_id === bot.id);
      const wins = trades.filter(t => (t.pnl || 0) > 0).length;
      const total = trades.length;
      const pnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
      const winRate = total > 0 ? (wins / total) * 100 : 0;
      const bt = backtestData.find(b => b.bot_id === bot.id);
      return {
        ...bot,
        trades: total,
        wins,
        pnl,
        winRate,
        hasBacktest: !!bt,
        backtestPnl: bt?.net_pnl || 0,
      };
    }).sort((a, b) => b.pnl - a.pnl);
  }, [bots, closedTrades, backtestData]);

  // Combined backtest stats
  const backtestStats = useMemo(() => {
    if (backtestData.length === 0) return null;
    return {
      totalTrades: backtestData.reduce((s, d) => s + d.total_trades, 0),
      netPnl: backtestData.reduce((s, d) => s + d.net_pnl, 0),
      winRate: backtestData.length > 0
        ? backtestData.reduce((s, d) => s + (d.win_count / d.total_trades) * 100, 0) / backtestData.length
        : 0,
    };
  }, [backtestData]);

  if (!isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-xl font-semibold">Supabase Not Configured</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Bot Tracker</h2>
          <p className="text-muted-foreground">Sign in to access collaborative bot tracking</p>
        </div>
        <LoginForm />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  const formatCurrency = (val: number) =>
    `${val >= 0 ? "+" : ""}$${Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {bots.length} bot{bots.length !== 1 ? "s" : ""} · {activeAccounts.length} active account{activeAccounts.length !== 1 ? "s" : ""} · {closedTrades.length} trades
        </p>
      </div>

      {/* Empty state */}
      {bots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bot className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Bots Yet</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Create your first bot to start tracking automated trading performance.
          </p>
          <Link to="/bots">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
              Create a Bot
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Top Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Account Value */}
            <div className="stat-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Wallet className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Account Value</span>
              </div>
              <p className="text-2xl font-semibold tabular-nums">
                ${totalAccountValue.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {activeAccounts.length} active account{activeAccounts.length !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Total P&L */}
            <div className="stat-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Live P&L</span>
              </div>
              <p className={cn(
                "text-2xl font-semibold tabular-nums",
                metrics.totalPnl >= 0 ? "text-success" : "text-destructive"
              )}>
                {formatCurrency(metrics.totalPnl)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.totalTrades} trades
              </p>
            </div>

            {/* Win Rate */}
            <div className="stat-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Target className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Win Rate</span>
              </div>
              <p className={cn(
                "text-2xl font-semibold tabular-nums",
                metrics.winRate >= 50 ? "text-success" : "text-destructive"
              )}>
                {metrics.winRate.toFixed(1)}%
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    metrics.winRate >= 50 ? "bg-success" : "bg-destructive"
                  )}
                  style={{ width: `${metrics.winRate}%` }}
                />
              </div>
            </div>

            {/* Profit Factor */}
            <div className="stat-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Profit Factor</span>
              </div>
              <p className={cn(
                "text-2xl font-semibold tabular-nums",
                metrics.profitFactor >= 1.5 ? "text-success" : metrics.profitFactor >= 1 ? "text-foreground" : "text-destructive"
              )}>
                {metrics.profitFactor === Infinity ? "∞" : metrics.profitFactor > 0 ? metrics.profitFactor.toFixed(2) : "-"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.profitFactor >= 1.5 ? "strong edge" : metrics.profitFactor >= 1 ? "breakeven+" : metrics.profitFactor > 0 ? "losing edge" : "no data"}
              </p>
            </div>
          </div>

          {/* Backtest Summary (if available) */}
          {backtestStats && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium">Backtest Benchmark</span>
                </div>
                <Link to="/bot-analytics" className="text-xs text-muted-foreground hover:text-foreground">
                  View Details →
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-3 text-center">
                <div>
                  <p className="text-lg font-semibold">{backtestStats.totalTrades.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Trades</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-success">${backtestStats.netPnl.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Net P&L</p>
                </div>
                <div>
                  <p className="text-lg font-semibold">{backtestStats.winRate.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">Avg Win Rate</p>
                </div>
              </div>
            </div>
          )}

          {/* Equity Curve */}
          {equityCurve.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Equity Curve</h3>
                  <p className="text-xs text-muted-foreground">Cumulative P&L from live trades</p>
                </div>
                <Link to="/bot-analytics" className="text-xs text-muted-foreground hover:text-foreground">
                  Full Analytics →
                </Link>
              </div>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.35} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                      tickFormatter={(v) => format(parseISO(v), "MMM d")}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                      tickFormatter={(v) => `$${v}`}
                      width={50}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload?.[0]) {
                          const pnl = payload[0].value as number;
                          return (
                            <div className="tooltip-card">
                              <p className="text-muted-foreground text-xs">
                                {format(parseISO(payload[0].payload.date), "MMM d, yyyy")}
                              </p>
                              <p className={cn(
                                "text-lg font-semibold tabular-nums",
                                pnl >= 0 ? "text-success" : "text-destructive"
                              )}>
                                {formatCurrency(pnl)}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="pnl"
                      stroke="hsl(var(--accent))"
                      strokeWidth={1.5}
                      fill="url(#eqGrad)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Bot Performance + Recent Trades */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Bot Performance */}
            <div className="stat-card">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Bot Performance</h3>
                  <p className="text-xs text-muted-foreground">Live results by bot</p>
                </div>
                <Link to="/bots" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  Manage <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="space-y-2">
                {botPerformance.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No bots configured
                  </p>
                ) : (
                  botPerformance.map((bot) => (
                    <Link
                      key={bot.id}
                      to={`/bots/${bot.id}`}
                      className="flex items-center gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:bg-secondary/50"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                        <Bot className="h-4 w-4 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{bot.name} {bot.version}</p>
                          <span className="text-xs text-muted-foreground">{bot.instrument}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {bot.trades} trades · {bot.winRate.toFixed(0)}% WR
                        </p>
                      </div>
                      <p className={cn(
                        "text-sm font-semibold tabular-nums",
                        bot.pnl >= 0 ? "text-success" : "text-destructive"
                      )}>
                        {formatCurrency(bot.pnl)}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Recent Trades */}
            <div className="stat-card">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Recent Trades</h3>
                  <p className="text-xs text-muted-foreground">Latest bot activity</p>
                </div>
                <Link to="/bot-trades" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  All Trades <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="space-y-2">
                {recentTrades.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No trades yet
                  </p>
                ) : (
                  recentTrades.map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
                    >
                      <div className={cn(
                        "flex h-6 w-6 items-center justify-center rounded",
                        trade.direction === "long" ? "bg-success/10" : "bg-destructive/10"
                      )}>
                        {trade.direction === "long" ? (
                          <TrendingUp className="h-3 w-3 text-success" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-destructive" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{trade.instrument}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {botMap.get(trade.bot_id) || "Unknown"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(trade.timestamp), "MMM d, HH:mm")}
                        </p>
                      </div>
                      <p className={cn(
                        "text-sm font-semibold tabular-nums",
                        (trade.pnl || 0) >= 0 ? "text-success" : "text-destructive"
                      )}>
                        {formatCurrency(trade.pnl || 0)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Active Accounts */}
          {activeAccounts.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Active Accounts</h3>
                </div>
                <Link to="/bot-accounts" className="text-xs text-muted-foreground hover:text-foreground">
                  Manage →
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activeAccounts.slice(0, 6).map((account) => (
                  <div key={account.id} className="stat-card !p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{account.account_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {account.prop_firm} · {account.status}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          ${account.current_balance.toLocaleString()}
                        </p>
                        <p className={cn(
                          "text-xs font-medium tabular-nums",
                          (account.current_balance - account.starting_balance) >= 0 ? "text-success" : "text-destructive"
                        )}>
                          {formatCurrency(account.current_balance - account.starting_balance)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
