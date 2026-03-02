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
  DAY_OF_WEEK_STATS,
  SESSION_STATS,
  MONTH_STATS,
  LEVEL_STATS,
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
                    +${(inst.netPnl / 1000).toFixed(0)}K
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

      {/* Performance Breakdowns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Day of Week */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-semibold text-foreground mb-4">Performance by Day</h3>
          <div className="space-y-2">
            {DAY_OF_WEEK_STATS.map((day) => {
              const maxPnl = Math.max(...DAY_OF_WEEK_STATS.map(d => d.pnl));
              const barWidth = (day.pnl / maxPnl) * 100;
              return (
                <div key={day.day} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-muted-foreground">{day.day.slice(0, 3)}</span>
                  <div className="flex-1 h-6 bg-background/50 rounded overflow-hidden relative">
                    <div
                      className="h-full bg-accent/30 rounded"
                      style={{ width: `${barWidth}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                      {day.winRate.toFixed(0)}% WR
                    </span>
                  </div>
                  <span className="w-16 text-right text-xs font-medium text-accent">
                    +${(day.pnl / 1000).toFixed(0)}K
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground text-center">
            Friday best day: 61.4% WR, +$303K
          </p>
        </div>

        {/* Session Comparison */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-semibold text-foreground mb-4">Session Comparison</h3>
          <div className="grid grid-cols-2 gap-4">
            {SESSION_STATS.map((sess) => (
              <div key={sess.session} className="bg-background/50 rounded-lg p-4 text-center">
                <p className="text-lg font-bold text-foreground">{sess.session}</p>
                <p className="text-2xl font-bold text-accent mt-2">
                  +${(sess.pnl / 1000).toFixed(0)}K
                </p>
                <div className="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>{sess.winRate.toFixed(1)}% WR</span>
                  <span>{sess.trades.toLocaleString()} trades</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground text-center">
            London: 84% of trades, NY: 16% of trades
          </p>
        </div>

        {/* Monthly Performance */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-semibold text-foreground mb-4">Monthly Performance</h3>
          <div className="grid grid-cols-6 gap-2">
            {MONTH_STATS.map((month) => {
              const maxPnl = Math.max(...MONTH_STATS.map(m => m.pnl));
              const intensity = Math.round((month.pnl / maxPnl) * 100);
              return (
                <div
                  key={month.month}
                  className="text-center p-2 rounded"
                  style={{
                    backgroundColor: `rgba(200, 245, 74, ${intensity / 200})`,
                  }}
                >
                  <p className="text-[10px] text-muted-foreground">{month.month}</p>
                  <p className="text-xs font-bold">{month.winRate.toFixed(0)}%</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-between text-xs text-muted-foreground">
            <span>Best: Nov (63.4% WR)</span>
            <span>Weakest: Dec (57.7% WR)</span>
          </div>
        </div>

        {/* Level Performance */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="font-semibold text-foreground mb-4">Performance by Level</h3>
          <div className="space-y-2">
            {LEVEL_STATS.map((lvl) => {
              const maxPnl = Math.max(...LEVEL_STATS.map(l => l.pnl));
              const barWidth = (lvl.pnl / maxPnl) * 100;
              return (
                <div key={lvl.level} className="flex items-center gap-3">
                  <span className="w-12 text-xs font-mono text-accent">{lvl.level}</span>
                  <div className="flex-1 h-6 bg-background/50 rounded overflow-hidden relative">
                    <div
                      className="h-full bg-accent/30 rounded"
                      style={{ width: `${barWidth}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                      {lvl.winRate.toFixed(0)}% WR · {lvl.trades.toLocaleString()} trades
                    </span>
                  </div>
                  <span className="w-16 text-right text-xs font-medium text-accent">
                    +${(lvl.pnl / 1000).toFixed(0)}K
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground text-center">
            PML (Previous Month Low) is the strongest level: 64% WR, +$406K
          </p>
        </div>
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
