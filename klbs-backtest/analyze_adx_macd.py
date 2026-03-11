#!/usr/bin/env python3
"""Deep analysis on ADX and MACD for KLBS signals."""

import pandas as pd
import numpy as np
from pathlib import Path

def calculate_rsi(prices, period=14):
    delta = prices.diff()
    gain = delta.where(delta > 0, 0).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / (loss + 1e-10)
    return 100 - (100 / (1 + rs))

def calculate_macd(prices, fast=12, slow=26, signal=9):
    ema_fast = prices.ewm(span=fast, adjust=False).mean()
    ema_slow = prices.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return macd_line, signal_line

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
    adx = dx.rolling(window=period).mean().fillna(25)
    return adx, plus_di, minus_di

# Load OHLC and add indicators
data_dir = Path(__file__).parent / "data"
ohlc = {}

for inst in ["MES", "MNQ", "MGC"]:
    filepath = data_dir / f"{inst}_15m.csv"
    if filepath.exists():
        df = pd.read_csv(filepath, parse_dates=["ts_event"])
        df = df.set_index("ts_event").sort_index()
        df["rsi"] = calculate_rsi(df["close"])
        df["macd"], df["macd_signal"] = calculate_macd(df["close"])
        df["macd_hist"] = df["macd"] - df["macd_signal"]  # Histogram
        df["adx"], df["plus_di"], df["minus_di"] = calculate_adx(df["high"], df["low"], df["close"])
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

trades = pd.concat(trades_list, ignore_index=True)
print(f"\nTotal trades: {len(trades):,}")

# Join indicators to trades
def get_indicators(row):
    inst = row["instrument"]
    if inst not in ohlc:
        return pd.Series({"rsi": 50, "macd": 0, "macd_hist": 0, "adx": 25, "plus_di": 25, "minus_di": 25})

    df = ohlc[inst]
    signal_time = pd.Timestamp(row["date"])

    if signal_time.tzinfo is not None:
        signal_time = signal_time.tz_convert("UTC")
    if df.index.tzinfo is None:
        df.index = df.index.tz_localize("UTC")

    mask = df.index <= signal_time
    if mask.sum() == 0:
        return pd.Series({"rsi": 50, "macd": 0, "macd_hist": 0, "adx": 25, "plus_di": 25, "minus_di": 25})

    bar = df[mask].iloc[-1]
    return pd.Series({
        "rsi": bar["rsi"] if not pd.isna(bar["rsi"]) else 50,
        "macd": bar["macd"] if not pd.isna(bar["macd"]) else 0,
        "macd_hist": bar["macd_hist"] if not pd.isna(bar["macd_hist"]) else 0,
        "adx": bar["adx"] if not pd.isna(bar["adx"]) else 25,
        "plus_di": bar["plus_di"] if not pd.isna(bar["plus_di"]) else 25,
        "minus_di": bar["minus_di"] if not pd.isna(bar["minus_di"]) else 25,
    })

print("Joining indicators to trades...")
indicators = trades.apply(get_indicators, axis=1)
trades["rsi"] = indicators["rsi"]
trades["macd"] = indicators["macd"]
trades["macd_hist"] = indicators["macd_hist"]
trades["adx"] = indicators["adx"]
trades["plus_di"] = indicators["plus_di"]
trades["minus_di"] = indicators["minus_di"]

trades = trades.dropna(subset=["macd", "adx"])
trades["win"] = trades["outcome"] == "WIN"

print(f"Trades with indicators: {len(trades):,}")
print(f"Overall win rate: {trades['win'].mean():.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
# MACD ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("MACD ANALYSIS")
print("="*70)

# Current binary approach
print("\n1. CURRENT BINARY APPROACH (MACD > 0)")
print("-"*60)
for direction in ["LONG", "SHORT"]:
    dir_trades = trades[trades["direction"] == direction]

    bullish = dir_trades[dir_trades["macd"] > 0]
    bearish = dir_trades[dir_trades["macd"] <= 0]

    bull_wr = bullish["win"].mean() if len(bullish) > 10 else 0
    bear_wr = bearish["win"].mean() if len(bearish) > 10 else 0

    print(f"\n{direction}:")
    print(f"  MACD > 0 (bullish): n={len(bullish):,} | WR={bull_wr:.1%}")
    print(f"  MACD <= 0 (bearish): n={len(bearish):,} | WR={bear_wr:.1%}")

# MACD aligned with direction
print("\n\n2. MACD ALIGNED WITH DIRECTION")
print("-"*60)
print("(LONG wants bullish MACD, SHORT wants bearish MACD)")

for direction in ["LONG", "SHORT"]:
    dir_trades = trades[trades["direction"] == direction]

    if direction == "LONG":
        aligned = dir_trades[dir_trades["macd"] > 0]
        against = dir_trades[dir_trades["macd"] <= 0]
    else:
        aligned = dir_trades[dir_trades["macd"] <= 0]
        against = dir_trades[dir_trades["macd"] > 0]

    aligned_wr = aligned["win"].mean() if len(aligned) > 10 else 0
    against_wr = against["win"].mean() if len(against) > 10 else 0

    print(f"\n{direction}:")
    print(f"  MACD aligned:  n={len(aligned):,} | WR={aligned_wr:.1%}")
    print(f"  MACD against:  n={len(against):,} | WR={against_wr:.1%}")

# MACD histogram (momentum)
print("\n\n3. MACD HISTOGRAM (Momentum Direction)")
print("-"*60)
print("(Histogram > 0 = MACD rising, < 0 = MACD falling)")

for direction in ["LONG", "SHORT"]:
    dir_trades = trades[trades["direction"] == direction]

    hist_pos = dir_trades[dir_trades["macd_hist"] > 0]  # MACD rising
    hist_neg = dir_trades[dir_trades["macd_hist"] <= 0]  # MACD falling

    pos_wr = hist_pos["win"].mean() if len(hist_pos) > 10 else 0
    neg_wr = hist_neg["win"].mean() if len(hist_neg) > 10 else 0

    print(f"\n{direction}:")
    print(f"  Histogram > 0 (rising):  n={len(hist_pos):,} | WR={pos_wr:.1%}")
    print(f"  Histogram <= 0 (falling): n={len(hist_neg):,} | WR={neg_wr:.1%}")

# Combined: MACD value + histogram direction
print("\n\n4. MACD VALUE + HISTOGRAM COMBINED")
print("-"*60)

for direction in ["LONG", "SHORT"]:
    dir_trades = trades[trades["direction"] == direction]
    print(f"\n{direction}:")

    combos = [
        ("MACD>0, Hist>0 (bull & rising)", (dir_trades["macd"] > 0) & (dir_trades["macd_hist"] > 0)),
        ("MACD>0, Hist<0 (bull & falling)", (dir_trades["macd"] > 0) & (dir_trades["macd_hist"] <= 0)),
        ("MACD<0, Hist>0 (bear & rising)", (dir_trades["macd"] <= 0) & (dir_trades["macd_hist"] > 0)),
        ("MACD<0, Hist<0 (bear & falling)", (dir_trades["macd"] <= 0) & (dir_trades["macd_hist"] <= 0)),
    ]

    for name, mask in combos:
        subset = dir_trades[mask]
        if len(subset) > 50:
            wr = subset["win"].mean()
            print(f"  {name:35} | n={len(subset):,} | WR={wr:.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
# ADX DEEP DIVE
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("ADX DEEP DIVE")
print("="*70)

# ADX by level type
print("\n1. ADX BY LEVEL TYPE")
print("-"*60)

for level in ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]:
    level_trades = trades[trades["level"] == level]
    if len(level_trades) < 100:
        continue

    print(f"\n{level}:")
    for adx_zone, adx_range in [("ADX 10-25", (10, 25)), ("ADX 25-35", (25, 35)), ("ADX 35+", (35, 100))]:
        mask = (level_trades["adx"] >= adx_range[0]) & (level_trades["adx"] < adx_range[1])
        subset = level_trades[mask]
        if len(subset) > 30:
            wr = subset["win"].mean()
            print(f"  {adx_zone:12} | n={len(subset):4,} | WR={wr:.1%}")

# +DI vs -DI (directional movement)
print("\n\n2. DIRECTIONAL MOVEMENT (+DI vs -DI)")
print("-"*60)
print("(+DI > -DI = bullish pressure, -DI > +DI = bearish pressure)")

for direction in ["LONG", "SHORT"]:
    dir_trades = trades[trades["direction"] == direction]

    plus_dom = dir_trades[dir_trades["plus_di"] > dir_trades["minus_di"]]
    minus_dom = dir_trades[dir_trades["plus_di"] <= dir_trades["minus_di"]]

    plus_wr = plus_dom["win"].mean() if len(plus_dom) > 10 else 0
    minus_wr = minus_dom["win"].mean() if len(minus_dom) > 10 else 0

    print(f"\n{direction}:")
    print(f"  +DI > -DI (bullish pressure): n={len(plus_dom):,} | WR={plus_wr:.1%}")
    print(f"  -DI > +DI (bearish pressure): n={len(minus_dom):,} | WR={minus_wr:.1%}")

# DI aligned with direction
print("\n\n3. DIRECTIONAL MOVEMENT ALIGNED WITH TRADE")
print("-"*60)
print("(LONG wants +DI dominant, SHORT wants -DI dominant)")

for direction in ["LONG", "SHORT"]:
    dir_trades = trades[trades["direction"] == direction]

    if direction == "LONG":
        aligned = dir_trades[dir_trades["plus_di"] > dir_trades["minus_di"]]
        against = dir_trades[dir_trades["plus_di"] <= dir_trades["minus_di"]]
    else:
        aligned = dir_trades[dir_trades["minus_di"] > dir_trades["plus_di"]]
        against = dir_trades[dir_trades["minus_di"] <= dir_trades["plus_di"]]

    aligned_wr = aligned["win"].mean() if len(aligned) > 10 else 0
    against_wr = against["win"].mean() if len(against) > 10 else 0

    print(f"\n{direction}:")
    print(f"  DI aligned:  n={len(aligned):,} | WR={aligned_wr:.1%}")
    print(f"  DI against:  n={len(against):,} | WR={against_wr:.1%}")

# ADX + DI combined
print("\n\n4. ADX + DI ALIGNMENT COMBINED")
print("-"*60)

for direction in ["LONG", "SHORT"]:
    dir_trades = trades[trades["direction"] == direction]
    print(f"\n{direction}:")

    if direction == "LONG":
        di_aligned = dir_trades["plus_di"] > dir_trades["minus_di"]
    else:
        di_aligned = dir_trades["minus_di"] > dir_trades["plus_di"]

    combos = [
        ("Low ADX (10-25) + DI aligned", (dir_trades["adx"] >= 10) & (dir_trades["adx"] < 25) & di_aligned),
        ("Low ADX (10-25) + DI against", (dir_trades["adx"] >= 10) & (dir_trades["adx"] < 25) & ~di_aligned),
        ("Med ADX (25-35) + DI aligned", (dir_trades["adx"] >= 25) & (dir_trades["adx"] < 35) & di_aligned),
        ("Med ADX (25-35) + DI against", (dir_trades["adx"] >= 25) & (dir_trades["adx"] < 35) & ~di_aligned),
        ("High ADX (35+) + DI aligned", (dir_trades["adx"] >= 35) & di_aligned),
        ("High ADX (35+) + DI against", (dir_trades["adx"] >= 35) & ~di_aligned),
    ]

    for name, mask in combos:
        subset = dir_trades[mask]
        if len(subset) > 50:
            wr = subset["win"].mean()
            print(f"  {name:35} | n={len(subset):,} | WR={wr:.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*70)
print("SUMMARY - KEY FINDINGS")
print("="*70)
