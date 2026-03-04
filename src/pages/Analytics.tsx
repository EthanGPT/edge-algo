import { useMemo, useState } from "react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  subMonths,
  subDays,
  getDay,
  getHours,
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
  Target,
  Clock,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Zap,
  Award,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
} from "lucide-react";
import { useJournal } from "@/context/JournalContext";
import { Trade } from "@/types";
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

type DateRange = "all" | "ytd" | "90d" | "30d" | "7d";

const COLORS = {
  profit: "hsl(var(--success))",
  loss: "hsl(var(--destructive))",
  neutral: "hsl(var(--muted-foreground))",
  accent: "hsl(var(--accent))",
  primary: "hsl(var(--primary))",
};

const PIE_COLORS = ["#10b981", "#ef4444", "#6b7280", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function Analytics() {
  const { trades, tradingSetups, accounts } = useJournal();
  const [dateRange, setDateRange] = useState<DateRange>("all");

  // Filter trades by date range
  const filteredTrades = useMemo(() => {
    if (dateRange === "all") return trades;

    const now = new Date();
    let startDate: Date;

    switch (dateRange) {
      case "ytd":
        startDate = startOfYear(now);
        break;
      case "90d":
        startDate = subDays(now, 90);
        break;
      case "30d":
        startDate = subDays(now, 30);
        break;
      case "7d":
        startDate = subDays(now, 7);
        break;
      default:
        return trades;
    }

    const startStr = format(startDate, "yyyy-MM-dd");
    return trades.filter(t => t.date >= startStr);
  }, [trades, dateRange]);

  // Setup name lookup
  const setupMap = useMemo(() => {
    const m = new Map<string, string>();
    tradingSetups.forEach(s => m.set(s.id, s.name));
    return m;
  }, [tradingSetups]);

  // Account name lookup
  const accountMap = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach(a => m.set(a.id, `${a.propFirm} $${(a.accountSize / 1000).toFixed(0)}K`));
    return m;
  }, [accounts]);

  // ═══════════════════════════════════════════════════════════════
  // KEY METRICS CALCULATIONS
  // ═══════════════════════════════════════════════════════════════

  const metrics = useMemo(() => {
    const t = filteredTrades;
    if (t.length === 0) {
      return {
        totalTrades: 0, wins: 0, losses: 0, breakeven: 0,
        winRate: 0, profitFactor: 0, expectancy: 0,
        totalPnl: 0, grossProfit: 0, grossLoss: 0,
        avgWin: 0, avgLoss: 0, avgTrade: 0,
        largestWin: 0, largestLoss: 0,
        maxConsecWins: 0, maxConsecLosses: 0,
        avgRR: 0, avgRating: 0,
      };
    }

    const wins = t.filter(x => x.result === "win");
    const losses = t.filter(x => x.result === "loss");
    const breakeven = t.filter(x => x.result === "breakeven");

    const grossProfit = wins.reduce((s, x) => s + x.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, x) => s + x.pnl, 0));
    const totalPnl = t.reduce((s, x) => s + x.pnl, 0);

    const winRate = t.length > 0 ? (wins.length / t.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const avgTrade = t.length > 0 ? totalPnl / t.length : 0;

    // Expectancy = (Win% × Avg Win) - (Loss% × Avg Loss)
    const lossRate = losses.length / t.length;
    const expectancy = (winRate / 100 * avgWin) - (lossRate * avgLoss);

    const largestWin = wins.length > 0 ? Math.max(...wins.map(x => x.pnl)) : 0;
    const largestLoss = losses.length > 0 ? Math.min(...losses.map(x => x.pnl)) : 0;

    // Max consecutive wins/losses
    let maxConsecWins = 0, maxConsecLosses = 0, consecWins = 0, consecLosses = 0;
    const sorted = [...t].sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
    for (const trade of sorted) {
      if (trade.result === "win") {
        consecWins++;
        consecLosses = 0;
        maxConsecWins = Math.max(maxConsecWins, consecWins);
      } else if (trade.result === "loss") {
        consecLosses++;
        consecWins = 0;
        maxConsecLosses = Math.max(maxConsecLosses, consecLosses);
      } else {
        consecWins = 0;
        consecLosses = 0;
      }
    }

    const tradesWithRR = t.filter(x => x.riskReward !== undefined);
    const avgRR = tradesWithRR.length > 0
      ? tradesWithRR.reduce((s, x) => s + (x.riskReward || 0), 0) / tradesWithRR.length
      : 0;

    const tradesWithRating = t.filter(x => x.rating !== undefined);
    const avgRating = tradesWithRating.length > 0
      ? tradesWithRating.reduce((s, x) => s + (x.rating || 0), 0) / tradesWithRating.length
      : 0;

    return {
      totalTrades: t.length,
      wins: wins.length,
      losses: losses.length,
      breakeven: breakeven.length,
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
      avgRR,
      avgRating,
    };
  }, [filteredTrades]);

  // ═══════════════════════════════════════════════════════════════
  // TIME-BASED ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  // Monthly P&L
  const monthlyData = useMemo(() => {
    const map = new Map<string, { pnl: number; trades: number; wins: number }>();
    filteredTrades.forEach(t => {
      const month = t.date.slice(0, 7); // YYYY-MM
      const existing = map.get(month) || { pnl: 0, trades: 0, wins: 0 };
      existing.pnl += t.pnl;
      existing.trades++;
      if (t.result === "win") existing.wins++;
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

  // Day of Week Performance
  const dayOfWeekData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const map = new Map<number, { pnl: number; trades: number; wins: number }>();
    for (let i = 0; i < 7; i++) map.set(i, { pnl: 0, trades: 0, wins: 0 });

    filteredTrades.forEach(t => {
      const day = getDay(parseISO(t.date));
      const existing = map.get(day)!;
      existing.pnl += t.pnl;
      existing.trades++;
      if (t.result === "win") existing.wins++;
    });

    return Array.from(map.entries()).map(([day, data]) => ({
      day: days[day],
      pnl: data.pnl,
      trades: data.trades,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
    }));
  }, [filteredTrades]);

  // Hourly Performance
  const hourlyData = useMemo(() => {
    const map = new Map<number, { pnl: number; trades: number; wins: number }>();
    for (let i = 0; i < 24; i++) map.set(i, { pnl: 0, trades: 0, wins: 0 });

    filteredTrades.filter(t => t.time).forEach(t => {
      const hour = parseInt(t.time!.split(":")[0]);
      const existing = map.get(hour)!;
      existing.pnl += t.pnl;
      existing.trades++;
      if (t.result === "win") existing.wins++;
    });

    return Array.from(map.entries())
      .filter(([_, data]) => data.trades > 0)
      .map(([hour, data]) => ({
        hour: `${hour.toString().padStart(2, "0")}:00`,
        pnl: data.pnl,
        trades: data.trades,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
      }));
  }, [filteredTrades]);

  // Cumulative P&L (Equity Curve)
  const equityCurve = useMemo(() => {
    const sorted = [...filteredTrades].sort((a, b) =>
      a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "")
    );
    let cumPnl = 0;
    return sorted.map((t, i) => {
      cumPnl += t.pnl;
      return {
        trade: i + 1,
        date: t.date,
        pnl: cumPnl,
      };
    });
  }, [filteredTrades]);

  // ═══════════════════════════════════════════════════════════════
  // INSTRUMENT ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  const instrumentData = useMemo(() => {
    const map = new Map<string, { pnl: number; trades: number; wins: number }>();
    filteredTrades.forEach(t => {
      const existing = map.get(t.instrument) || { pnl: 0, trades: 0, wins: 0 };
      existing.pnl += t.pnl;
      existing.trades++;
      if (t.result === "win") existing.wins++;
      map.set(t.instrument, existing);
    });
    return Array.from(map.entries())
      .map(([instrument, data]) => ({
        instrument,
        pnl: data.pnl,
        trades: data.trades,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
        avgPnl: data.trades > 0 ? data.pnl / data.trades : 0,
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [filteredTrades]);

  // ═══════════════════════════════════════════════════════════════
  // SETUP ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  const setupData = useMemo(() => {
    const map = new Map<string, { pnl: number; trades: number; wins: number; losses: number }>();
    filteredTrades.forEach(t => {
      const existing = map.get(t.setupId) || { pnl: 0, trades: 0, wins: 0, losses: 0 };
      existing.pnl += t.pnl;
      existing.trades++;
      if (t.result === "win") existing.wins++;
      if (t.result === "loss") existing.losses++;
      map.set(t.setupId, existing);
    });
    return Array.from(map.entries())
      .map(([setupId, data]) => {
        const grossProfit = filteredTrades
          .filter(t => t.setupId === setupId && t.result === "win")
          .reduce((s, t) => s + t.pnl, 0);
        const grossLoss = Math.abs(filteredTrades
          .filter(t => t.setupId === setupId && t.result === "loss")
          .reduce((s, t) => s + t.pnl, 0));
        return {
          setup: setupMap.get(setupId) || "Unknown",
          pnl: data.pnl,
          trades: data.trades,
          winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
          profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0,
          avgPnl: data.trades > 0 ? data.pnl / data.trades : 0,
        };
      })
      .sort((a, b) => b.pnl - a.pnl);
  }, [filteredTrades, setupMap]);

  // ═══════════════════════════════════════════════════════════════
  // DIRECTION ANALYSIS (Long vs Short)
  // ═══════════════════════════════════════════════════════════════

  const directionData = useMemo(() => {
    const long = filteredTrades.filter(t => t.direction === "long");
    const short = filteredTrades.filter(t => t.direction === "short");

    const calc = (trades: Trade[]) => {
      const wins = trades.filter(t => t.result === "win");
      return {
        trades: trades.length,
        pnl: trades.reduce((s, t) => s + t.pnl, 0),
        winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
        avgPnl: trades.length > 0 ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : 0,
      };
    };

    return [
      { direction: "Long", ...calc(long) },
      { direction: "Short", ...calc(short) },
    ];
  }, [filteredTrades]);

  // Direction by Instrument
  const directionByInstrument = useMemo(() => {
    const map = new Map<string, { longPnl: number; shortPnl: number; longTrades: number; shortTrades: number }>();
    filteredTrades.forEach(t => {
      const existing = map.get(t.instrument) || { longPnl: 0, shortPnl: 0, longTrades: 0, shortTrades: 0 };
      if (t.direction === "long") {
        existing.longPnl += t.pnl;
        existing.longTrades++;
      } else {
        existing.shortPnl += t.pnl;
        existing.shortTrades++;
      }
      map.set(t.instrument, existing);
    });
    return Array.from(map.entries())
      .map(([instrument, data]) => ({
        instrument,
        longPnl: data.longPnl,
        shortPnl: data.shortPnl,
        longTrades: data.longTrades,
        shortTrades: data.shortTrades,
      }))
      .filter(d => d.longTrades + d.shortTrades > 0);
  }, [filteredTrades]);

  // ═══════════════════════════════════════════════════════════════
  // RISK MANAGEMENT ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  // P&L Distribution (histogram of trade sizes)
  const pnlDistribution = useMemo(() => {
    if (filteredTrades.length === 0) return [];

    const pnls = filteredTrades.map(t => t.pnl);
    const maxPnl = Math.max(...pnls.map(Math.abs));

    // Create dynamic bins based on data
    const binSize = maxPnl > 1000 ? 250 : maxPnl > 500 ? 100 : maxPnl > 200 ? 50 : 25;
    const bins: { range: string; min: number; max: number; trades: number; isProfit: boolean }[] = [];

    // Loss bins (negative)
    for (let i = Math.ceil(maxPnl / binSize); i > 0; i--) {
      bins.push({
        range: `-$${i * binSize}`,
        min: -i * binSize,
        max: -(i - 1) * binSize,
        trades: 0,
        isProfit: false,
      });
    }
    // Profit bins (positive)
    for (let i = 1; i <= Math.ceil(maxPnl / binSize); i++) {
      bins.push({
        range: `+$${i * binSize}`,
        min: (i - 1) * binSize,
        max: i * binSize,
        trades: 0,
        isProfit: true,
      });
    }

    filteredTrades.forEach(t => {
      for (const bin of bins) {
        if (t.pnl >= bin.min && t.pnl < bin.max) {
          bin.trades++;
          break;
        }
      }
    });

    return bins.filter(b => b.trades > 0);
  }, [filteredTrades]);

  // Contract Size Distribution - show trade count and win rate
  const contractDistribution = useMemo(() => {
    const map = new Map<number, { trades: number; pnl: number; wins: number }>();
    filteredTrades.forEach(t => {
      const existing = map.get(t.contracts) || { trades: 0, pnl: 0, wins: 0 };
      existing.trades++;
      existing.pnl += t.pnl;
      if (t.result === "win") existing.wins++;
      map.set(t.contracts, existing);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([contracts, data]) => ({
        contracts,
        label: `${contracts}`,
        trades: data.trades,
        pnl: data.pnl,
        avgPnl: data.trades > 0 ? data.pnl / data.trades : 0,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
      }));
  }, [filteredTrades]);

  // Drawdown Analysis - calculate from account values (accountSize + cumulative trades P&L)
  const accountDrawdownData = useMemo(() => {
    // Get active accounts (funded and in evaluation)
    const activeAccounts = accounts.filter(a =>
      a.status === 'active' || a.status === 'in_progress'
    );

    if (activeAccounts.length === 0) return { byAccount: [], combined: [], maxDrawdown: 0 };

    // Calculate per-account equity and drawdown
    const byAccount = activeAccounts.map(account => {
      // Get trades for this account
      const accountTrades = filteredTrades.filter(t =>
        t.accountId === account.id ||
        (t.accountId === 'split' && account.status === 'active')
      ).sort((a, b) =>
        a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "")
      );

      const startingEquity = account.accountSize;
      let equity = startingEquity;
      let peak = startingEquity;
      let maxDD = 0;

      const curve = accountTrades.map((t, i) => {
        // For split trades, divide P&L by number of active funded accounts
        const activeFunded = accounts.filter(a => a.status === 'active').length;
        const pnl = t.accountId === 'split' && activeFunded > 0
          ? t.pnl / activeFunded
          : t.pnl;

        equity += pnl;
        peak = Math.max(peak, equity);
        const drawdown = peak - equity;
        maxDD = Math.max(maxDD, drawdown);

        return {
          trade: i + 1,
          date: t.date,
          equity,
          peak,
          drawdown: -drawdown, // Negative for visual
        };
      });

      return {
        accountId: account.id,
        accountName: `${account.propFirm} $${(account.accountSize / 1000).toFixed(0)}K`,
        startingEquity,
        currentEquity: equity,
        peakEquity: peak,
        maxDrawdown: maxDD,
        maxDrawdownPct: startingEquity > 0 ? (maxDD / startingEquity) * 100 : 0,
        curve,
      };
    });

    // Calculate combined portfolio equity curve
    const allTrades = [...filteredTrades].sort((a, b) =>
      a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "")
    );

    const totalStartingEquity = activeAccounts.reduce((sum, a) => sum + a.accountSize, 0);
    let combinedEquity = totalStartingEquity;
    let combinedPeak = totalStartingEquity;
    let combinedMaxDD = 0;

    const combined = allTrades.map((t, i) => {
      combinedEquity += t.pnl;
      combinedPeak = Math.max(combinedPeak, combinedEquity);
      const drawdown = combinedPeak - combinedEquity;
      combinedMaxDD = Math.max(combinedMaxDD, drawdown);

      return {
        trade: i + 1,
        date: t.date,
        equity: combinedEquity,
        peak: combinedPeak,
        drawdown: -drawdown,
      };
    });

    return {
      byAccount,
      combined,
      totalStartingEquity,
      currentEquity: combinedEquity,
      peakEquity: combinedPeak,
      maxDrawdown: combinedMaxDD,
      maxDrawdownPct: totalStartingEquity > 0 ? (combinedMaxDD / totalStartingEquity) * 100 : 0,
    };
  }, [filteredTrades, accounts]);

  // For backwards compatibility with existing UI
  const drawdownData = accountDrawdownData.combined;
  const maxDrawdown = accountDrawdownData.maxDrawdown;

  // Daily P&L stats for risk metrics
  const dailyPnlStats = useMemo(() => {
    const dayMap = new Map<string, number>();
    filteredTrades.forEach(t => {
      dayMap.set(t.date, (dayMap.get(t.date) || 0) + t.pnl);
    });

    const dailyPnls = Array.from(dayMap.values());
    if (dailyPnls.length === 0) return { avgDaily: 0, stdDev: 0, bestDay: 0, worstDay: 0, profitDays: 0, lossDays: 0 };

    const avgDaily = dailyPnls.reduce((s, p) => s + p, 0) / dailyPnls.length;
    const variance = dailyPnls.reduce((s, p) => s + Math.pow(p - avgDaily, 2), 0) / dailyPnls.length;
    const stdDev = Math.sqrt(variance);

    return {
      avgDaily,
      stdDev,
      bestDay: Math.max(...dailyPnls),
      worstDay: Math.min(...dailyPnls),
      profitDays: dailyPnls.filter(p => p > 0).length,
      lossDays: dailyPnls.filter(p => p < 0).length,
    };
  }, [filteredTrades]);

  // ═══════════════════════════════════════════════════════════════
  // EXECUTION QUALITY ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  const ratingData = useMemo(() => {
    const map = new Map<number, { trades: number; pnl: number; wins: number }>();
    for (let i = 1; i <= 5; i++) map.set(i, { trades: 0, pnl: 0, wins: 0 });

    filteredTrades.filter(t => t.rating).forEach(t => {
      const existing = map.get(t.rating!)!;
      existing.trades++;
      existing.pnl += t.pnl;
      if (t.result === "win") existing.wins++;
    });

    return Array.from(map.entries()).map(([rating, data]) => ({
      rating: `${rating} Star`,
      trades: data.trades,
      pnl: data.pnl,
      avgPnl: data.trades > 0 ? data.pnl / data.trades : 0,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
    }));
  }, [filteredTrades]);

  // ═══════════════════════════════════════════════════════════════
  // PSYCHOLOGY / PATTERN ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  // Performance after Win vs Loss
  const performanceAfterResult = useMemo(() => {
    const sorted = [...filteredTrades].sort((a, b) =>
      a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "")
    );

    const afterWin: Trade[] = [];
    const afterLoss: Trade[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.result === "win") afterWin.push(curr);
      else if (prev.result === "loss") afterLoss.push(curr);
    }

    const calc = (trades: Trade[]) => {
      const wins = trades.filter(t => t.result === "win").length;
      return {
        trades: trades.length,
        pnl: trades.reduce((s, t) => s + t.pnl, 0),
        winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
        avgPnl: trades.length > 0 ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : 0,
      };
    };

    return [
      { label: "After Win", ...calc(afterWin) },
      { label: "After Loss", ...calc(afterLoss) },
    ];
  }, [filteredTrades]);

  // Trade frequency by day
  const tradeFrequency = useMemo(() => {
    const map = new Map<string, { trades: number; pnl: number }>();
    filteredTrades.forEach(t => {
      const existing = map.get(t.date) || { trades: 0, pnl: 0 };
      existing.trades++;
      existing.pnl += t.pnl;
      map.set(t.date, existing);
    });

    const bins = [
      { range: "1 trade", min: 1, max: 1 },
      { range: "2-3 trades", min: 2, max: 3 },
      { range: "4-5 trades", min: 4, max: 5 },
      { range: "6+ trades", min: 6, max: Infinity },
    ];

    return bins.map(bin => {
      const days = Array.from(map.values()).filter(d => d.trades >= bin.min && d.trades <= bin.max);
      return {
        range: bin.range,
        days: days.length,
        avgPnl: days.length > 0 ? days.reduce((s, d) => s + d.pnl, 0) / days.length : 0,
        totalPnl: days.reduce((s, d) => s + d.pnl, 0),
      };
    });
  }, [filteredTrades]);

  // Win/Loss Result Distribution (Pie)
  const resultDistribution = useMemo(() => [
    { name: "Wins", value: metrics.wins, color: COLORS.profit },
    { name: "Losses", value: metrics.losses, color: COLORS.loss },
    { name: "Breakeven", value: metrics.breakeven, color: COLORS.neutral },
  ].filter(d => d.value > 0), [metrics]);

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  const formatCurrency = (val: number) =>
    `${val >= 0 ? "+" : ""}$${Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const formatPercent = (val: number) => `${val.toFixed(1)}%`;

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BarChart3 className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Trade Data</h2>
        <p className="text-muted-foreground">Start logging trades to see analytics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Deep dive into your trading performance</p>
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-[140px]">
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
        <MetricCard
          label="Avg Win"
          value={formatCurrency(metrics.avgWin)}
          color="success"
        />
        <MetricCard
          label="Avg Loss"
          value={formatCurrency(-metrics.avgLoss)}
          color="destructive"
        />
        <MetricCard
          label="Best Trade"
          value={formatCurrency(metrics.largestWin)}
          color="success"
        />
        <MetricCard
          label="Worst Trade"
          value={formatCurrency(metrics.largestLoss)}
          color="destructive"
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Total P&L" value={formatCurrency(metrics.totalPnl)} color={metrics.totalPnl >= 0 ? "success" : "destructive"} />
        <MetricCard label="Avg Trade" value={formatCurrency(metrics.avgTrade)} color={metrics.avgTrade >= 0 ? "success" : "destructive"} />
        <MetricCard label="Max Win Streak" value={metrics.maxConsecWins.toString()} icon={<TrendingUp className="h-3 w-3 text-success" />} />
        <MetricCard label="Max Loss Streak" value={metrics.maxConsecLosses.toString()} icon={<TrendingDown className="h-3 w-3 text-destructive" />} />
        <MetricCard label="Avg Rating" value={metrics.avgRating.toFixed(1)} icon={<Award className="h-3 w-3 text-warning" />} />
      </div>

      {/* Tabs for Different Analysis Sections */}
      <Tabs defaultValue="time" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7">
          <TabsTrigger value="time">Time</TabsTrigger>
          <TabsTrigger value="instruments">Instruments</TabsTrigger>
          <TabsTrigger value="setups">Setups</TabsTrigger>
          <TabsTrigger value="direction">Direction</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="execution">Execution</TabsTrigger>
          <TabsTrigger value="psychology">Psychology</TabsTrigger>
        </TabsList>

        {/* TIME ANALYSIS TAB */}
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
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), "P&L"]}
                      labelFormatter={(label) => `Trade #${label}`}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Area
                      type="monotone"
                      dataKey="pnl"
                      stroke={COLORS.accent}
                      fill={COLORS.accent}
                      fillOpacity={0.2}
                    />
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
                    <Bar
                      dataKey="pnl"
                      fill={COLORS.accent}
                      radius={[4, 4, 0, 0]}
                    >
                      {monthlyData.map((entry, index) => (
                        <Cell key={index} fill={entry.pnl >= 0 ? COLORS.profit : COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Day of Week */}
            <Card className="p-4">
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
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === "pnl" ? formatCurrency(value) : `${value.toFixed(1)}%`,
                        name === "pnl" ? "P&L" : "Win Rate"
                      ]}
                    />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {dayOfWeekData.map((entry, index) => (
                        <Cell key={index} fill={entry.pnl >= 0 ? COLORS.profit : COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Hourly Performance */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Performance by Hour
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === "pnl" ? formatCurrency(value) : value,
                        name === "pnl" ? "P&L" : "Trades"
                      ]}
                    />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {hourlyData.map((entry, index) => (
                        <Cell key={index} fill={entry.pnl >= 0 ? COLORS.profit : COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* INSTRUMENTS TAB */}
        <TabsContent value="instruments" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* P&L by Instrument */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                P&L by Instrument
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={instrumentData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="instrument" tick={{ fontSize: 11 }} width={50} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), "P&L"]} />
                    <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" />
                    <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                      {instrumentData.map((entry, index) => (
                        <Cell key={index} fill={entry.pnl >= 0 ? COLORS.profit : COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Win Rate by Instrument */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Win Rate by Instrument
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={instrumentData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="instrument" tick={{ fontSize: 11 }} width={50} />
                    <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, "Win Rate"]} />
                    <ReferenceLine x={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Bar dataKey="winRate" fill={COLORS.accent} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Trade Distribution Pie */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <PieChartIcon className="h-4 w-4" />
                Trade Distribution by Instrument
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={instrumentData}
                      dataKey="trades"
                      nameKey="instrument"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ instrument, trades }) => `${instrument}: ${trades}`}
                      labelLine={{ stroke: "hsl(var(--muted-foreground))" }}
                    >
                      {instrumentData.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value, "Trades"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Instrument Stats Table */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">Instrument Summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Instrument</th>
                      <th className="text-right py-2">Trades</th>
                      <th className="text-right py-2">Win Rate</th>
                      <th className="text-right py-2">P&L</th>
                      <th className="text-right py-2">Avg P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instrumentData.map((row) => (
                      <tr key={row.instrument} className="border-b border-muted">
                        <td className="py-2 font-medium">{row.instrument}</td>
                        <td className="text-right py-2">{row.trades}</td>
                        <td className="text-right py-2">{row.winRate.toFixed(1)}%</td>
                        <td className={cn("text-right py-2 font-medium", row.pnl >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(row.pnl)}
                        </td>
                        <td className={cn("text-right py-2", row.avgPnl >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(row.avgPnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* SETUPS TAB */}
        <TabsContent value="setups" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* P&L by Setup */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                P&L by Setup
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={setupData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="setup" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), "P&L"]} />
                    <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" />
                    <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                      {setupData.map((entry, index) => (
                        <Cell key={index} fill={entry.pnl >= 0 ? COLORS.profit : COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Win Rate by Setup */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Win Rate by Setup
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={setupData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="setup" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, "Win Rate"]} />
                    <ReferenceLine x={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Bar dataKey="winRate" fill={COLORS.accent} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Setup Stats Table */}
            <Card className="p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold mb-4">Setup Performance Summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Setup</th>
                      <th className="text-right py-2">Trades</th>
                      <th className="text-right py-2">Win Rate</th>
                      <th className="text-right py-2">Profit Factor</th>
                      <th className="text-right py-2">Total P&L</th>
                      <th className="text-right py-2">Avg P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setupData.map((row) => (
                      <tr key={row.setup} className="border-b border-muted">
                        <td className="py-2 font-medium">{row.setup}</td>
                        <td className="text-right py-2">{row.trades}</td>
                        <td className={cn("text-right py-2", row.winRate >= 50 ? "text-success" : "text-destructive")}>
                          {row.winRate.toFixed(1)}%
                        </td>
                        <td className={cn("text-right py-2", row.profitFactor >= 1.5 ? "text-success" : row.profitFactor >= 1 ? "text-warning" : "text-destructive")}>
                          {row.profitFactor.toFixed(2)}
                        </td>
                        <td className={cn("text-right py-2 font-medium", row.pnl >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(row.pnl)}
                        </td>
                        <td className={cn("text-right py-2", row.avgPnl >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(row.avgPnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* DIRECTION TAB */}
        <TabsContent value="direction" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Long vs Short Comparison */}
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

            {/* Long vs Short Stats */}
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

            {/* Direction by Instrument */}
            <Card className="p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold mb-4">Long vs Short by Instrument</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={directionByInstrument}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="instrument" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), ""]} />
                    <Legend />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                    <Bar dataKey="longPnl" name="Long" fill={COLORS.profit} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="shortPnl" name="Short" fill={COLORS.loss} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* RISK TAB */}
        <TabsContent value="risk" className="space-y-4">
          {/* Risk Metrics Summary */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard
              label="Max Drawdown"
              value={`${formatCurrency(-maxDrawdown)} (${accountDrawdownData.maxDrawdownPct?.toFixed(1) || 0}%)`}
              color="destructive"
            />
            <MetricCard label="Best Day" value={formatCurrency(dailyPnlStats.bestDay)} color="success" />
            <MetricCard label="Worst Day" value={formatCurrency(dailyPnlStats.worstDay)} color="destructive" />
            <MetricCard label="Avg Daily P&L" value={formatCurrency(dailyPnlStats.avgDaily)} color={dailyPnlStats.avgDaily >= 0 ? "success" : "destructive"} />
            <MetricCard label="Daily Std Dev" value={formatCurrency(dailyPnlStats.stdDev)} />
            <MetricCard label="Profit Days" value={`${dailyPnlStats.profitDays} / ${dailyPnlStats.profitDays + dailyPnlStats.lossDays}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Drawdown Chart - Based on Account Values */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Portfolio Drawdown from Peak
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={drawdownData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="trade" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} domain={['dataMin', 0]} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name === "drawdown" ? "Drawdown" : "Equity"
                      ]}
                      labelFormatter={(label) => `Trade #${label}`}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                    <Area
                      type="monotone"
                      dataKey="drawdown"
                      stroke={COLORS.loss}
                      fill={COLORS.loss}
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Based on account starting values ({formatCurrency(accountDrawdownData.totalStartingEquity || 0)}) + trade P&L
              </p>
            </Card>

            {/* P&L Distribution Histogram */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Trade P&L Distribution
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pnlDistribution}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="range" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [value, "Trades"]} />
                    <Bar dataKey="trades" radius={[4, 4, 0, 0]}>
                      {pnlDistribution.map((entry, index) => (
                        <Cell key={index} fill={entry.isProfit ? COLORS.profit : COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Distribution of your trade sizes - are your wins bigger than losses?
              </p>
            </Card>

            {/* Position Size - Trade Count */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Performance by Contract Size
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={contractDistribution}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === "trades" ? value : `${value.toFixed(1)}%`,
                        name === "trades" ? "Trades" : "Win Rate"
                      ]}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="trades" name="Trades" fill={COLORS.accent} radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="winRate" name="Win Rate" stroke={COLORS.profit} strokeWidth={2} dot />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Position Size Table */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">Position Size Analysis</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Contracts</th>
                      <th className="text-right py-2">Trades</th>
                      <th className="text-right py-2">Win Rate</th>
                      <th className="text-right py-2">Total P&L</th>
                      <th className="text-right py-2">Avg P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractDistribution.map((row) => (
                      <tr key={row.contracts} className="border-b border-muted">
                        <td className="py-2 font-medium">{row.contracts} ct</td>
                        <td className="text-right py-2">{row.trades}</td>
                        <td className={cn("text-right py-2", row.winRate >= 50 ? "text-success" : "text-destructive")}>
                          {row.winRate.toFixed(1)}%
                        </td>
                        <td className={cn("text-right py-2 font-medium", row.pnl >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(row.pnl)}
                        </td>
                        <td className={cn("text-right py-2", row.avgPnl >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(row.avgPnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Find your optimal position size - which contract count gives best results?
              </p>
            </Card>

            {/* Account Drawdown Breakdown */}
            {accountDrawdownData.byAccount && accountDrawdownData.byAccount.length > 0 && (
              <Card className="p-4 lg:col-span-2">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Drawdown by Account
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Account</th>
                        <th className="text-right py-2">Starting</th>
                        <th className="text-right py-2">Current</th>
                        <th className="text-right py-2">Peak</th>
                        <th className="text-right py-2">Max DD</th>
                        <th className="text-right py-2">Max DD %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountDrawdownData.byAccount.map((acc) => (
                        <tr key={acc.accountId} className="border-b border-muted">
                          <td className="py-2 font-medium">{acc.accountName}</td>
                          <td className="text-right py-2">{formatCurrency(acc.startingEquity)}</td>
                          <td className={cn("text-right py-2", acc.currentEquity >= acc.startingEquity ? "text-success" : "text-destructive")}>
                            {formatCurrency(acc.currentEquity)}
                          </td>
                          <td className="text-right py-2 text-success">{formatCurrency(acc.peakEquity)}</td>
                          <td className="text-right py-2 text-destructive font-medium">
                            {formatCurrency(-acc.maxDrawdown)}
                          </td>
                          <td className="text-right py-2 text-destructive">
                            {acc.maxDrawdownPct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Drawdown calculated from account starting balance + cumulative trade P&L
                </p>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* EXECUTION TAB */}
        <TabsContent value="execution" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* P&L by Rating */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Award className="h-4 w-4" />
                P&L by Execution Rating
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ratingData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="rating" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), "P&L"]} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {ratingData.map((entry, index) => (
                        <Cell key={index} fill={entry.pnl >= 0 ? COLORS.profit : COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Win Rate by Rating */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Win Rate by Rating
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ratingData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="rating" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, "Win Rate"]} />
                    <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Bar dataKey="winRate" fill={COLORS.accent} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Rating Stats Table */}
            <Card className="p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold mb-4">Execution Rating Analysis</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Rating</th>
                      <th className="text-right py-2">Trades</th>
                      <th className="text-right py-2">Win Rate</th>
                      <th className="text-right py-2">Total P&L</th>
                      <th className="text-right py-2">Avg P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratingData.filter(r => r.trades > 0).map((row) => (
                      <tr key={row.rating} className="border-b border-muted">
                        <td className="py-2 font-medium">{row.rating}</td>
                        <td className="text-right py-2">{row.trades}</td>
                        <td className={cn("text-right py-2", row.winRate >= 50 ? "text-success" : "text-destructive")}>
                          {row.winRate.toFixed(1)}%
                        </td>
                        <td className={cn("text-right py-2 font-medium", row.pnl >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(row.pnl)}
                        </td>
                        <td className={cn("text-right py-2", row.avgPnl >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(row.avgPnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Tip: If higher-rated trades don't outperform, your rating criteria may need adjustment.
              </p>
            </Card>
          </div>
        </TabsContent>

        {/* PSYCHOLOGY TAB */}
        <TabsContent value="psychology" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Performance After Win/Loss */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Performance After Win vs Loss
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceAfterResult}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), "Avg P&L"]} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                    <Bar dataKey="avgPnl" radius={[4, 4, 0, 0]}>
                      {performanceAfterResult.map((entry, index) => (
                        <Cell key={index} fill={entry.avgPnl >= 0 ? COLORS.profit : COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {performanceAfterResult[1]?.avgPnl < performanceAfterResult[0]?.avgPnl
                  ? "⚠️ You tend to perform worse after losses - watch for revenge trading"
                  : "✓ Good emotional control - consistent performance regardless of previous result"}
              </p>
            </Card>

            {/* Trade Frequency Analysis */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Daily Trade Frequency Impact
              </h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tradeFrequency}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), "Avg Daily P&L"]} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                    <Bar dataKey="avgPnl" radius={[4, 4, 0, 0]}>
                      {tradeFrequency.map((entry, index) => (
                        <Cell key={index} fill={entry.avgPnl >= 0 ? COLORS.profit : COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Find your optimal trading frequency - overtrading often hurts performance.
              </p>
            </Card>

            {/* Win/Loss Distribution Pie */}
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

            {/* Psychology Stats */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">Psychology Summary</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <span className="text-sm">Max Winning Streak</span>
                  <span className="font-bold text-success">{metrics.maxConsecWins} trades</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <span className="text-sm">Max Losing Streak</span>
                  <span className="font-bold text-destructive">{metrics.maxConsecLosses} trades</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <span className="text-sm">After Win Avg P&L</span>
                  <span className={cn("font-bold", performanceAfterResult[0]?.avgPnl >= 0 ? "text-success" : "text-destructive")}>
                    {formatCurrency(performanceAfterResult[0]?.avgPnl || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <span className="text-sm">After Loss Avg P&L</span>
                  <span className={cn("font-bold", performanceAfterResult[1]?.avgPnl >= 0 ? "text-success" : "text-destructive")}>
                    {formatCurrency(performanceAfterResult[1]?.avgPnl || 0)}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// METRIC CARD COMPONENT
// ═══════════════════════════════════════════════════════════════

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
