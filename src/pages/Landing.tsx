import { Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { Footer } from "@/components/layout/PublicLayout";
import { Liveline } from "liveline";
import {
  BACKTEST_HIGHLIGHTS,
  COMBINED_STATS,
  YEARLY_STATS,
  INSTRUMENT_STATS,
  BACKTEST_CONFIG,
} from "@/data/backtestStats";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <BacktestShowcase />
      <RiskMetricsSection />
      <LivelineSection />
      <MethodologySection />
      <ScalingNote />
      <Footer />
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen bg-[#080808] flex flex-col">
      {/* Top Row: Nav */}
      <PublicNavbar variant="dark" />

      {/* Middle Row: Content */}
      <div className="flex-1 flex items-center justify-center px-[60px] py-20">
        <div className="text-center max-w-4xl">
          {/* Eyebrow */}
          <p className="font-mono text-[11px] tracking-[0.2em] text-[#c8f54a] uppercase mb-8">
            VERIFIED RESULTS TRACKER
          </p>

          {/* Title - 3 lines */}
          <h1
            className="font-display font-[800] uppercase leading-[0.88] tracking-[-0.04em]"
            style={{ fontSize: "clamp(64px, 9vw, 140px)" }}
          >
            {/* Line 1: Outlined */}
            <span
              className="block text-[#f5f5f5]"
            >
              THE
            </span>
            {/* Line 2: Accent highlighted */}
            <span
              className="inline-block my-2"
              style={{
                background: "#c8f54a",
                color: "#0a0a0a",
                padding: "0 16px",
              }}
            >
              EDGE
            </span>
          </h1>

          {/* Stats Banner */}
          <div className="mt-10 inline-flex items-center gap-3 bg-[#c8f54a] px-6 py-3">
            <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-[#0a0a0a]">
              {COMBINED_STATS.winRate}% WIN RATE
            </span>
            <span className="text-[#0a0a0a]/30">|</span>
            <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-[#0a0a0a]">
              {COMBINED_STATS.sharpeRatio} SHARPE
            </span>
            <span className="text-[#0a0a0a]/30">|</span>
            <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-[#0a0a0a]">
              {BACKTEST_HIGHLIGHTS.totalPnl} PROFIT
            </span>
            <span className="text-[#0a0a0a]/30">|</span>
            <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-[#0a0a0a]">
              {BACKTEST_HIGHLIGHTS.profitableYears} YEARS PROFITABLE
            </span>
          </div>

          {/* Subtext */}
          <p className="font-mono text-[13px] text-[#888] max-w-[500px] mx-auto leading-[1.8] mt-8">
            Track record, not promises. {BACKTEST_CONFIG.dataYears} years of verified backtest data
            on CME futures. Building live results with prop firm capital.
          </p>

          {/* CTA Buttons */}
          <div className="flex items-center justify-center gap-4 mt-10">
            <Link
              to="/backtest"
              className="inline-block bg-[#c8f54a] text-[#0a0a0a] font-mono text-[11px] font-bold uppercase tracking-[0.12em] px-8 py-4 transition-opacity hover:opacity-90"
            >
              VIEW FULL BACKTEST
            </Link>
            <Link
              to="/dashboard"
              className="inline-block border border-[#888] text-[#888] font-mono text-[11px] font-medium uppercase tracking-[0.12em] px-8 py-4 transition-colors hover:border-[#f5f5f5] hover:text-[#f5f5f5]"
            >
              MEMBER LOGIN
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Row: Stats */}
      <div className="px-[60px] py-8 border-t border-[#1f1f1f]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Stats Left */}
          <div className="flex items-center gap-8 md:gap-12">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-[#c8f54a]">
                {BACKTEST_HIGHLIGHTS.totalPnl}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#888]">
                PROFIT
              </span>
            </div>
            <div className="h-6 w-px bg-[#333] hidden md:block" />
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-[#f5f5f5]">
                {BACKTEST_HIGHLIGHTS.totalTrades}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#888]">
                TRADES
              </span>
            </div>
            <div className="h-6 w-px bg-[#333] hidden md:block" />
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-[#f5f5f5]">
                {BACKTEST_HIGHLIGHTS.dataYears}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#888]">
                YEARS DATA
              </span>
            </div>
          </div>

          {/* Disclaimer Right */}
          <p className="font-mono text-[10px] text-[#666] text-center md:text-right">
            Simulated backtest results. Past performance does not guarantee future results.
          </p>
        </div>
      </div>
    </section>
  );
}

function BacktestShowcase() {
  return (
    <section className="bg-[#080808] px-[60px] py-[100px] border-t border-[#1f1f1f]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="font-mono text-[10px] tracking-[0.2em] text-[#c8f54a] uppercase mb-4">
            VERIFIED BACKTEST — {BACKTEST_CONFIG.dataYears} YEARS OF CME DATA
          </p>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-[#f5f5f5] uppercase tracking-tight mb-4">
            The numbers don't lie
          </h2>
          <p className="font-mono text-[13px] text-[#888] max-w-xl mx-auto">
            $100K account. 4 MNQ, 4 MES, 2 MGC. Low risk allocation. Real CME data from{" "}
            {BACKTEST_CONFIG.dataStart.slice(0, 4)} to{" "}
            {BACKTEST_CONFIG.dataEnd.slice(0, 4)}. Every trade executed exactly
            as the indicator signals.
          </p>
        </div>

        {/* Big Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1f1f1f] mb-12">
          <div className="bg-[#0d0d0d] p-8 text-center">
            <p className="font-display text-4xl md:text-5xl font-bold text-[#c8f54a]">
              {BACKTEST_HIGHLIGHTS.totalPnl}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#666] mt-2">
              Total Profit
            </p>
          </div>
          <div className="bg-[#0d0d0d] p-8 text-center">
            <p className="font-display text-4xl md:text-5xl font-bold text-[#f5f5f5]">
              {BACKTEST_HIGHLIGHTS.totalReturn}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#666] mt-2">
              Return on $100K
            </p>
          </div>
          <div className="bg-[#0d0d0d] p-8 text-center">
            <p className="font-display text-4xl md:text-5xl font-bold text-[#f5f5f5]">
              {BACKTEST_HIGHLIGHTS.winRate}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#666] mt-2">
              Win Rate
            </p>
          </div>
          <div className="bg-[#0d0d0d] p-8 text-center">
            <p className="font-display text-4xl md:text-5xl font-bold text-[#f5f5f5]">
              {BACKTEST_HIGHLIGHTS.profitableYears}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#666] mt-2">
              Years Profitable
            </p>
          </div>
        </div>

        {/* Year-by-Year Performance */}
        <div className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#c8f54a]">
              Year-by-Year Performance
            </h3>
            <span className="font-mono text-[10px] text-[#666]">
              Every single year profitable
            </span>
          </div>

          {/* Year bars */}
          <div className="space-y-3">
            {YEARLY_STATS.filter((y) => y.year < 2026).map((year) => {
              const maxPnl = Math.max(...YEARLY_STATS.map((y) => y.pnl));
              const widthPct = (year.pnl / maxPnl) * 100;
              return (
                <div key={year.year} className="flex items-center gap-4">
                  <span className="font-mono text-[12px] text-[#888] w-12">
                    {year.year}
                  </span>
                  <div className="flex-1 h-8 bg-[#1a1a1a] rounded overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-[#c8f54a] to-[#a8d53a] rounded"
                      style={{ width: `${widthPct}%` }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-[#f5f5f5] font-medium">
                      +${(year.pnl / 1000).toFixed(0)}K
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#888] w-16 text-right">
                    {year.winRate.toFixed(0)}% WR
                  </span>
                </div>
              );
            })}
          </div>

          {/* 2026 YTD */}
          <div className="mt-4 pt-4 border-t border-[#1f1f1f]">
            <div className="flex items-center gap-4">
              <span className="font-mono text-[12px] text-[#c8f54a] w-12">
                2026
              </span>
              <span className="font-mono text-[11px] text-[#888]">
                YTD: +$31K ({YEARLY_STATS.find((y) => y.year === 2026)?.trades}{" "}
                trades)
              </span>
            </div>
          </div>
        </div>

        {/* Instrument Breakdown */}
        <div className="grid md:grid-cols-3 gap-px bg-[#1f1f1f] mt-8">
          {INSTRUMENT_STATS.map((inst) => (
            <div key={inst.symbol} className="bg-[#0d0d0d] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="font-mono text-[10px] text-[#666] uppercase">
                    {inst.contracts} contracts
                  </span>
                  <h4 className="font-display text-lg font-bold text-[#f5f5f5]">
                    {inst.symbol}
                  </h4>
                </div>
                <span className="font-mono text-xl font-bold text-[#c8f54a]">
                  +${(inst.totalPnl / 1000).toFixed(0)}K
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="font-mono text-[11px] text-[#f5f5f5]">
                    {inst.trades.toLocaleString()}
                  </p>
                  <p className="font-mono text-[9px] text-[#666] uppercase">
                    Trades
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[11px] text-[#c8f54a]">
                    {inst.winRate.toFixed(1)}%
                  </p>
                  <p className="font-mono text-[9px] text-[#666] uppercase">
                    Win Rate
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[11px] text-[#f5f5f5]">
                    {inst.profitFactor.toFixed(2)}
                  </p>
                  <p className="font-mono text-[9px] text-[#666] uppercase">
                    PF
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Link
            to="/backtest"
            className="inline-block border border-[#c8f54a]/50 text-[#c8f54a] font-mono text-[11px] font-medium uppercase tracking-[0.12em] px-8 py-4 transition-all hover:bg-[#c8f54a]/10 hover:border-[#c8f54a]"
          >
            View Full Backtest Report
          </Link>
        </div>
      </div>
    </section>
  );
}

function RiskMetricsSection() {
  return (
    <section className="bg-[#080808] px-[60px] py-[80px] border-t border-[#1f1f1f]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="font-mono text-[10px] tracking-[0.2em] text-[#c8f54a] uppercase mb-4">
            RISK-ADJUSTED RETURNS
          </p>
          <h2 className="font-display text-3xl font-bold text-[#f5f5f5] uppercase tracking-tight">
            Institutional-grade metrics
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1f1f1f]">
          <div className="bg-[#0d0d0d] p-8 text-center">
            <p className="font-display text-4xl font-bold text-[#c8f54a]">
              {COMBINED_STATS.sharpeRatio}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888] mt-2">
              Sharpe Ratio
            </p>
            <p className="font-mono text-[9px] text-[#555] mt-1">
              &gt;1 good, &gt;2 excellent
            </p>
          </div>
          <div className="bg-[#0d0d0d] p-8 text-center">
            <p className="font-display text-4xl font-bold text-[#c8f54a]">
              {COMBINED_STATS.sortinoRatio}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888] mt-2">
              Sortino Ratio
            </p>
            <p className="font-mono text-[9px] text-[#555] mt-1">
              Downside risk-adjusted
            </p>
          </div>
          <div className="bg-[#0d0d0d] p-8 text-center">
            <p className="font-display text-4xl font-bold text-[#f5f5f5]">
              {COMBINED_STATS.calmarRatio}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888] mt-2">
              Calmar Ratio
            </p>
            <p className="font-mono text-[9px] text-[#555] mt-1">
              Return / Max Drawdown
            </p>
          </div>
          <div className="bg-[#0d0d0d] p-8 text-center">
            <p className="font-display text-4xl font-bold text-[#f5f5f5]">
              ${Math.abs(COMBINED_STATS.maxDrawdown).toLocaleString()}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#888] mt-2">
              Max Drawdown
            </p>
            <p className="font-mono text-[9px] text-[#555] mt-1">
              Worst peak-to-trough
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function LivelineSection() {
  const [data, setData] = useState<{ time: number; value: number }[]>([]);
  const [currentValue, setCurrentValue] = useState(0);
  const runningTotal = useRef(0);

  useEffect(() => {
    // Seed with ~60 historical points
    const initialData: { time: number; value: number }[] = [];
    const now = Math.floor(Date.now() / 1000);
    let value = 1000; // Start at 1000

    for (let i = 60; i > 0; i--) {
      // Random walk with slight positive drift
      const change = (Math.random() - 0.45) * 150;
      value += change;
      // Occasional pullbacks
      if (Math.random() > 0.9) {
        value -= Math.random() * 200;
      }
      initialData.push({
        time: now - i * 90,
        value: Math.round(value),
      });
    }

    runningTotal.current = value;
    setData(initialData);
    setCurrentValue(Math.round(value));

    // Push a new point every 1500ms
    const interval = setInterval(() => {
      const change = (Math.random() - 0.45) * 150;
      runningTotal.current += change;
      // Occasional pullbacks
      if (Math.random() > 0.92) {
        runningTotal.current -= Math.random() * 180;
      }

      const newValue = Math.round(runningTotal.current);
      setCurrentValue(newValue);
      setData((prev) => [
        ...prev.slice(-100),
        {
          time: Math.floor(Date.now() / 1000),
          value: newValue,
        },
      ]);
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="bg-[#080808] px-[60px] py-[80px]">
      <div className="max-w-[900px] mx-auto">
        {/* Chart only */}
        <div className="h-[280px] w-full">
          {data.length > 0 && (
            <Liveline
              data={data}
              value={currentValue}
              color="#c8f54a"
              theme="dark"
              momentum={true}
              exaggerate={true}
              scrub={true}
              showValue={true}
              badge={false}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function MethodologySection() {
  return (
    <section className="bg-[#080808] px-[60px] py-[100px] border-t border-[#1f1f1f]">
      <div className="max-w-4xl mx-auto">
        {/* Section Label */}
        <p className="font-mono text-[10px] tracking-[0.2em] text-[#c8f54a] uppercase mb-4">
          METHODOLOGY
        </p>

        {/* Main Heading */}
        <h2 className="font-display text-3xl md:text-4xl font-bold text-[#f5f5f5] uppercase tracking-tight mb-10">
          Transparent. Verified. Reproducible.
        </h2>

        {/* Body Text */}
        <div className="space-y-6">
          <p className="font-mono text-[13px] text-[#888] leading-[1.8]">
            The Key Level Breakout System (KLBS) is a mechanical strategy based on
            the 6 most significant intraday liquidity levels: Previous Day High/Low,
            Pre-Market High/Low, and London Pre-Market High/Low.
          </p>
          <p className="font-mono text-[13px] text-[#888] leading-[1.8]">
            Every trade in the backtest follows the exact same rules the indicator
            generates. No discretion. No cherry-picking. The data comes from Databento's
            CME futures feed — the same data institutions use.
          </p>
        </div>

        {/* Proof Points */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg p-5">
            <div className="w-2 h-2 bg-[#c8f54a] mb-3" />
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#f5f5f5] mb-1">
              {BACKTEST_CONFIG.dataYears} Years
            </p>
            <p className="font-mono text-[10px] text-[#666]">
              CME futures data
            </p>
          </div>
          <div className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg p-5">
            <div className="w-2 h-2 bg-[#c8f54a] mb-3" />
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#f5f5f5] mb-1">
              {COMBINED_STATS.totalTrades.toLocaleString()} Trades
            </p>
            <p className="font-mono text-[10px] text-[#666]">
              Statistical significance
            </p>
          </div>
          <div className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg p-5">
            <div className="w-2 h-2 bg-[#c8f54a] mb-3" />
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#f5f5f5] mb-1">
              Period Stable
            </p>
            <p className="font-mono text-[10px] text-[#666]">
              Consistent across regimes
            </p>
          </div>
          <div className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg p-5">
            <div className="w-2 h-2 bg-[#c8f54a] mb-3" />
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#f5f5f5] mb-1">
              Trail Only
            </p>
            <p className="font-mono text-[10px] text-[#666]">
              No breakeven complexity
            </p>
          </div>
        </div>

        {/* Reports Link */}
        <div className="mt-12 flex flex-wrap gap-4">
          <a
            href="/klbs_backtest_report.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block border border-[#c8f54a]/50 text-[#c8f54a] font-mono text-[10px] font-medium uppercase tracking-[0.12em] px-6 py-3 transition-all hover:bg-[#c8f54a]/10"
          >
            Full Interactive Report
          </a>
          <a
            href="/klbs_oos_report.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block border border-[#888]/50 text-[#888] font-mono text-[10px] font-medium uppercase tracking-[0.12em] px-6 py-3 transition-all hover:bg-[#888]/10"
          >
            Period Stability Analysis
          </a>
        </div>
      </div>
    </section>
  );
}

function ScalingNote() {
  return (
    <section className="bg-[#080808] px-[60px] py-[80px] border-t border-[#1f1f1f]">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-[#0d0d0d] to-[#1a1a0d] border-2 border-[#c8f54a]/20 rounded-lg p-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-[#c8f54a] text-[#080808] font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1">
              Important
            </span>
          </div>
          <h3 className="font-display text-xl font-bold text-[#f5f5f5] mb-3">
            Fixed Position Sizing — No Compounding
          </h3>
          <p className="font-mono text-[12px] text-[#888] leading-relaxed mb-4">
            This backtest uses <span className="text-[#f5f5f5] font-bold">fixed contract sizes (4 MNQ, 4 MES, 2 MGC)</span> for
            the entire {BACKTEST_CONFIG.dataYears} year period with zero scaling. In reality, as your account grows from $100K to $200K+, you would
            naturally increase position sizes — compounding your returns significantly.
          </p>
          <p className="font-mono text-[12px] text-[#888] leading-relaxed">
            <span className="text-[#c8f54a] font-bold">The upside potential is substantially higher</span> with smart scaling,
            position sizing optimization, and compounding. These results represent the conservative baseline — the floor, not the ceiling.
          </p>
        </div>

        {/* Disclaimer */}
        <p className="font-mono text-[9px] text-[#555] text-center mt-8 max-w-2xl mx-auto leading-relaxed">
          DISCLAIMER: These results are from backtesting on historical data.
          Past performance does not guarantee future results. Slippage,
          commissions, and fees not included. Trading futures involves
          substantial risk of loss and is not suitable for all investors.
        </p>
      </div>
    </section>
  );
}
