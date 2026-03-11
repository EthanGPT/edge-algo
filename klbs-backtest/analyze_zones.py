#!/usr/bin/env python3
"""Analyze RSI and ADX zones for KLBS signals."""

import pandas as pd
import numpy as np
from pathlib import Path

def calculate_rsi(prices, period=14):
    delta = prices.diff()
    gain = delta.where(delta > 0, 0).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / (loss + 1e-10)
    return 100 - (100 / (1 + rs))

def calculate_adx(high, low, close, period=14):
    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)

    tr1 = high - low
    tr2 = abs(high - close.shift())
    tr3 = abs(low - close.shift())
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr = tr.rolling(window=period).mean()
    plus_di = 100 * (plus_dm.rolling(window=period).mean() / (atr + 1e-10))
    minus_di = 100 * (minus_dm.rolling(window=period).mean() / (atr + 1e-10))

    dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di + 1e-10)
    return dx.rolling(window=period).mean().fillna(25)

# Load OHLC and add indicators
data_dir = Path(__file__).parent / "data"
ohlc = {}

for inst in ["MES", "MNQ", "MGC"]:
    filepath = data_dir / f"{inst}_15m.csv"
    if filepath.exists():
        df = pd.read_csv(filepath, parse_dates=["ts_event"])
        df = df.set_index("ts_event").sort_index()
        df["rsi"] = calculate_rsi(df["close"])
        df["adx"] = calculate_adx(df["high"], df["low"], df["close"])
        ohlc[inst] = df
        print(f"Loaded {inst}: {len(df):,} bars")

# Load trades
trades_list = []
outputs_dir = Path(__file__).parent / "outputs"

for inst in ["MES", "MNQ", "MGC"]:
    filepath = outputs_dir / f"klbs_{inst}_trades.csv"
    if filepath.exists():
        df = pd.read_csv(filepath, parse_dates=["date"])
        df["instrument"] = inst
        trades_list.append(df)
        print(f"Loaded {inst}: {len(df):,} trades")

trades = pd.concat(trades_list, ignore_index=True)
print(f"\nTotal trades: {len(trades):,}")

# Join RSI/ADX to trades
def get_indicators(row):
    inst = row["instrument"]
    if inst not in ohlc:
        return pd.Series({"rsi": 50, "adx": 25})

    df = ohlc[inst]
    signal_time = pd.Timestamp(row["date"])

    # Handle timezone
    if signal_time.tzinfo is not None:
        signal_time = signal_time.tz_convert("UTC")
    if df.index.tzinfo is None:
        df.index = df.index.tz_localize("UTC")

    mask = df.index <= signal_time
    if mask.sum() == 0:
        return pd.Series({"rsi": 50, "adx": 25})

    bar = df[mask].iloc[-1]
    return pd.Series({
        "rsi": bar["rsi"] if not pd.isna(bar["rsi"]) else 50,
        "adx": bar["adx"] if not pd.isna(bar["adx"]) else 25
    })

print("\nJoining indicators to trades...")
indicators = trades.apply(get_indicators, axis=1)
trades["rsi"] = indicators["rsi"]
trades["adx"] = indicators["adx"]

# Filter to valid data
trades = trades.dropna(subset=["rsi", "adx"])
trades["win"] = trades["outcome"] == "WIN"

print(f"Trades with indicators: {len(trades):,}")
print(f"Overall win rate: {trades['win'].mean():.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
# RSI ZONE ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("RSI ZONE ANALYSIS")
print("="*70)

# By direction
for direction in ["LONG", "SHORT"]:
    dir_trades = trades[trades["direction"] == direction]
    print(f"\n{direction} SIGNALS ({len(dir_trades):,} total)")
    print("-"*60)

    # Define zones based on user's table
    if direction == "LONG":
        zones = [
            ("Strong (RSI < 35)", dir_trades["rsi"] < 35),
            ("Moderate (35-45)", (dir_trades["rsi"] >= 35) & (dir_trades["rsi"] < 45)),
            ("Weak (45-50)", (dir_trades["rsi"] >= 45) & (dir_trades["rsi"] < 50)),
            ("Skip (> 50)", dir_trades["rsi"] >= 50),
        ]
    else:  # SHORT
        zones = [
            ("Strong (RSI > 65)", dir_trades["rsi"] > 65),
            ("Moderate (55-65)", (dir_trades["rsi"] >= 55) & (dir_trades["rsi"] <= 65)),
            ("Weak (50-55)", (dir_trades["rsi"] >= 50) & (dir_trades["rsi"] < 55)),
            ("Skip (< 50)", dir_trades["rsi"] < 50),
        ]

    for name, mask in zones:
        subset = dir_trades[mask]
        if len(subset) > 10:
            wr = subset["win"].mean()
            avg_rsi = subset["rsi"].mean()
            print(f"  {name:25} | n={len(subset):5,} | WR={wr:5.1%} | avg_rsi={avg_rsi:.1f}")

# Continuous RSI buckets
print("\n\nRSI BUCKETS (5-point intervals) - ALL DIRECTIONS")
print("-"*60)
for rsi_low in range(20, 85, 5):
    rsi_high = rsi_low + 5
    mask = (trades["rsi"] >= rsi_low) & (trades["rsi"] < rsi_high)
    subset = trades[mask]
    if len(subset) > 20:
        wr = subset["win"].mean()
        long_wr = subset[subset["direction"] == "LONG"]["win"].mean() if len(subset[subset["direction"] == "LONG"]) > 5 else 0
        short_wr = subset[subset["direction"] == "SHORT"]["win"].mean() if len(subset[subset["direction"] == "SHORT"]) > 5 else 0
        print(f"  RSI {rsi_low:2}-{rsi_high:2} | n={len(subset):5,} | WR={wr:5.1%} | LONG={long_wr:5.1%} | SHORT={short_wr:5.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
# ADX ZONE ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("ADX ZONE ANALYSIS")
print("="*70)

adx_zones = [
    ("Best (10-20)", (trades["adx"] >= 10) & (trades["adx"] < 20)),
    ("Good (20-28)", (trades["adx"] >= 20) & (trades["adx"] < 28)),
    ("Marginal (28-35)", (trades["adx"] >= 28) & (trades["adx"] < 35)),
    ("Skip (> 35)", trades["adx"] >= 35),
    ("Very Low (< 10)", trades["adx"] < 10),
]

print("\nADX ZONES (User's Table)")
print("-"*60)
for name, mask in adx_zones:
    subset = trades[mask]
    if len(subset) > 10:
        wr = subset["win"].mean()
        avg_adx = subset["adx"].mean()
        print(f"  {name:20} | n={len(subset):5,} | WR={wr:5.1%} | avg_adx={avg_adx:.1f}")

# Continuous ADX buckets
print("\n\nADX BUCKETS (5-point intervals)")
print("-"*60)
for adx_low in range(5, 55, 5):
    adx_high = adx_low + 5
    mask = (trades["adx"] >= adx_low) & (trades["adx"] < adx_high)
    subset = trades[mask]
    if len(subset) > 20:
        wr = subset["win"].mean()
        print(f"  ADX {adx_low:2}-{adx_high:2} | n={len(subset):5,} | WR={wr:5.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
# COMBINED ANALYSIS - Best zones
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("COMBINED RSI + ADX ANALYSIS")
print("="*70)

print("\nLONG signals: RSI zone vs ADX zone")
print("-"*70)
long_trades = trades[trades["direction"] == "LONG"]

rsi_zones_long = [
    ("RSI<35", long_trades["rsi"] < 35),
    ("RSI 35-50", (long_trades["rsi"] >= 35) & (long_trades["rsi"] < 50)),
    ("RSI 50-65", (long_trades["rsi"] >= 50) & (long_trades["rsi"] < 65)),
    ("RSI>65", long_trades["rsi"] >= 65),
]

for rsi_name, rsi_mask in rsi_zones_long:
    for adx_name, adx_range in [("ADX 10-28", (10, 28)), ("ADX 28-35", (28, 35)), ("ADX>35", (35, 100))]:
        adx_mask = (long_trades["adx"] >= adx_range[0]) & (long_trades["adx"] < adx_range[1])
        combined = rsi_mask & adx_mask
        subset = long_trades[combined]
        if len(subset) > 20:
            wr = subset["win"].mean()
            print(f"  {rsi_name:12} + {adx_name:12} | n={len(subset):4,} | WR={wr:5.1%}")

print("\nSHORT signals: RSI zone vs ADX zone")
print("-"*70)
short_trades = trades[trades["direction"] == "SHORT"]

rsi_zones_short = [
    ("RSI>65", short_trades["rsi"] > 65),
    ("RSI 50-65", (short_trades["rsi"] >= 50) & (short_trades["rsi"] <= 65)),
    ("RSI 35-50", (short_trades["rsi"] >= 35) & (short_trades["rsi"] < 50)),
    ("RSI<35", short_trades["rsi"] < 35),
]

for rsi_name, rsi_mask in rsi_zones_short:
    for adx_name, adx_range in [("ADX 10-28", (10, 28)), ("ADX 28-35", (28, 35)), ("ADX>35", (35, 100))]:
        adx_mask = (short_trades["adx"] >= adx_range[0]) & (short_trades["adx"] < adx_range[1])
        combined = rsi_mask & adx_mask
        subset = short_trades[combined]
        if len(subset) > 20:
            wr = subset["win"].mean()
            print(f"  {rsi_name:12} + {adx_name:12} | n={len(subset):4,} | WR={wr:5.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
# SCORE FORMULA SUGGESTIONS
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("CONTINUOUS WEIGHT SUGGESTIONS")
print("="*70)

print("""
Based on the data above, here are continuous weight formulas:

RSI SCORE (for LONG):
  - rsi_score = 1.0 - (rsi / 100)  # Lower RSI = higher score
  - Or piecewise: 1.0 if rsi < 35, linear decay 35-65, 0.0 if > 65

RSI SCORE (for SHORT):
  - rsi_score = rsi / 100  # Higher RSI = higher score
  - Or piecewise: 1.0 if rsi > 65, linear decay 35-65, 0.0 if < 35

ADX SCORE (direction-agnostic):
  - If ADX 10-20: score = 1.0 (best for mean reversion)
  - If ADX 20-28: score = 0.8
  - If ADX 28-35: score = 0.5
  - If ADX > 35: score = 0.0 (trending too hard)
  - If ADX < 10: score = 0.3 (too choppy)
""")
