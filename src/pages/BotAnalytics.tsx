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
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useBots } from "@/context/BotContext";
import { useAuth } from "@/context/AuthContext";
import { useBenchmarks } from "@/hooks/useBenchmarks";
import {
  RollingBenchmarkCard,
  RiskMetricsCard,
  PortfolioBenchmarkTable,
  BacktestImporter,
} from "@/components/benchmarks";
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
import { Input } from "@/components/ui/input";
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
  const { bots, botTrades, backtestTrades, backtestData, loading, updateBacktestData } = useBots();
  const { calculateRiskMetrics, getRollingBenchmark, getPortfolioBenchmark } = useBenchmarks();
  const [searchParams] = useSearchParams();
  const botIdParam = searchParams.get("bot");

  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [selectedBot, setSelectedBot] = useState<string>(botIdParam || "all");
  const [instrumentFilter, setInstrumentFilter] = useState<InstrumentFilter>("all");
  const [editingContracts, setEditingContracts] = useState<string | null>(null);
  const [newContractSize, setNewContractSize] = useState<number>(1);

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

  // Benchmark Data (backtest vs live)
  const benchmarkData = useMemo(() => {
    // Get backtest for selected bot or first available
    const targetBotId = selectedBot !== "all" ? selectedBot : bots[0]?.id;
    if (!targetBotId) return null;

    const bt = backtestData.find(b => b.bot_id === targetBotId);
    if (!bt) return null;

    const bot = bots.find(b => b.id === targetBotId);
    const liveContracts = bot?.default_contracts || 1;
    const backtestContracts = bt.contract_size || 1;

    // Scale factor: to convert backtest values to live contract size
    // e.g., if backtest was 4 contracts and live is 2, scale = 2/4 = 0.5
    const scaleToLive = liveContracts / backtestContracts;

    // Live metrics for this bot only
    const liveTrades = botTrades.filter(t => t.bot_id === targetBotId && t.status === 'closed');
    const liveWins = liveTrades.filter(t => (t.pnl || 0) > 0);
    const liveLosses = liveTrades.filter(t => (t.pnl || 0) < 0);
    const liveNetPnl = liveTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const liveWinRate = liveTrades.length > 0 ? (liveWins.length / liveTrades.length) * 100 : 0;
    const liveAvgWin = liveWins.length > 0 ? liveWins.reduce((s, t) => s + (t.pnl || 0), 0) / liveWins.length : 0;
    const liveAvgLoss = liveLosses.length > 0 ? Math.abs(liveLosses.reduce((s, t) => s + (t.pnl || 0), 0) / liveLosses.length) : 0;
    const liveProfitFactor = liveAvgLoss > 0 ? (liveAvgWin * liveWins.length) / (liveAvgLoss * liveLosses.length) : liveWins.length > 0 ? 999 : 0;

    // Calculate max drawdown from live trades
    let liveMaxDD = 0;
    let peak = 0;
    let cumPnl = 0;
    const sortedLive = [...liveTrades].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (const trade of sortedLive) {
      cumPnl += trade.pnl || 0;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > liveMaxDD) liveMaxDD = dd;
    }

    // Scale BACKTEST values DOWN to match live contract size
    // Backtest was 4 contracts, live is 2 contracts = multiply backtest by 0.5
    const scaledBtNetPnl = bt.net_pnl * scaleToLive;
    const scaledBtMaxDD = bt.max_drawdown * scaleToLive;
    const scaledBtAvgWinner = bt.avg_winner * scaleToLive;
    const scaledBtAvgLoser = bt.avg_loser * scaleToLive;
    const scaledBtAvgPerTrade = scaledBtNetPnl / bt.total_trades;

    // Win rate and profit factor don't change with scaling
    const btWinRate = (bt.win_count / bt.total_trades) * 100;
    const btProfitFactor = bt.avg_loser > 0 ? bt.avg_winner / bt.avg_loser : 0;

    // Live avg per trade (already at live contract size)
    const liveAvgPerTrade = liveTrades.length > 0 ? liveNetPnl / liveTrades.length : 0;

    return {
      bot,
      backtest: bt,
      liveContracts,
      backtestContracts,
      scaleToLive,
      live: {
        trades: liveTrades.length,
        winRate: liveWinRate,
        profitFactor: liveProfitFactor,
        avgPerTrade: liveAvgPerTrade,
        avgWin: liveAvgWin,
        avgLoss: liveAvgLoss,
        maxDrawdown: liveMaxDD,
        netPnl: liveNetPnl,
      },
      // Scaled benchmark - backtest values adjusted to live contract size
      scaledBenchmark: {
        trades: bt.total_trades,
        winRate: btWinRate,
        profitFactor: btProfitFactor,
        avgPerTrade: scaledBtAvgPerTrade,
        avgWin: scaledBtAvgWinner,
        avgLoss: scaledBtAvgLoser,
        maxDrawdown: scaledBtMaxDD,
        netPnl: scaledBtNetPnl,
      },
      // Raw backtest values (original 4 contract data)
      rawBacktest: {
        trades: bt.total_trades,
        winRate: btWinRate,
        profitFactor: btProfitFactor,
        avgPerTrade: bt.net_pnl / bt.total_trades,
        avgWin: bt.avg_winner,
        avgLoss: bt.avg_loser,
        maxDrawdown: bt.max_drawdown,
        netPnl: bt.net_pnl,
      },
    };
  }, [selectedBot, bots, botTrades, backtestData]);

  // Win/Loss Distribution
  const resultDistribution = useMemo(() => [
    { name: "Wins", value: metrics.wins, color: COLORS.profit },
    { name: "Losses", value: metrics.losses, color: COLORS.loss },
  ].filter(d => d.value > 0), [metrics]);

  // Advanced Benchmark: Rolling monthly comparison for selected bot
  const rollingBenchmark = useMemo(() => {
    if (selectedBot === "all" || backtestTrades.length === 0) return null;

    const bot = bots.find(b => b.id === selectedBot);
    if (!bot) return null;

    const botLiveTrades = botTrades.filter(t => t.bot_id === selectedBot);
    const botBacktestTrades = backtestTrades.filter(t => t.bot_id === selectedBot);

    return getRollingBenchmark(
      botLiveTrades,
      botBacktestTrades,
      bot.default_contracts,
      1 // backtest was at 1 contract
    );
  }, [selectedBot, bots, botTrades, backtestTrades, getRollingBenchmark]);

  // Advanced Benchmark: Live risk metrics for selected bot/all
  const liveRiskMetrics = useMemo(() => {
    const trades = selectedBot === "all"
      ? botTrades.filter(t => t.status === 'closed')
      : botTrades.filter(t => t.bot_id === selectedBot && t.status === 'closed');
    return calculateRiskMetrics(trades, 1);
  }, [selectedBot, botTrades, calculateRiskMetrics]);

  // Advanced Benchmark: Backtest risk metrics for comparison
  const backtestRiskMetrics = useMemo(() => {
    if (selectedBot === "all") return undefined;
    const trades = backtestTrades.filter(t => t.bot_id === selectedBot);
    if (trades.length === 0) return undefined;
    const bot = bots.find(b => b.id === selectedBot);
    // Scale to match live contract size
    return calculateRiskMetrics(trades, bot?.default_contracts || 1);
  }, [selectedBot, backtestTrades, bots, calculateRiskMetrics]);

  // Advanced Benchmark: Portfolio-level comparison across all bots
  const portfolioBenchmark = useMemo(() => {
    if (bots.length === 0) return null;

    const portfolioData = bots.map(bot => ({
      id: bot.id,
      name: `${bot.name} ${bot.version}`,
      instrument: bot.instrument,
      contracts: bot.default_contracts,
      liveTrades: botTrades.filter(t => t.bot_id === bot.id),
      backtestTrades: backtestTrades.filter(t => t.bot_id === bot.id),
      backtestContracts: 1,
    }));

    return getPortfolioBenchmark(portfolioData);
  }, [bots, botTrades, backtestTrades, getPortfolioBenchmark]);

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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="time">Time</TabsTrigger>
          <TabsTrigger value="direction">Direction</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
          <TabsTrigger value="advanced">
            <Target className="h-3 w-3 mr-1" />
            Advanced
          </TabsTrigger>
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
          <h3 className="text-lg font-medium flex items-center gap-2">
            <History className="h-5 w-5" />
            Live vs Backtest Benchmark
          </h3>

          {!benchmarkData ? (
            <div className="text-center py-12 text-muted-foreground">
              {selectedBot === "all" ? "Select a specific bot to view benchmark comparison." : "No backtest data available for this bot. Add backtest data to compare live performance."}
            </div>
          ) : (
            <>
              {/* Scaling Info */}
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p>
                  <span className="font-medium">Backtest:</span> {benchmarkData.backtestContracts} contracts →
                  <span className="font-medium"> Live:</span> {benchmarkData.liveContracts} contracts
                  {benchmarkData.scaleToLive !== 1 && (
                    <span className="text-muted-foreground"> (scaling backtest by {benchmarkData.scaleToLive.toFixed(2)}x)</span>
                  )}
                </p>
              </div>

              {/* Benchmark Comparison Cards - Using SCALED benchmark values */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <BenchmarkCard
                  label="Win Rate"
                  liveValue={benchmarkData.live.winRate}
                  benchValue={benchmarkData.scaledBenchmark.winRate}
                  format={(v) => `${v.toFixed(1)}%`}
                  higherIsBetter
                />
                <BenchmarkCard
                  label="Profit Factor"
                  liveValue={benchmarkData.live.profitFactor}
                  benchValue={benchmarkData.scaledBenchmark.profitFactor}
                  format={(v) => v.toFixed(2)}
                  higherIsBetter
                />
                <BenchmarkCard
                  label={`Avg Per Trade (${benchmarkData.liveContracts}ct)`}
                  liveValue={benchmarkData.live.avgPerTrade}
                  benchValue={benchmarkData.scaledBenchmark.avgPerTrade}
                  format={(v) => `$${v.toFixed(0)}`}
                  higherIsBetter
                />
                <BenchmarkCard
                  label={`Max Drawdown (${benchmarkData.liveContracts}ct)`}
                  liveValue={benchmarkData.live.maxDrawdown}
                  benchValue={benchmarkData.scaledBenchmark.maxDrawdown}
                  format={(v) => `$${v.toFixed(0)}`}
                  higherIsBetter={false}
                />
              </div>

              {/* Scaled Benchmark Summary - Adjusted to live contract size */}
              <div className="rounded-lg border border-border/50 bg-secondary/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {editingContracts === benchmarkData.backtest.id ? (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Backtest was:</span>
                        <Input
                          type="number"
                          min="1"
                          className="w-16 h-8"
                          value={newContractSize}
                          onChange={(e) => setNewContractSize(parseInt(e.target.value) || 1)}
                          autoFocus
                        />
                        <span className="font-medium">contracts</span>
                        <Button
                          size="sm"
                          className="h-8 bg-accent text-accent-foreground"
                          onClick={async () => {
                            await updateBacktestData(benchmarkData.backtest.id, { contract_size: newContractSize });
                            setEditingContracts(null);
                          }}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingContracts(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <h4 className="font-medium">
                          Backtest Scaled to {benchmarkData.liveContracts} contracts
                          <span className="text-muted-foreground font-normal"> (from {benchmarkData.backtestContracts}ct)</span>
                        </h4>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            setNewContractSize(benchmarkData.backtest.contract_size);
                            setEditingContracts(benchmarkData.backtest.id);
                          }}
                        >
                          Fix Contract Size
                        </Button>
                      </>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(benchmarkData.backtest.period_start), 'MMM yyyy')} - {format(new Date(benchmarkData.backtest.period_end), 'MMM yyyy')}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Trades</p>
                    <p className="font-semibold">{benchmarkData.scaledBenchmark.trades.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Net P&L ({benchmarkData.liveContracts}ct)</p>
                    <p className="font-semibold text-success">${Math.round(benchmarkData.scaledBenchmark.netPnl).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg Winner ({benchmarkData.liveContracts}ct)</p>
                    <p className="font-semibold text-success">${Math.round(benchmarkData.scaledBenchmark.avgWin)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg Loser ({benchmarkData.liveContracts}ct)</p>
                    <p className="font-semibold text-destructive">${Math.round(benchmarkData.scaledBenchmark.avgLoss)}</p>
                  </div>
                </div>
                {/* Show raw values for reference */}
                <div className="mt-3 pt-3 border-t border-border/30 text-xs text-muted-foreground">
                  <p>Raw backtest ({benchmarkData.backtestContracts}ct): Net ${benchmarkData.rawBacktest.netPnl.toLocaleString()} | Avg Win ${Math.round(benchmarkData.rawBacktest.avgWin)} | Avg Loss ${Math.round(benchmarkData.rawBacktest.avgLoss)}</p>
                </div>
              </div>

              {/* Live Stats Summary */}
              <div className="rounded-lg border border-accent/50 bg-accent/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-accent">Live Performance ({benchmarkData.liveContracts}ct): {benchmarkData.bot?.name}</h4>
                  <span className="text-sm text-muted-foreground">
                    {benchmarkData.live.trades} trades
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Net P&L</p>
                    <p className={cn("font-semibold", benchmarkData.live.netPnl >= 0 ? "text-success" : "text-destructive")}>
                      {formatCurrency(benchmarkData.live.netPnl)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg Winner</p>
                    <p className="font-semibold text-success">${Math.round(benchmarkData.live.avgWin)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Win Rate</p>
                    <p className="font-semibold">{benchmarkData.live.winRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Profit Factor</p>
                    <p className="font-semibold">{benchmarkData.live.profitFactor.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ADVANCED BENCHMARK TAB */}
        <TabsContent value="advanced" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Target className="h-5 w-5" />
                Advanced Benchmarking
              </h3>
              <p className="text-sm text-muted-foreground">
                Rolling monthly benchmarks with risk-adjusted metrics
              </p>
            </div>
            {selectedBot !== "all" && (
              <div className="text-sm text-muted-foreground">
                Comparing: {botMap.get(selectedBot)?.name || "Selected Bot"}
              </div>
            )}
          </div>

          {backtestTrades.length === 0 ? (
            <div className="space-y-6">
              <div className="rounded-lg border border-dashed border-muted-foreground/30 p-8 text-center">
                <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <h4 className="font-medium mb-2">No Backtest Data Available</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Import your backtest trade data to enable advanced benchmarking features
                  including rolling monthly comparisons and risk-adjusted metrics.
                </p>
              </div>
              <BacktestImporter />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Rolling Benchmark + Risk Metrics */}
              <div className="grid gap-6 lg:grid-cols-2">
                <RollingBenchmarkCard benchmark={rollingBenchmark} />
                <RiskMetricsCard
                  liveMetrics={liveRiskMetrics}
                  benchmarkMetrics={backtestRiskMetrics}
                  showComparison={selectedBot !== "all" && !!backtestRiskMetrics}
                />
              </div>

              {/* Portfolio Benchmark */}
              {bots.length > 1 && (
                <PortfolioBenchmarkTable benchmark={portfolioBenchmark} />
              )}

              {/* Backtest Import Section */}
              <div className="pt-4 border-t">
                <BacktestImporter />
              </div>
            </div>
          )}
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

// Benchmark Card Component
interface BenchmarkCardProps {
  label: string;
  liveValue: number;
  benchValue: number;
  format: (v: number) => string;
  higherIsBetter: boolean;
}

function BenchmarkCard({ label, liveValue, benchValue, format, higherIsBetter }: BenchmarkCardProps) {
  const isBetter = higherIsBetter ? liveValue >= benchValue : liveValue <= benchValue;
  const ratio = benchValue !== 0 ? (liveValue / benchValue) : 0;

  return (
    <div className="stat-card">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold">{format(liveValue)}</p>
        <p className={cn("text-sm", isBetter ? "text-success" : "text-destructive")}>
          vs {format(benchValue)}
        </p>
      </div>
      <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", isBetter ? "bg-success" : "bg-warning")}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}
