import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  TrendingUp,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap,
  BarChart3,
} from "lucide-react";
import {
  INSTRUMENT_STATS,
  COMBINED_STATS,
  YEARLY_STATS,
  BACKTEST_HIGHLIGHTS,
} from "@/data/backtestStats";

export default function EdgeCourse() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
            <a
              href="/Edge_Course.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </a>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-12">
        {/* Title Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-gold/20 px-4 py-1 text-sm font-medium text-gold">
            <Zap className="h-4 w-4" />
            KLBS Strategy Guide
          </div>
          <h1 className="text-4xl font-bold text-foreground">
            The Key Level Breakout System
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A liquidity-based futures strategy built on the 6 most important intraday price levels.
            Mechanical approach with clear, repeatable entries and defined risk.
          </p>
        </div>

        {/* Verified Stats Banner */}
        <div className="rounded-xl border-2 border-gold bg-gold/10 p-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <CheckCircle className="h-5 w-5 text-gold" />
            <span className="text-sm font-semibold text-gold uppercase tracking-wider">
              Verified Backtest Results (Optimized)
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{BACKTEST_HIGHLIGHTS.totalPnl}</p>
              <p className="text-xs text-muted-foreground">Total P&L</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-accent">{BACKTEST_HIGHLIGHTS.totalReturn}</p>
              <p className="text-xs text-muted-foreground">Return on $100K</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{BACKTEST_HIGHLIGHTS.winRate}</p>
              <p className="text-xs text-muted-foreground">Win Rate</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{BACKTEST_HIGHLIGHTS.profitFactor}</p>
              <p className="text-xs text-muted-foreground">Profit Factor</p>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Contract Allocation: {BACKTEST_HIGHLIGHTS.contractAllocation} | {BACKTEST_HIGHLIGHTS.dataYears} Years of Data | {BACKTEST_HIGHLIGHTS.profitableYears} Profitable Years
          </p>
        </div>

        {/* The 6 Key Levels */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Target className="h-6 w-6 text-accent" />
            The 6 Key Levels
          </h2>
          <p className="text-muted-foreground">
            These are the only levels we trade. Every level represents significant liquidity and institutional interest.
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Daily Levels */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground mb-3">Daily Levels</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-accent">PDH</span>
                  <span className="text-sm text-muted-foreground">Previous Day High</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-accent">PDL</span>
                  <span className="text-sm text-muted-foreground">Previous Day Low</span>
                </div>
              </div>
            </div>

            {/* Pre Market Levels */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground mb-3">Pre Market Levels</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-gold">PMH</span>
                  <span className="text-sm text-muted-foreground">Pre Market High</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-gold">PML</span>
                  <span className="text-sm text-muted-foreground">Pre Market Low</span>
                </div>
              </div>
            </div>

            {/* Session Levels */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground mb-3">Session Levels</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-foreground">LPH</span>
                  <span className="text-sm text-muted-foreground">London Pre-Market High</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-foreground">LPL</span>
                  <span className="text-sm text-muted-foreground">London Pre-Market Low</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">00:00 - 03:00 ET</p>
            </div>
          </div>
        </section>

        {/* Trading Sessions */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="h-6 w-6 text-accent" />
            Trading Sessions
          </h2>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-accent bg-accent/10 p-5">
              <h3 className="font-semibold text-foreground">London Session</h3>
              <p className="text-2xl font-mono text-accent mt-2">03:00 - 08:00 ET</p>
              <p className="text-sm text-muted-foreground mt-2">Trend continuation, level breaks</p>
            </div>

            <div className="rounded-lg border border-destructive bg-destructive/10 p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="font-semibold text-foreground">Dead Zone</h3>
              </div>
              <p className="text-2xl font-mono text-destructive mt-2">08:00 - 09:00 ET</p>
              <p className="text-sm text-muted-foreground mt-2">NO TRADING. Levels get disarmed.</p>
            </div>

            <div className="rounded-lg border border-gold bg-gold/10 p-5">
              <h3 className="font-semibold text-foreground">New York Session</h3>
              <p className="text-2xl font-mono text-gold mt-2">09:30 - 16:00 ET</p>
              <p className="text-sm text-muted-foreground mt-2">High volatility, trend reversals</p>
            </div>
          </div>
        </section>

        {/* Entry Rules */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-accent" />
            Entry Rules
          </h2>

          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white font-bold">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Identify the Level</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Wait for price to approach one of the 6 key levels (PDH, PDL, PMH, PML, LPH, LPL).
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white font-bold">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Wait for Clean Break (Arm the Level)</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    The level is <span className="text-accent font-medium">armed</span> when a full 15-minute candle closes completely beyond the level:
                  </p>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                    <li>• Bullish break: entire candle body and wicks above the level</li>
                    <li>• Bearish break: entire candle body and wicks below the level</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white font-bold">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Enter on Retest</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Once armed, wait for price to return to the retest zone and enter in the direction of the breakout.
                  </p>
                  <div className="mt-2 flex gap-4 text-sm">
                    <span className="text-muted-foreground">MNQ/MES: <span className="text-foreground font-medium">±5 points</span></span>
                    <span className="text-muted-foreground">MGC: <span className="text-foreground font-medium">±3 points</span></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Risk Management */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-accent" />
            Risk Management (Optimized)
          </h2>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-card">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Instrument</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Contracts</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-accent">Take Profit</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-destructive">Stop Loss</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Trail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {INSTRUMENT_STATS.map((inst) => (
                  <tr key={inst.symbol} className="bg-background">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-foreground">{inst.symbol}</span>
                      <span className="text-muted-foreground text-sm ml-2">({inst.name})</span>
                    </td>
                    <td className="px-4 py-3 text-center text-foreground">{inst.contracts}</td>
                    <td className="px-4 py-3 text-center text-accent font-medium">{inst.tp} pts</td>
                    <td className="px-4 py-3 text-center text-destructive font-medium">{inst.sl} pts</td>
                    <td className="px-4 py-3 text-center text-foreground">5 pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Trail Mode */}
          <div className="rounded-lg border-2 border-accent bg-accent/10 p-5">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent" />
              Trail Mode (No Breakeven)
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              Once TP is hit, immediately start trailing by 5 points from the highest/lowest point reached.
              <span className="text-accent font-medium"> Do NOT move stop to breakeven first</span> — trail directly and let winners run.
            </p>
            <p className="text-xs text-muted-foreground mt-3 p-2 bg-background/50 rounded">
              <strong>Why no breakeven?</strong> Backtesting showed Trail Only mode outperforms BE+Trail by +30%. Breakeven stop-outs often exit winning trades prematurely.
            </p>
          </div>
        </section>

        {/* Critical Rules */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            Critical Rules
          </h2>

          <div className="space-y-4">
            {/* Rule 1 */}
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-5">
              <h3 className="font-semibold text-foreground">Rule 1: Level Locking (One Trade Per Level Per Day)</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Once a level fires a signal (regardless of outcome), that level is <span className="text-destructive font-medium">locked</span> for the remainder of the trading day.
              </p>
              <div className="mt-3 text-sm bg-background/50 rounded p-3">
                <p className="text-muted-foreground">
                  <strong>Example:</strong> PDH breaks at 10:00, you enter long at 10:30, trade stops out at 11:00.
                  PDH is now LOCKED — no more trades on PDH today, even if it arms again.
                </p>
              </div>
            </div>

            {/* Rule 2 */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground">Rule 2: Dead Zone Disarms Levels</h3>
              <p className="text-sm text-muted-foreground mt-2">
                If price enters a level's retest zone during the dead zone (08:00-09:00 ET), that level is disarmed and cannot fire until it's broken and armed again.
              </p>
            </div>
          </div>
        </section>

        {/* Performance Stats */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-accent" />
            Performance Breakdown
          </h2>

          {/* By Instrument */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="bg-card px-4 py-3">
              <h3 className="font-semibold text-foreground">By Instrument ({COMBINED_STATS.totalTrades.toLocaleString()} Total Trades)</h3>
            </div>
            <table className="w-full">
              <thead className="bg-card/50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">Instrument</th>
                  <th className="px-4 py-2 text-center text-sm font-medium text-muted-foreground">Trades</th>
                  <th className="px-4 py-2 text-center text-sm font-medium text-muted-foreground">Win Rate</th>
                  <th className="px-4 py-2 text-center text-sm font-medium text-muted-foreground">Total P&L</th>
                  <th className="px-4 py-2 text-center text-sm font-medium text-muted-foreground">Profit Factor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {INSTRUMENT_STATS.map((inst) => (
                  <tr key={inst.symbol} className="bg-background">
                    <td className="px-4 py-3 font-semibold text-foreground">{inst.symbol}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{inst.trades.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center text-foreground">{inst.winRate}%</td>
                    <td className="px-4 py-3 text-center text-accent font-medium">${inst.totalPnl.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center text-foreground">{inst.profitFactor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Year by Year */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="bg-card px-4 py-3">
              <h3 className="font-semibold text-foreground">Year-by-Year Performance</h3>
            </div>
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2 p-4 bg-background">
              {YEARLY_STATS.map((year) => (
                <div key={year.year} className="text-center p-2 rounded bg-card">
                  <p className="text-xs text-muted-foreground">{year.year}</p>
                  <p className="text-sm font-bold text-accent">+${(year.pnl / 1000).toFixed(0)}K</p>
                  <p className="text-xs text-muted-foreground">{year.winRate}%</p>
                </div>
              ))}
            </div>
            <div className="bg-accent/10 px-4 py-2 text-center">
              <span className="text-sm font-medium text-accent">Every single year profitable.</span>
            </div>
          </div>
        </section>

        {/* Common Mistakes */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <XCircle className="h-6 w-6 text-destructive" />
            Common Mistakes to Avoid
          </h2>

          <div className="grid md:grid-cols-2 gap-3">
            {[
              "Trading during dead zone (08:00-09:00 ET)",
              "Not waiting for clean break",
              "Re-entering locked levels",
              "Moving stops manually",
              "Overleveraging",
              "Using breakeven stops",
            ].map((mistake, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                <span className="text-sm text-foreground">{mistake}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Execution Checklist */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CheckCircle className="h-6 w-6 text-accent" />
            Execution Checklist
          </h2>

          <div className="rounded-lg border border-accent bg-accent/5 p-5">
            <p className="text-sm text-muted-foreground mb-4">Before every trade, confirm:</p>
            <div className="space-y-2">
              {[
                "Price has cleanly broken the level (full 15m candle through)",
                "Level is not already locked for today",
                "Currently in a trading session (not dead zone)",
                "Price has returned to the retest zone",
                "Risk is sized correctly for your account",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded border border-accent flex items-center justify-center">
                    <CheckCircle className="h-3 w-3 text-accent" />
                  </div>
                  <span className="text-sm text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Disclaimer */}
        <div className="rounded-lg bg-muted/30 p-5 text-center">
          <p className="text-xs text-muted-foreground">
            These results are from backtested data using historical CME futures prices (Databento).
            Past performance does not guarantee future results. Trading futures involves substantial risk of loss.
            Only trade with capital you can afford to lose.
          </p>
        </div>

        {/* Footer CTA */}
        <div className="flex justify-center gap-4">
          <a
            href="/Edge_Course.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-semibold text-white hover:bg-accent/90 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download PDF Version
          </a>
          <Link
            to="/dashboard"
            className="flex items-center gap-2 rounded-lg border border-border px-6 py-3 font-semibold text-foreground hover:bg-card transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
