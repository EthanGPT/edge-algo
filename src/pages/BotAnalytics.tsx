import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  format,
  parseISO,
  subDays,
  getDay,
  startOfYear,
} from "date-fns";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  History,
  Bot,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useBots } from "@/context/BotContext";
import { useAuth } from "@/context/AuthContext";
import { SimpleBenchmark } from "@/components/benchmarks";
import { TradovateConnect } from "@/components/broker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LoginForm } from "@/components/auth/LoginForm";

type DateRange = "all" | "ytd" | "90d" | "30d" | "7d";
type InstrumentFilter = "all" | "MNQ" | "MES" | "MGC";

const COLORS = {
  profit: "hsl(var(--success))",
  loss: "hsl(var(--destructive))",
  neutral: "hsl(var(--muted-foreground))",
  accent: "hsl(var(--accent))",
  primary: "hsl(var(--primary))",
};

const PIE_COLORS = ["#10b981", "#ef4444", "#6b7280", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function BotAnalytics() {
  const { user, isConfigured } = useAuth();
  const { bots, botTrades, backtestTrades, backtestData, loading } = useBots();
  const [searchParams] = useSearchParams();
  const botIdParam = searchParams.get("bot");

  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [selectedBot, setSelectedBot] = useState<string>(botIdParam || "all");
  const [instrumentFilter, setInstrumentFilter] = useState<InstrumentFilter>("all");

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
          <h2 className="text-2xl font-semibold mb-2">Bot Analytics</h2>
          <p className="text-muted-foreground">Sign in to access collaborative bot tracking</p>
        </div>
        <LoginForm />
      </div>
    );
  }

  // Filter trades by date range, bot, and instrument
  const filteredTrades = useMemo(() => {
    let result = botTrades.filter(t => t.status === 'closed');

    if (selectedBot !== "all") {
      result = result.filter(t => t.bot_id === selectedBot);
    }

    // Filter by instrument
    if (instrumentFilter !== "all") {
      result = result.filter(t => t.instrument === instrumentFilter);
    }

    if (dateRange !== "all") {
      const now = new Date();
      let startDate: Date;
      switch (dateRange) {
        case "ytd": startDate = startOfYear(now); break;
        case "90d": startDate = subDays(now, 90); break;
        case "30d": startDate = subDays(now, 30); break;
        case "7d": startDate = subDays(now, 7); break;
        default: return result;
      }
      const startStr = format(startDate, "yyyy-MM-dd");
      result = result.filter(t => t.timestamp >= startStr);
    }
    return result;
  }, [botTrades, dateRange, selectedBot, instrumentFilter]);

  // Filter backtest data by instrument
  const filteredBacktest = useMemo(() => {
    if (instrumentFilter === "all") {
      return backtestData;
    }
    // Find bots that match the instrument
    const matchingBotIds = bots.filter(b => b.instrument === instrumentFilter).map(b => b.id);
    return backtestData.filter(bt => matchingBotIds.includes(bt.bot_id));
  }, [backtestData, bots, instrumentFilter]);

  // Combined backtest stats for instrument filter
  const combinedBacktestStats = useMemo(() => {
    const data = filteredBacktest;
    if (data.length === 0) return null;

    // Get contract sizes for display
    const contractSizes = data.map(d => d.contract_size);
    const minContracts = Math.min(...contractSizes);
    const maxContracts = Math.max(...contractSizes);
    const contractDisplay = minContracts === maxContracts
      ? `${minContracts} contracts`
      : `${minContracts}-${maxContracts} contracts`;

    return {
      total_trades: data.reduce((s, d) => s + d.total_trades, 0),
      win_count: data.reduce((s, d) => s + d.win_count, 0),
      loss_count: data.reduce((s, d) => s + d.loss_count, 0),
      net_pnl: data.reduce((s, d) => s + d.net_pnl, 0),
      max_drawdown: Math.max(...data.map(d => d.max_drawdown)),
      avg_winner: data.length > 0 ? data.reduce((s, d) => s + d.avg_winner, 0) / data.length : 0,
      avg_loser: data.length > 0 ? data.reduce((s, d) => s + d.avg_loser, 0) / data.length : 0,
      period_start: data.length > 0 ? data.reduce((a, b) => a.period_start < b.period_start ? a : b).period_start : '',
      period_end: data.length > 0 ? data.reduce((a, b) => a.period_end > b.period_end ? a : b).period_end : '',
      contractDisplay,
    };
  }, [filteredBacktest]);

  // Bot name lookup
  const botMap = useMemo(() => {
    const m = new Map<string, { name: string; instrument: string; default_contracts: number }>();
    bots.forEach(b => m.set(b.id, { name: `${b.name} ${b.version}`, instrument: b.instrument, default_contracts: b.default_contracts }));
    return m;
  }, [bots]);

  // Key Metrics
  const metrics = useMemo(() => {
    const t = filteredTrades;
    if (t.length === 0) {
      return {
        totalTrades: 0, wins: 0, losses: 0,
        winRate: 0, profitFactor: 0, expectancy: 0,
        totalPnl: 0, grossProfit: 0, grossLoss: 0,
        avgWin: 0, avgLoss: 0, avgTrade: 0,
        largestWin: 0, largestLoss: 0,
        maxConsecWins: 0, maxConsecLosses: 0,
      };
    }

    const wins = t.filter(x => (x.pnl || 0) > 0);
    const losses = t.filter(x => (x.pnl || 0) < 0);

    const grossProfit = wins.reduce((s, x) => s + (x.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, x) => s + (x.pnl || 0), 0));
    const totalPnl = t.reduce((s, x) => s + (x.pnl || 0), 0);

    const winRate = t.length > 0 ? (wins.length / t.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const avgTrade = t.length > 0 ? totalPnl / t.length : 0;

    const lossRate = losses.length / t.length;
    const expectancy = (winRate / 100 * avgWin) - (lossRate * avgLoss);

    const largestWin = wins.length > 0 ? Math.max(...wins.map(x => x.pnl || 0)) : 0;
    const largestLoss = losses.length > 0 ? Math.min(...losses.map(x => x.pnl || 0)) : 0;

    // Max consecutive
    let maxConsecWins = 0, maxConsecLosses = 0, consecWins = 0, consecLosses = 0;
    const sorted = [...t].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (const trade of sorted) {
      if ((trade.pnl || 0) > 0) {
        consecWins++; consecLosses = 0;
        maxConsecWins = Math.max(maxConsecWins, consecWins);
      } else if ((trade.pnl || 0) < 0) {
        consecLosses++; consecWins = 0;
        maxConsecLosses = Math.max(maxConsecLosses, consecLosses);
      } else {
        consecWins = 0; consecLosses = 0;
      }
    }

    return {
      totalTrades: t.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      profitFactor,
      expectancy,
      totalPnl,
      grossProfit,
      grossLoss,
      avgWin,
      avgLoss,
      avgTrade,
      largestWin,
      largestLoss,
      maxConsecWins,
      maxConsecLosses,
    };
  }, [filteredTrades]);

  // Monthly P&L
  const monthlyData = useMemo(() => {
    const map = new Map<string, { pnl: number; trades: number; wins: number }>();
    filteredTrades.forEach(t => {
      const month = t.timestamp.slice(0, 7);
      const existing = map.get(month) || { pnl: 0, trades: 0, wins: 0 };
      existing.pnl += t.pnl || 0;
      existing.trades++;
      if ((t.pnl || 0) > 0) existing.wins++;
      map.set(month, existing);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({
        month: format(parseISO(month + "-01"), "MMM yy"),
        pnl: data.pnl,
        trades: data.trades,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
      }));
  }, [filteredTrades]);

  // Day of Week
  const dayOfWeekData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const map = new Map<number, { pnl: number; trades: number; wins: number }>();
    for (let i = 0; i < 7; i++) map.set(i, { pnl: 0, trades: 0, wins: 0 });
    filteredTrades.forEach(t => {
      const day = getDay(new Date(t.timestamp));
      const existing = map.get(day)!;
      existing.pnl += t.pnl || 0;
      existing.trades++;
      if ((t.pnl || 0) > 0) existing.wins++;
    });
    return Array.from(map.entries()).map(([day, data]) => ({
      day: days[day],
      pnl: data.pnl,
      trades: data.trades,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
    }));
  }, [filteredTrades]);

  // Equity Curve
  const equityCurve = useMemo(() => {
    const sorted = [...filteredTrades].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let cumPnl = 0;
    return sorted.map((t, i) => {
      cumPnl += t.pnl || 0;
      return { trade: i + 1, date: t.timestamp, pnl: cumPnl };
    });
  }, [filteredTrades]);

  // Direction Analysis
  const directionData = useMemo(() => {
    const long = filteredTrades.filter(t => t.direction === "long");
    const short = filteredTrades.filter(t => t.direction === "short");
    const calc = (trades: typeof filteredTrades) => {
      const wins = trades.filter(t => (t.pnl || 0) > 0);
      return {
        trades: trades.length,
        pnl: trades.reduce((s, t) => s + (t.pnl || 0), 0),
        winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
        avgPnl: trades.length > 0 ? trades.reduce((s, t) => s + (t.pnl || 0), 0) / trades.length : 0,
      };
    };
    return [
      { direction: "Long", ...calc(long) },
      { direction: "Short", ...calc(short) },
    ];
  }, [filteredTrades]);

  // Drawdown
  const drawdownData = useMemo(() => {
    const sorted = [...filteredTrades].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let cumPnl = 0;
    let peak = 0;
    let maxDD = 0;
    return sorted.map((t, i) => {
      cumPnl += t.pnl || 0;
      peak = Math.max(peak, cumPnl);
      const drawdown = peak - cumPnl;
      maxDD = Math.max(maxDD, drawdown);
      return { trade: i + 1, equity: cumPnl, peak, drawdown: -drawdown };
    });
  }, [filteredTrades]);

  const maxDrawdown = useMemo(() => {
    return Math.abs(Math.min(...drawdownData.map(d => d.drawdown), 0));
  }, [drawdownData]);

  // Win/Loss Distribution
  const resultDistribution = useMemo(() => [
    { name: "Wins", value: metrics.wins, color: COLORS.profit },
    { name: "Losses", value: metrics.losses, color: COLORS.loss },
  ].filter(d => d.value > 0), [metrics]);

  const formatCurrency = (val: number) =>
    `${val >= 0 ? "+" : ""}$${Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  // Show empty state if no bots exist
  if (bots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Bot className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Bots Configured</h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          Create a bot with backtest data to see performance analytics.
        </p>
        <Link to="/bots">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="mr-2 h-4 w-4" />
            Create a Bot
          </Button>
        </Link>
      </div>
    );
  }

  // Show backtest-only view if no live trades but have backtest data
  if (botTrades.filter(t => t.status === 'closed').length === 0 && combinedBacktestStats) {
    const winRate = combinedBacktestStats.total_trades > 0
      ? (combinedBacktestStats.win_count / combinedBacktestStats.total_trades) * 100
      : 0;
    const profitFactor = combinedBacktestStats.avg_loser > 0
      ? combinedBacktestStats.avg_winner / combinedBacktestStats.avg_loser
      : 0;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Bot Analytics</h1>
            <p className="page-subtitle">Backtest Results {instrumentFilter !== 'all' ? `- ${instrumentFilter}` : '- Combined'}</p>
          </div>
          <div className="flex gap-3">
            <Select value={instrumentFilter} onValueChange={(v) => setInstrumentFilter(v as InstrumentFilter)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Combined</SelectItem>
                <SelectItem value="MNQ">MNQ</SelectItem>
                <SelectItem value="MES">MES</SelectItem>
                <SelectItem value="MGC">MGC</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Backtest Stats */}
        <div className="rounded-lg border border-accent/50 bg-accent/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Backtest Performance</h3>
              <p className="text-sm text-accent font-medium">{combinedBacktestStats.contractDisplay}</p>
            </div>
            <span className="text-sm text-muted-foreground">
              {format(new Date(combinedBacktestStats.period_start), 'MMM yyyy')} - {format(new Date(combinedBacktestStats.period_end), 'MMM yyyy')}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <p className="text-3xl font-bold">{combinedBacktestStats.total_trades.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Trades</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <p className="text-3xl font-bold text-success">${combinedBacktestStats.net_pnl.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Net P&L</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <p className={cn("text-3xl font-bold", winRate >= 50 ? "text-success" : "text-destructive")}>{winRate.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">Win Rate</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <p className={cn("text-3xl font-bold", profitFactor >= 1.5 ? "text-success" : profitFactor >= 1 ? "text-warning" : "text-destructive")}>{profitFactor.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Profit Factor</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <p className="text-3xl font-bold text-success">${Math.round(combinedBacktestStats.avg_winner)}</p>
              <p className="text-xs text-muted-foreground">Avg Winner</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <p className="text-3xl font-bold text-destructive">${Math.round(combinedBacktestStats.avg_loser)}</p>
              <p className="text-xs text-muted-foreground">Avg Loser</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-sm text-muted-foreground text-center">
              Add live trades to compare against this backtest benchmark
            </p>
          </div>
        </div>

        {/* Individual Instrument Breakdown */}
        {instrumentFilter === 'all' && filteredBacktest.length > 1 && (
          <div className="grid gap-4 sm:grid-cols-3">
            {filteredBacktest.map(bt => {
              const bot = bots.find(b => b.id === bt.bot_id);
              const wr = bt.total_trades > 0 ? (bt.win_count / bt.total_trades) * 100 : 0;
              return (
                <div key={bt.id} className="stat-card">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-medium">{bot?.name} - {bot?.instrument}</h4>
                    <span className="text-xs text-accent font-medium">{bt.contract_size} ct</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Trades</span>
                      <span className="font-medium">{bt.total_trades.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Net P&L</span>
                      <span className="font-medium text-success">${bt.net_pnl.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Win Rate</span>
                      <span className={cn("font-medium", wr >= 50 ? "text-success" : "text-destructive")}>{wr.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max DD</span>
                      <span className="font-medium text-destructive">${bt.max_drawdown.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Show empty state if no trades and no backtest
  if (botTrades.filter(t => t.status === 'closed').length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BarChart3 className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Data Yet</h2>
        <p className="text-muted-foreground mb-2">Create a bot with backtest data or add live trades to see analytics</p>
        <Link to="/bots">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90 mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create a Bot
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Bot Analytics</h1>
          <p className="page-subtitle">Deep dive into your bot performance</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Select value={instrumentFilter} onValueChange={(v) => setInstrumentFilter(v as InstrumentFilter)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Combined</SelectItem>
              <SelectItem value="MNQ">MNQ</SelectItem>
              <SelectItem value="MES">MES</SelectItem>
              <SelectItem value="MGC">MGC</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedBot} onValueChange={setSelectedBot}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Bots</SelectItem>
              {bots.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.name} {b.version}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
        <MetricCard label="Total Trades" value={metrics.totalTrades.toString()} />
        <MetricCard
          label="Win Rate"
          value={`${metrics.winRate.toFixed(1)}%`}
          color={metrics.winRate >= 50 ? "success" : "destructive"}
        />
        <MetricCard
          label="Profit Factor"
          value={metrics.profitFactor === Infinity ? "∞" : metrics.profitFactor.toFixed(2)}
          color={metrics.profitFactor >= 1.5 ? "success" : metrics.profitFactor >= 1 ? "warning" : "destructive"}
        />
        <MetricCard
          label="Expectancy"
          value={formatCurrency(metrics.expectancy)}
          color={metrics.expectancy >= 0 ? "success" : "destructive"}
        />
        <MetricCard label="Avg Win" value={formatCurrency(metrics.avgWin)} color="success" />
        <MetricCard label="Avg Loss" value={formatCurrency(-metrics.avgLoss)} color="destructive" />
        <MetricCard label="Best Trade" value={formatCurrency(metrics.largestWin)} color="success" />
        <MetricCard label="Worst Trade" value={formatCurrency(metrics.largestLoss)} color="destructive" />
      </div>

      {/* Secondary Metrics */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Total P&L" value={formatCurrency(metrics.totalPnl)} color={metrics.totalPnl >= 0 ? "success" : "destructive"} />
        <MetricCard label="Avg Trade" value={formatCurrency(metrics.avgTrade)} color={metrics.avgTrade >= 0 ? "success" : "destructive"} />
        <MetricCard label="Max Win Streak" value={metrics.maxConsecWins.toString()} icon={<TrendingUp className="h-3 w-3 text-success" />} />
        <MetricCard label="Max Loss Streak" value={metrics.maxConsecLosses.toString()} icon={<TrendingDown className="h-3 w-3 text-destructive" />} />
        <MetricCard label="Max Drawdown" value={formatCurrency(-maxDrawdown)} color="destructive" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="time" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="time">Time</TabsTrigger>
          <TabsTrigger value="direction">Direction</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
        </TabsList>

        {/* TIME TAB */}
        <TabsContent value="time" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Equity Curve */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Cumulative P&L (Equity Curve)
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="trade" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), "P&L"]} labelFormatter={(label) => `Trade #${label}`} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="pnl" stroke={COLORS.accent} fill={COLORS.accent} fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Monthly P&L */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Monthly P&L
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), "P&L"]} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                    <Bar dataKey="pnl" fill={COLORS.accent} radius={[4, 4, 0, 0]}>
                      {monthlyData.map((entry, index) => (
                        <Cell key={index} fill={entry.pnl >= 0 ? COLORS.profit : COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Day of Week */}
            <Card className="p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Performance by Day of Week
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayOfWeekData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number, name: string) => [name === "pnl" ? formatCurrency(value) : `${value.toFixed(1)}%`, name === "pnl" ? "P&L" : "Win Rate"]} />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {dayOfWeekData.map((entry, index) => (
                        <Cell key={index} fill={entry.pnl >= 0 ? COLORS.profit : COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* DIRECTION TAB */}
        <TabsContent value="direction" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Long vs Short P&L */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-success" />
                <ArrowDownRight className="h-4 w-4 text-destructive" />
                Long vs Short P&L
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={directionData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="direction" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), "P&L"]} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {directionData.map((entry, index) => (
                        <Cell key={index} fill={entry.direction === "Long" ? COLORS.profit : COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Direction Stats */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">Direction Comparison</h3>
              <div className="space-y-4">
                {directionData.map((d) => (
                  <div key={d.direction} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      {d.direction === "Long" ? (
                        <ArrowUpRight className="h-5 w-5 text-success" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-destructive" />
                      )}
                      <span className="font-medium">{d.direction}</span>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <div className="text-center">
                        <p className="text-muted-foreground text-xs">Trades</p>
                        <p className="font-medium">{d.trades}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground text-xs">Win Rate</p>
                        <p className={cn("font-medium", d.winRate >= 50 ? "text-success" : "text-destructive")}>
                          {d.winRate.toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground text-xs">P&L</p>
                        <p className={cn("font-medium", d.pnl >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(d.pnl)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground text-xs">Avg</p>
                        <p className={cn("font-medium", d.avgPnl >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(d.avgPnl)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Win/Loss Pie */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <PieChartIcon className="h-4 w-4" />
                Trade Results Distribution
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={resultDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {resultDistribution.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* RISK TAB */}
        <TabsContent value="risk" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Drawdown Chart */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Drawdown from Peak
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={drawdownData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="trade" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} domain={['dataMin', 0]} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), "Drawdown"]} labelFormatter={(label) => `Trade #${label}`} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                    <Area type="monotone" dataKey="drawdown" stroke={COLORS.loss} fill={COLORS.loss} fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Equity & Peak */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Equity vs Peak
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={drawdownData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="trade" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), ""]} />
                    <Legend />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                    <Line type="monotone" dataKey="equity" name="Equity" stroke={COLORS.accent} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="peak" name="Peak" stroke={COLORS.profit} strokeWidth={1} strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* BENCHMARK TAB */}
        <TabsContent value="benchmark" className="space-y-6">
          <SimpleBenchmark
            bots={bots}
            liveTrades={botTrades}
            backtestTrades={backtestTrades}
          />

          {/* Tradovate Integration */}
          <div className="pt-6 border-t border-border">
            <h3 className="text-lg font-medium mb-4">Auto-Import Trades</h3>
            <TradovateConnect />
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}

// Metric Card Component
interface MetricCardProps {
  label: string;
  value: string;
  color?: "success" | "destructive" | "warning" | "default";
  icon?: React.ReactNode;
}

function MetricCard({ label, value, color = "default", icon }: MetricCardProps) {
  return (
    <div className="stat-card p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className={cn(
        "mt-1 text-lg font-bold tabular-nums",
        color === "success" && "text-success",
        color === "destructive" && "text-destructive",
        color === "warning" && "text-warning",
      )}>
        {value}
      </p>
    </div>
  );
}

