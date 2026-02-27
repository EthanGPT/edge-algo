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
      <LivelineSection />
      <FeaturesSection />
      <AboutSection />
      <PricingSection />
      <Footer />
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen bg-[#f5f0e8] flex flex-col">
      {/* Top Row: Nav - dark bar on light hero */}
      <div className="bg-[#080808]">
        <PublicNavbar variant="dark" />
      </div>

      {/* Middle Row: Content */}
      <div className="flex-1 flex items-center justify-center px-[60px] py-20">
        <div className="text-center max-w-4xl">
          {/* Eyebrow */}
          <p className="font-mono text-[11px] tracking-[0.2em] text-[#888] uppercase mb-8">
            FUTURES TRADING EDUCATION
          </p>

          {/* Title - 3 lines */}
          <h1
            className="font-display font-[800] uppercase leading-[0.88] tracking-[-0.04em]"
            style={{ fontSize: "clamp(64px, 9vw, 140px)" }}
          >
            {/* Line 1: Outlined */}
            <span
              className="block"
              style={{
                WebkitTextStroke: "2px #0a0a0a",
                color: "transparent",
              }}
            >
              TRADE
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
              WITH
            </span>
            {/* Line 3: Solid filled */}
            <span className="block text-[#0a0a0a]">AN EDGE</span>
          </h1>

          {/* Subtext */}
          <p className="font-mono text-[13px] text-[#777] max-w-[400px] mx-auto leading-[1.8] mt-10">
            A liquidity-based breakout system built on the 6 most important
            intraday levels. Indicator + course + community.
          </p>

          {/* CTA Button */}
          <Link
            to="/purchase"
            className="inline-block mt-10 bg-[#0a0a0a] text-[#f5f0e8] font-mono text-[11px] font-medium uppercase tracking-[0.12em] px-9 py-[18px] transition-opacity hover:opacity-80"
          >
            GET THE INDICATOR — $49.99/MO →
          </Link>
        </div>
      </div>

      {/* Bottom Row: Stats */}
      <div className="px-[60px] py-8 border-t border-[#0a0a0a]/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Stats Left */}
          <div className="flex items-center gap-8 md:gap-12">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-[#0a0a0a]">
                {BACKTEST_HIGHLIGHTS.totalPnl}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#888]">
                PROFIT
              </span>
            </div>
            <div className="h-6 w-px bg-[#0a0a0a]/20 hidden md:block" />
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-[#0a0a0a]">
                {BACKTEST_HIGHLIGHTS.totalTrades}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#888]">
                TRADES
              </span>
            </div>
            <div className="h-6 w-px bg-[#0a0a0a]/20 hidden md:block" />
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-[#0a0a0a]">
                {BACKTEST_HIGHLIGHTS.dataYears}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#888]">
                YEARS DATA
              </span>
            </div>
          </div>

          {/* Disclaimer Right */}
          <p className="font-mono text-[10px] text-[#888] text-center md:text-right">
            Simulated results. Past performance ≠ future results.
          </p>
        </div>
      </div>
    </section>
  );
}

function BacktestShowcase() {
  return (
    <section className="bg-[#080808] px-[60px] py-[100px]">
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
            $100K account. 4 MNQ, 4 MES, 2 MGC. Low risk. Real CME data from{" "}
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
            View Full Backtest Report →
          </Link>
        </div>

        {/* Disclaimer */}
        <p className="font-mono text-[9px] text-[#555] text-center mt-8 max-w-2xl mx-auto leading-relaxed">
          DISCLAIMER: These results are from backtesting on historical data.
          Past performance does not guarantee future results. Slippage,
          commissions, and fees not included. Trading futures involves
          substantial risk.
        </p>
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

function FeaturesSection() {
  const features = [
    {
      label: "INDICATOR",
      title: "The Indicator",
      description:
        "The backbone of Edge. Automatically plots the 6 key liquidity levels and alerts on clean breaks. Tailored risk settings for MNQ, MES, and MGC — auto-populated so you just execute.",
    },
    {
      label: "COURSE",
      title: "The Course",
      description:
        "Full PDF breakdown of the strategy — from liquidity theory to step-by-step execution rules. No fluff. Just the system.",
    },
    {
      label: "COMMUNITY",
      title: "The Community",
      description:
        "FREE Discord access with trade reviews, live executions, and direct feedback on your setups. Submit your trades anytime. Zero extra cost.",
    },
    {
      label: "JOURNAL",
      title: "The Journal",
      description:
        "A full-blown trading dashboard. Log trades, track P&L across accounts, analyze your stats, manage prop firms, and export daily snapshots. This thing is serious.",
    },
  ];

  return (
    <section id="system" className="bg-[#080808] px-[60px] py-[120px] border-t border-[#1f1f1f]">
      <div className="max-w-5xl mx-auto">
        {/* Section Header */}
        <div className="mb-16">
          <p className="font-mono text-[10px] tracking-[0.2em] text-[#c8f54a] uppercase mb-4">
            THE SYSTEM
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-[#f5f5f5] uppercase tracking-tight">
            Everything you need to execute
          </h2>
        </div>

        {/* 2x2 Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#1f1f1f]">
          {features.map((feature) => (
            <div
              key={feature.label}
              className="bg-[#141414] p-10"
            >
              <p className="font-mono text-[10px] tracking-[0.2em] text-[#c8f54a] uppercase mb-4">
                {feature.label}
              </p>
              <h3 className="font-display text-xl font-semibold text-[#f5f5f5] mb-3">
                {feature.title}
              </h3>
              <p className="font-mono text-[13px] text-[#888] leading-[1.8]">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section className="bg-[#080808] px-[60px] py-[120px] border-t border-[#1f1f1f]">
      <div className="max-w-3xl mx-auto">
        {/* Section Label */}
        <p className="font-mono text-[10px] tracking-[0.2em] text-[#c8f54a] uppercase mb-4">
          ABOUT
        </p>

        {/* Main Heading */}
        <h2 className="font-display text-3xl md:text-4xl font-bold text-[#f5f5f5] uppercase tracking-tight mb-10">
          Real trading. Real transparency.
        </h2>

        {/* Body Text */}
        <div className="space-y-6">
          <p className="font-mono text-[13px] text-[#888] leading-[1.8]">
            I'm an ex-prop firm founder actively trading this system right now.
            The indicator model is valid — the backtest proves it. My edge has
            been the emotional discipline to follow it consistently, which I'm
            building alongside you.
          </p>
          <p className="font-mono text-[13px] text-[#888] leading-[1.8]">
            This isn't a guru selling screenshots. It's a transparent, real-time
            trading education built on a strategy I developed, backtested, and
            trade myself. You'll see my journal. My losses. My process.
          </p>
          <p className="font-mono text-[14px] text-[#f5f5f5] leading-[1.8] mt-8">
            I'm building this alongside you — not above you.
          </p>
        </div>

        {/* Proof Points */}
        <div className="mt-12 flex flex-wrap gap-8">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-[#c8f54a]" />
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#f5f5f5]">
              Currently trading
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-[#c8f54a]" />
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#f5f5f5]">
              {BACKTEST_CONFIG.dataYears}-year backtest
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-[#c8f54a]" />
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#f5f5f5]">
              Public trade record
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section className="bg-[#080808] px-[60px] py-[120px] border-t border-[#1f1f1f]">
      <div className="max-w-4xl mx-auto">
        {/* Section Header */}
        <div className="mb-16">
          <p className="font-mono text-[10px] tracking-[0.2em] text-[#c8f54a] uppercase mb-4">
            PRICING
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-[#f5f5f5] uppercase tracking-tight">
            Simple, transparent pricing
          </h2>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#1f1f1f]">
          {/* The Indicator */}
          <div className="bg-[#141414] p-10">
            <p className="font-mono text-[10px] tracking-[0.2em] text-[#888] uppercase mb-2">
              STARTER
            </p>
            <h3 className="font-display text-2xl font-bold text-[#f5f5f5] mb-1">
              The Indicator
            </h3>
            <p className="font-mono text-[12px] text-[#555] mb-6">
              The tool. Just the tool.
            </p>

            <div className="mb-8">
              <span className="font-display text-4xl font-bold text-[#f5f5f5]">
                $49.99
              </span>
              <span className="font-mono text-[12px] text-[#888]">/mo</span>
            </div>

            <ul className="space-y-4 mb-10">
              {[
                "Key Level Breakout Indicator",
                "TradingView access within 24hrs",
                "Works on MNQ, MES, MGC",
                "Tailored risk settings per asset",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-[#c8f54a] mt-2 flex-shrink-0" />
                  <span className="font-mono text-[12px] text-[#888]">
                    {item}
                  </span>
                </li>
              ))}
            </ul>

            <Link
              to="/purchase"
              className="block w-full text-center border border-[#c8f54a] text-[#c8f54a] font-mono text-[11px] font-medium uppercase tracking-[0.12em] py-4 transition-colors hover:bg-[#c8f54a]/10"
            >
              GET THE INDICATOR →
            </Link>
          </div>

          {/* Edge */}
          <div className="bg-[#141414] p-10 relative">
            <div className="absolute top-6 right-6 bg-[#c8f54a] px-3 py-1">
              <span className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-[#0a0a0a]">
                RECOMMENDED
              </span>
            </div>

            <p className="font-mono text-[10px] tracking-[0.2em] text-[#888] uppercase mb-2">
              FULL ACCESS
            </p>
            <h3 className="font-display text-2xl font-bold text-[#f5f5f5] mb-1">
              Edge
            </h3>
            <p className="font-mono text-[12px] text-[#555] mb-6">
              Indicator + course + community
            </p>

            <div className="mb-8">
              <span className="font-display text-4xl font-bold text-[#f5f5f5]">
                $99
              </span>
              <span className="font-mono text-[12px] text-[#888]">/mo</span>
            </div>

            <ul className="space-y-4 mb-10">
              {[
                "Everything in The Indicator",
                "Key Level Breakout System Course (PDF)",
                "Paid Discord (trade reviews, live executions)",
                "Trade review requests anytime",
                "Full Trading Journal access",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-[#c8f54a] mt-2 flex-shrink-0" />
                  <span className="font-mono text-[12px] text-[#888]">
                    {item}
                  </span>
                </li>
              ))}
            </ul>

            <Link
              to="/purchase"
              className="block w-full text-center bg-[#c8f54a] text-[#0a0a0a] font-mono text-[11px] font-medium uppercase tracking-[0.12em] py-4 transition-opacity hover:opacity-90"
            >
              JOIN EDGE →
            </Link>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="font-mono text-[10px] text-[#555] mt-8 text-center">
          Simulated results. Past performance ≠ future results. Not financial
          advice.
        </p>
      </div>
    </section>
  );
}
