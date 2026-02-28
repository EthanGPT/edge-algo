import { Link } from "react-router-dom";
import {
  BarChart3,
  CheckCircle,
  ArrowRight,
  FileText,
  Calendar,
  LineChart,
  ExternalLink,
} from "lucide-react";
import {
  BACKTEST_HIGHLIGHTS,
  INSTRUMENT_STATS,
  BACKTEST_CONFIG,
} from "@/data/backtestStats";

export default function MemberHub() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Results Dashboard</h1>
        <p className="page-subtitle">Track performance, log trades, build your track record</p>
      </div>

      {/* Quick Access Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Trade Journal - Main CTA */}
        <Link
          to="/trade-journal"
          className="stat-card group relative overflow-hidden transition-all hover:border-accent"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20">
            <BarChart3 className="h-5 w-5 text-accent" />
          </div>
          <h3 className="mt-3 font-semibold text-foreground">Trade Journal</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Log trades, track P&L, analyze performance
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent group-hover:underline">
            Open Journal <ArrowRight className="h-3 w-3" />
          </span>
        </Link>

        {/* Analytics */}
        <Link
          to="/analytics"
          className="stat-card group transition-all hover:border-accent"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20">
            <LineChart className="h-5 w-5 text-accent" />
          </div>
          <h3 className="mt-3 font-semibold text-foreground">Analytics</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Performance charts, metrics, and insights
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent group-hover:underline">
            View Analytics <ArrowRight className="h-3 w-3" />
          </span>
        </Link>

        {/* Course - HIGHLIGHTED */}
        <Link
          to="/course"
          className="stat-card group relative overflow-hidden transition-all border-2 border-gold ring-2 ring-gold/20 hover:ring-gold/40"
        >
          {/* Important Badge */}
          <div className="absolute top-0 right-0">
            <div className="bg-gold text-background text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
              STRATEGY
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/20">
            <FileText className="h-5 w-5 text-gold" />
          </div>
          <h3 className="mt-3 font-semibold text-foreground">KLBS Strategy Guide</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The complete system with optimized parameters
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gold group-hover:underline">
            Read the Strategy <ArrowRight className="h-3 w-3" />
          </span>
        </Link>

        {/* P&L Calendar */}
        <Link
          to="/calendar"
          className="stat-card group relative transition-all hover:border-accent"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20">
            <Calendar className="h-5 w-5 text-accent" />
          </div>
          <h3 className="mt-3 font-semibold text-foreground">P&L Calendar</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Daily and weekly performance at a glance
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent group-hover:underline">
            View Calendar <ArrowRight className="h-3 w-3" />
          </span>
        </Link>
      </div>

      {/* Verified Backtest Results */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Verified Backtest Results</h2>
            <p className="text-sm text-muted-foreground">
              Key Level Breakout System — {BACKTEST_CONFIG.dataYears} Years of CME Data
            </p>
          </div>
          <Link
            to="/backtest"
            className="flex items-center gap-1 rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/30 transition-colors"
          >
            VERIFIED <ExternalLink className="h-3 w-3 ml-1" />
          </Link>
        </div>

        {/* Big headline stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-background/50 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-accent">{BACKTEST_HIGHLIGHTS.totalPnl}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Profit</p>
          </div>
          <div className="bg-background/50 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-foreground">{BACKTEST_HIGHLIGHTS.totalReturn}</p>
            <p className="text-xs text-muted-foreground mt-1">Return on $100K</p>
          </div>
          <div className="bg-background/50 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-foreground">{BACKTEST_HIGHLIGHTS.totalTrades}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Trades</p>
          </div>
          <div className="bg-background/50 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-foreground">{BACKTEST_HIGHLIGHTS.profitableYears}</p>
            <p className="text-xs text-muted-foreground mt-1">Years Profitable</p>
          </div>
        </div>

        {/* Detailed stats row */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          <div className="text-center">
            <p className="text-xl font-bold text-accent">{BACKTEST_HIGHLIGHTS.winRate}</p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-foreground">{BACKTEST_HIGHLIGHTS.profitFactor}</p>
            <p className="text-xs text-muted-foreground">Profit Factor</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-foreground">{BACKTEST_HIGHLIGHTS.avgYearlyReturn}</p>
            <p className="text-xs text-muted-foreground">Avg Yearly P&L</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-foreground">{BACKTEST_CONFIG.dataYears}</p>
            <p className="text-xs text-muted-foreground">Years of Data</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-foreground">4+4+2</p>
            <p className="text-xs text-muted-foreground">MNQ+MES+MGC</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-accent">Low</p>
            <p className="text-xs text-muted-foreground">Risk Level</p>
          </div>
        </div>

        {/* Instrument breakdown mini */}
        <div className="mt-6 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">By Instrument</p>
          <div className="grid grid-cols-3 gap-3">
            {INSTRUMENT_STATS.map((inst) => (
              <div key={inst.symbol} className="bg-background/30 rounded p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{inst.symbol}</span>
                  <span className="text-sm font-medium text-accent">
                    +${(inst.totalPnl / 1000).toFixed(0)}K
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{inst.contracts} cts</span>
                  <span>{inst.winRate.toFixed(0)}% WR</span>
                  <span>{inst.trades.toLocaleString()} trades</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Backtested results. Simulated performance. Past results do not guarantee future performance.
        </p>
      </div>

      {/* Strategy Overview */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* The System */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-semibold text-foreground">The Key Level Breakout System</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            A liquidity-based futures strategy built on the 6 most important intraday price levels.
          </p>

          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-medium text-accent">1</div>
              <div>
                <p className="text-sm font-medium text-foreground">Identify the Level</p>
                <p className="text-xs text-muted-foreground">PDH, PDL, PMH, PML, LPH, LPL</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-medium text-accent">2</div>
              <div>
                <p className="text-sm font-medium text-foreground">Wait for Clean Break</p>
                <p className="text-xs text-muted-foreground">Full 15m candle close beyond level</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-medium text-accent">3</div>
              <div>
                <p className="text-sm font-medium text-foreground">Enter on Retest</p>
                <p className="text-xs text-muted-foreground">SL/TP varies by asset, then trail</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-semibold text-foreground">Quick Links</h3>

          <div className="mt-4 space-y-3">
            <Link to="/backtest" className="flex items-center gap-3 group">
              <CheckCircle className="h-4 w-4 text-accent" />
              <span className="text-sm text-foreground group-hover:text-accent transition-colors">
                Full Backtest Results
              </span>
            </Link>
            <Link to="/course" className="flex items-center gap-3 group">
              <CheckCircle className="h-4 w-4 text-gold" />
              <span className="text-sm text-foreground font-medium group-hover:text-gold transition-colors">
                KLBS Strategy Guide
              </span>
            </Link>
            <Link to="/analytics" className="flex items-center gap-3 group">
              <CheckCircle className="h-4 w-4 text-accent" />
              <span className="text-sm text-foreground group-hover:text-accent transition-colors">
                Performance Analytics
              </span>
            </Link>
            <Link to="/accounts" className="flex items-center gap-3 group">
              <CheckCircle className="h-4 w-4 text-accent" />
              <span className="text-sm text-foreground group-hover:text-accent transition-colors">
                Prop Firm Accounts
              </span>
            </Link>
            <Link to="/economic-calendar" className="flex items-center gap-3 group">
              <CheckCircle className="h-4 w-4 text-accent" />
              <span className="text-sm text-foreground group-hover:text-accent transition-colors">
                Economic Calendar
              </span>
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
