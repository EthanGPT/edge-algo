import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Download, TrendingUp, BarChart3 } from "lucide-react";
import {
  BACKTEST_HIGHLIGHTS,
  COMBINED_STATS,
  YEARLY_STATS,
  INSTRUMENT_STATS,
  BACKTEST_CONFIG,
} from "@/data/backtestStats";

export default function Backtest() {
  return (
    <div className="min-h-screen bg-[#080808]">
      {/* Header */}
      <header className="border-b border-[#1f1f1f] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-[#888] hover:text-[#f5f5f5] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="font-mono text-[11px] uppercase tracking-wider">Back</span>
            </Link>
            <div className="h-4 w-px bg-[#333]" />
            <h1 className="font-display text-lg font-bold text-[#f5f5f5]">
              KLBS Backtest Results
            </h1>
          </div>
          <a
            href="/klbs_backtest_report.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border border-[#c8f54a]/50 text-[#c8f54a] font-mono text-[10px] uppercase tracking-wider px-4 py-2 hover:bg-[#c8f54a]/10 transition-colors"
          >
            Full Interactive Report <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Overview Section */}
        <section className="mb-16">
          <div className="text-center mb-12">
            <p className="font-mono text-[10px] tracking-[0.2em] text-[#c8f54a] uppercase mb-3">
              KEY LEVEL BREAKOUT SYSTEM
            </p>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-[#f5f5f5] uppercase tracking-tight mb-4">
              {BACKTEST_CONFIG.dataYears} Years of Verified Results
            </h2>
            <p className="font-mono text-[13px] text-[#888] max-w-2xl mx-auto">
              Complete backtest using {BACKTEST_CONFIG.dataSource}. 15-minute
              bars. $100,000 starting capital with low-risk allocation: 4 MNQ, 4
              MES, 2 MGC micro contracts.
            </p>
          </div>

          {/* Hero Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1f1f1f] mb-8">
            <div className="bg-[#0d0d0d] p-8 text-center">
              <p className="font-display text-5xl md:text-6xl font-bold text-[#c8f54a]">
                {BACKTEST_HIGHLIGHTS.totalPnl}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#666] mt-2">
                Total Profit
              </p>
            </div>
            <div className="bg-[#0d0d0d] p-8 text-center">
              <p className="font-display text-5xl md:text-6xl font-bold text-[#f5f5f5]">
                {BACKTEST_HIGHLIGHTS.totalReturn}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#666] mt-2">
                Total Return
              </p>
            </div>
            <div className="bg-[#0d0d0d] p-8 text-center">
              <p className="font-display text-5xl md:text-6xl font-bold text-[#f5f5f5]">
                {COMBINED_STATS.totalTrades.toLocaleString()}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#666] mt-2">
                Total Trades
              </p>
            </div>
            <div className="bg-[#0d0d0d] p-8 text-center">
              <p className="font-display text-5xl md:text-6xl font-bold text-[#f5f5f5]">
                {BACKTEST_HIGHLIGHTS.profitableYears}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#666] mt-2">
                Years Profitable
              </p>
            </div>
          </div>
        </section>

        {/* Year by Year Section */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#c8f54a]">
              Year-by-Year Performance
            </h3>
            <span className="font-mono text-[10px] text-[#666]">
              Every complete year profitable since 2019
            </span>
          </div>

          <div className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg overflow-hidden">
            <div className="grid grid-cols-[80px_1fr_100px_100px_100px] gap-4 px-6 py-3 border-b border-[#1f1f1f] bg-[#0a0a0a]">
              <span className="font-mono text-[10px] uppercase text-[#666]">Year</span>
              <span className="font-mono text-[10px] uppercase text-[#666]">P&L</span>
              <span className="font-mono text-[10px] uppercase text-[#666] text-right">Win Rate</span>
              <span className="font-mono text-[10px] uppercase text-[#666] text-right">Trades</span>
              <span className="font-mono text-[10px] uppercase text-[#666] text-right">Monthly Avg</span>
            </div>
            {YEARLY_STATS.map((year, idx) => {
              const maxPnl = Math.max(...YEARLY_STATS.map((y) => y.pnl));
              const widthPct = (year.pnl / maxPnl) * 100;
              const isYtd = year.year === 2026;
              const monthsInYear = isYtd ? 2 : 12; // Feb 2026 YTD
              const monthlyAvg = year.pnl / monthsInYear;

              return (
                <div
                  key={year.year}
                  className={`grid grid-cols-[80px_1fr_100px_100px_100px] gap-4 px-6 py-4 items-center ${
                    idx % 2 === 0 ? "bg-[#0d0d0d]" : "bg-[#0a0a0a]"
                  } ${isYtd ? "border-t border-[#1f1f1f]" : ""}`}
                >
                  <span className={`font-mono text-[13px] ${isYtd ? "text-[#c8f54a]" : "text-[#f5f5f5]"}`}>
                    {year.year}
                    {isYtd && <span className="text-[10px] text-[#666] ml-2">YTD</span>}
                  </span>
                  <div className="h-6 bg-[#1a1a1a] rounded overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-[#c8f54a] to-[#a8d53a] rounded"
                      style={{ width: `${widthPct}%` }}
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-[#0a0a0a] font-bold mix-blend-difference">
                      +${(year.pnl / 1000).toFixed(0)}K
                    </span>
                  </div>
                  <span className="font-mono text-[12px] text-[#888] text-right">
                    {year.winRate.toFixed(1)}%
                  </span>
                  <span className="font-mono text-[12px] text-[#888] text-right">
                    {year.trades.toLocaleString()}
                  </span>
                  <span className="font-mono text-[12px] text-[#c8f54a] text-right">
                    +${(monthlyAvg / 1000).toFixed(1)}K
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Instrument Breakdown */}
        <section className="mb-16">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#c8f54a] mb-6">
            Performance by Instrument
          </h3>

          <div className="grid md:grid-cols-3 gap-6">
            {INSTRUMENT_STATS.map((inst) => (
              <div
                key={inst.symbol}
                className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="font-mono text-[10px] text-[#666] uppercase block">
                      {inst.contracts} contracts
                    </span>
                    <h4 className="font-display text-2xl font-bold text-[#f5f5f5]">
                      {inst.symbol}
                    </h4>
                    <span className="font-mono text-[11px] text-[#888]">
                      {inst.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-display text-3xl font-bold text-[#c8f54a]">
                      +${(inst.totalPnl / 1000).toFixed(0)}K
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#0a0a0a] rounded p-3 text-center">
                    <p className="font-mono text-[18px] font-bold text-[#f5f5f5]">
                      {inst.trades.toLocaleString()}
                    </p>
                    <p className="font-mono text-[9px] text-[#666] uppercase">
                      Trades
                    </p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded p-3 text-center">
                    <p className="font-mono text-[18px] font-bold text-[#c8f54a]">
                      {inst.winRate.toFixed(1)}%
                    </p>
                    <p className="font-mono text-[9px] text-[#666] uppercase">
                      Win Rate
                    </p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded p-3 text-center">
                    <p className="font-mono text-[18px] font-bold text-[#f5f5f5]">
                      {inst.profitFactor.toFixed(2)}
                    </p>
                    <p className="font-mono text-[9px] text-[#666] uppercase">
                      Profit Factor
                    </p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded p-3 text-center">
                    <p className="font-mono text-[18px] font-bold text-[#f5f5f5]">
                      {inst.wins.toLocaleString()}
                    </p>
                    <p className="font-mono text-[9px] text-[#666] uppercase">
                      Wins
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[#1f1f1f]">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#888]">Avg Win</span>
                    <span className="text-[#c8f54a]">+${inst.avgWin}</span>
                  </div>
                  <div className="flex justify-between text-[11px] mt-1">
                    <span className="text-[#888]">Avg Loss</span>
                    <span className="text-[#ef5350]">-${inst.avgLoss}</span>
                  </div>
                  <div className="flex justify-between text-[11px] mt-1">
                    <span className="text-[#888]">TP / SL</span>
                    <span className="text-[#f5f5f5]">{inst.tp} / {inst.sl} pts</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Combined Stats */}
        <section className="mb-16">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#c8f54a] mb-6">
            Combined Statistics
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <StatCard label="Total Wins" value={COMBINED_STATS.totalWins.toLocaleString()} color="green" />
            <StatCard label="Total Losses" value={COMBINED_STATS.totalLosses.toLocaleString()} color="red" />
            <StatCard label="Win Rate" value={`${COMBINED_STATS.winRate}%`} color="green" />
            <StatCard label="Profit Factor" value={COMBINED_STATS.profitFactor.toFixed(2)} />
            <StatCard label="Gross Profit" value={`$${(COMBINED_STATS.grossProfit / 1000).toFixed(0)}K`} color="green" />
            <StatCard label="Gross Loss" value={`$${(COMBINED_STATS.grossLoss / 1000).toFixed(0)}K`} color="red" />
            <StatCard label="Max Drawdown" value={`$${Math.abs(COMBINED_STATS.maxDrawdown).toLocaleString()}`} color="red" />
            <StatCard label="Avg Annual Return" value={`$${(COMBINED_STATS.avgAnnualReturn / 1000).toFixed(0)}K`} color="green" />
          </div>
        </section>

        {/* Data Source Info */}
        <section className="mb-16">
          <div className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg p-8">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#c8f54a] mb-4">
              Data Source & Methodology
            </h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <p className="font-mono text-[12px] text-[#888] leading-relaxed">
                  <strong className="text-[#f5f5f5]">Data Provider:</strong> {BACKTEST_CONFIG.dataSource}
                  <br />
                  <strong className="text-[#f5f5f5]">Date Range:</strong> {BACKTEST_CONFIG.dataStart} to {BACKTEST_CONFIG.dataEnd}
                  <br />
                  <strong className="text-[#f5f5f5]">Timeframe:</strong> {BACKTEST_CONFIG.timeframe}
                  <br />
                  <strong className="text-[#f5f5f5]">Starting Capital:</strong> ${BACKTEST_CONFIG.startingCapital.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="font-mono text-[12px] text-[#888] leading-relaxed">
                  <strong className="text-[#f5f5f5]">Strategy:</strong> Key Level Breakout System
                  <br />
                  <strong className="text-[#f5f5f5]">Levels:</strong> PDH, PDL, PMH, PML, LPH, LPL
                  <br />
                  <strong className="text-[#f5f5f5]">Sessions:</strong> London (3-8am ET), NY (9:30am-4pm ET)
                  <br />
                  <strong className="text-[#f5f5f5]">Risk Management:</strong> Trailing Stop Only
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center">
          <div className="bg-gradient-to-r from-[#c8f54a]/10 to-transparent border border-[#c8f54a]/30 rounded-lg p-12">
            <h3 className="font-display text-2xl font-bold text-[#f5f5f5] mb-4">
              Trade with the same edge
            </h3>
            <p className="font-mono text-[13px] text-[#888] mb-8 max-w-lg mx-auto">
              Get the exact indicator that generated these results. Automatic
              level plotting, alert signals, and tailored risk settings for MNQ,
              MES, and MGC.
            </p>
            <Link
              to="/purchase"
              className="inline-block bg-[#c8f54a] text-[#0a0a0a] font-mono text-[11px] font-bold uppercase tracking-[0.12em] px-10 py-4 transition-opacity hover:opacity-90"
            >
              Get the Indicator →
            </Link>
          </div>
        </section>

        {/* Disclaimer */}
        <p className="font-mono text-[9px] text-[#555] text-center mt-12 max-w-3xl mx-auto leading-relaxed">
          DISCLAIMER: These results are from backtesting on historical data and
          represent simulated/hypothetical performance. Past performance does not
          guarantee future results. Slippage, commissions, and fees are NOT
          included in these calculations. Real-world execution may differ
          significantly from simulated results. Market conditions change and past
          patterns may not repeat. This data is for educational purposes only and
          should not be considered financial advice. Trading futures involves
          substantial risk of loss and is not suitable for all investors.
        </p>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "green" | "red";
}) {
  const colorClass =
    color === "green"
      ? "text-[#c8f54a]"
      : color === "red"
      ? "text-[#ef5350]"
      : "text-[#f5f5f5]";

  return (
    <div className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg p-4 text-center">
      <p className={`font-mono text-[18px] font-bold ${colorClass}`}>{value}</p>
      <p className="font-mono text-[9px] text-[#666] uppercase mt-1">{label}</p>
    </div>
  );
}
