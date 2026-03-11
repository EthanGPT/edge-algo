#!/usr/bin/env python3
"""
Deep analysis for ML model improvements.
Critically examining each feature and finding new opportunities.
"""

import pandas as pd
import numpy as np
from pathlib import Path

# Reuse indicator functions
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
    tr = pd.concat([high - low, abs(high - close.shift()), abs(low - close.shift())], axis=1).max(axis=1)
    atr = tr.rolling(window=period).mean()
    plus_di = 100 * (plus_dm.rolling(window=period).mean() / (atr + 1e-10))
    minus_di = 100 * (minus_dm.rolling(window=period).mean() / (atr + 1e-10))
    dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di + 1e-10)
    return dx.rolling(window=period).mean().fillna(25), plus_di.fillna(25), minus_di.fillna(25)

def calculate_atr(high, low, close, period=14):
    tr = pd.concat([high - low, abs(high - close.shift()), abs(low - close.shift())], axis=1).max(axis=1)
    return tr.rolling(window=period).mean().bfill()

# Load data
print("Loading data...")
data_dir = Path(__file__).parent / "data"
ohlc = {}
for inst in ["MES", "MNQ", "MGC"]:
    filepath = data_dir / f"{inst}_15m.csv"
    if filepath.exists():
        df = pd.read_csv(filepath, parse_dates=["ts_event"])
        df = df.set_index("ts_event").sort_index()
        df["rsi"] = calculate_rsi(df["close"])
        df["macd"], df["macd_signal"] = calculate_macd(df["close"])
        df["macd_hist"] = df["macd"] - df["macd_signal"]
        df["adx"], df["plus_di"], df["minus_di"] = calculate_adx(df["high"], df["low"], df["close"])
        atr = calculate_atr(df["high"], df["low"], df["close"])
        df["atr_pct"] = (atr / df["close"]) * 100
        ohlc[inst] = df

# Load trades
trades_list = []
for inst in ["MES", "MNQ", "MGC"]:
    filepath = Path(__file__).parent / "outputs" / f"klbs_{inst}_trades.csv"
    if filepath.exists():
        df = pd.read_csv(filepath, parse_dates=["date"])
        df["instrument"] = inst
        trades_list.append(df)

trades = pd.concat(trades_list, ignore_index=True)

# Join indicators
def get_indicators(row):
    inst = row["instrument"]
    if inst not in ohlc:
        return pd.Series({"rsi": 50, "macd": 0, "macd_hist": 0, "adx": 25, "plus_di": 25, "minus_di": 25, "atr_pct": 0.5})
    df = ohlc[inst]
    signal_time = pd.Timestamp(row["date"])
    if signal_time.tzinfo is not None:
        signal_time = signal_time.tz_convert("UTC")
    if df.index.tzinfo is None:
        df.index = df.index.tz_localize("UTC")
    mask = df.index <= signal_time
    if mask.sum() == 0:
        return pd.Series({"rsi": 50, "macd": 0, "macd_hist": 0, "adx": 25, "plus_di": 25, "minus_di": 25, "atr_pct": 0.5})
    bar = df[mask].iloc[-1]
    return pd.Series({
        "rsi": bar["rsi"] if not pd.isna(bar["rsi"]) else 50,
        "macd": bar["macd"] if not pd.isna(bar["macd"]) else 0,
        "macd_hist": bar["macd_hist"] if not pd.isna(bar["macd_hist"]) else 0,
        "adx": bar["adx"] if not pd.isna(bar["adx"]) else 25,
        "plus_di": bar["plus_di"] if not pd.isna(bar["plus_di"]) else 25,
        "minus_di": bar["minus_di"] if not pd.isna(bar["minus_di"]) else 25,
        "atr_pct": bar["atr_pct"] if not pd.isna(bar["atr_pct"]) else 0.5,
    })

print("Joining indicators...")
indicators = trades.apply(get_indicators, axis=1)
for col in indicators.columns:
    trades[col] = indicators[col]

trades = trades.dropna(subset=["rsi", "atr_pct"])
trades["win"] = trades["outcome"] == "WIN"
# Parse dates properly
trades["date"] = pd.to_datetime(trades["date"], utc=True)
trades["hour"] = trades["date"].dt.hour

print(f"Total trades: {len(trades):,}")
print(f"Baseline WR: {trades['win'].mean():.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("1. ATR% ANALYSIS - Currently 46.7% of model weight")
print("="*80)

print("\nATR% buckets:")
for atr_low in [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0]:
    atr_high = atr_low + 0.1 if atr_low < 0.5 else (atr_low + 0.2 if atr_low < 1.0 else 2.0)
    mask = (trades["atr_pct"] >= atr_low) & (trades["atr_pct"] < atr_high)
    subset = trades[mask]
    if len(subset) > 50:
        wr = subset["win"].mean()
        print(f"  ATR% {atr_low:.1f}-{atr_high:.1f}: n={len(subset):5,} | WR={wr:.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("2. HOUR ANALYSIS - Currently #2 importance")
print("="*80)

print("\nWin rate by hour (ET):")
for hour in range(3, 17):  # Trading hours
    mask = trades["hour"] == hour
    subset = trades[mask]
    if len(subset) > 50:
        wr = subset["win"].mean()
        session = "London" if hour < 9 else "NY"
        bar = "█" * int(wr * 50)
        print(f"  {hour:02d}:00 ({session:6}): n={len(subset):4,} | WR={wr:.1%} {bar}")

# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("3. DI_ALIGN ANALYSIS - Why isn't it showing in top 10?")
print("="*80)

# Calculate DI alignment
trades["di_aligned"] = ((trades["direction"] == "LONG") & (trades["plus_di"] > trades["minus_di"])) | \
                       ((trades["direction"] == "SHORT") & (trades["minus_di"] > trades["plus_di"]))

aligned = trades[trades["di_aligned"]]
not_aligned = trades[~trades["di_aligned"]]
print(f"\nDI Aligned:     n={len(aligned):,} | WR={aligned['win'].mean():.1%}")
print(f"DI Not Aligned: n={len(not_aligned):,} | WR={not_aligned['win'].mean():.1%}")
print(f"Edge: {(aligned['win'].mean() - not_aligned['win'].mean())*100:.1f}%")

# DI alignment by direction
for direction in ["LONG", "SHORT"]:
    dir_trades = trades[trades["direction"] == direction]
    aligned = dir_trades[dir_trades["di_aligned"]]
    not_aligned = dir_trades[~dir_trades["di_aligned"]]
    edge = aligned["win"].mean() - not_aligned["win"].mean()
    print(f"\n{direction}:")
    print(f"  Aligned:     n={len(aligned):,} | WR={aligned['win'].mean():.1%}")
    print(f"  Not Aligned: n={len(not_aligned):,} | WR={not_aligned['win'].mean():.1%}")
    print(f"  Edge: {edge*100:.1f}%")

# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("4. LEVEL + SESSION INTERACTIONS")
print("="*80)

print("\nLevel performance by session:")
for session in ["London", "NY"]:
    print(f"\n{session}:")
    sess_trades = trades[trades["session"] == session]
    for level in ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]:
        subset = sess_trades[sess_trades["level"] == level]
        if len(subset) > 30:
            wr = subset["win"].mean()
            print(f"  {level}: n={len(subset):4,} | WR={wr:.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("5. DAY OF WEEK PATTERNS")
print("="*80)

trades["day"] = trades["date"].dt.day_name()
print("\nWin rate by day:")
for day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]:
    subset = trades[trades["day"] == day]
    if len(subset) > 100:
        wr = subset["win"].mean()
        print(f"  {day:10}: n={len(subset):,} | WR={wr:.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("6. COMBINED SCORE ANALYSIS - All factors aligned")
print("="*80)

# Calculate how many factors are aligned
def count_aligned_factors(row):
    count = 0
    is_long = row["direction"] == "LONG"

    # RSI in good zone
    rsi = row["rsi"]
    if is_long and 45 <= rsi <= 65:
        count += 1
    elif not is_long and 35 <= rsi <= 55:
        count += 1

    # DI aligned
    if row["di_aligned"]:
        count += 1

    # MACD aligned
    if (is_long and row["macd"] > 0) or (not is_long and row["macd"] <= 0):
        count += 1

    # MACD histogram momentum
    if (is_long and row["macd_hist"] > 0) or (not is_long and row["macd_hist"] <= 0):
        count += 1

    # Good ATR (not too high, not too low)
    if 0.15 <= row["atr_pct"] <= 0.6:
        count += 1

    return count

trades["aligned_count"] = trades.apply(count_aligned_factors, axis=1)

print("\nWin rate by number of aligned factors:")
for count in range(6):
    subset = trades[trades["aligned_count"] == count]
    if len(subset) > 30:
        wr = subset["win"].mean()
        pct = len(subset) / len(trades) * 100
        print(f"  {count} factors: n={len(subset):5,} ({pct:4.1f}%) | WR={wr:.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("7. STREAK ANALYSIS - Does recent performance matter?")
print("="*80)

# Sort by date and calculate rolling win rate
trades_sorted = trades.sort_values("date").reset_index(drop=True)
trades_sorted["prev_5_wr"] = trades_sorted["win"].rolling(5, min_periods=5).mean().shift(1)

# Bucket by previous 5 trade win rate
print("\nWin rate based on previous 5 trades:")
for wr_low in [0, 0.2, 0.4, 0.6, 0.8]:
    wr_high = wr_low + 0.2
    mask = (trades_sorted["prev_5_wr"] >= wr_low) & (trades_sorted["prev_5_wr"] < wr_high)
    subset = trades_sorted[mask]
    if len(subset) > 100:
        wr = subset["win"].mean()
        print(f"  Prev 5 WR {wr_low:.0%}-{wr_high:.0%}: n={len(subset):,} | WR={wr:.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("8. ATR% + DIRECTION INTERACTION")
print("="*80)

print("\nATR% zones by direction:")
for direction in ["LONG", "SHORT"]:
    print(f"\n{direction}:")
    dir_trades = trades[trades["direction"] == direction]
    for atr_zone, atr_range in [("Low (0-0.25)", (0, 0.25)), ("Med (0.25-0.5)", (0.25, 0.5)), ("High (0.5+)", (0.5, 10))]:
        mask = (dir_trades["atr_pct"] >= atr_range[0]) & (dir_trades["atr_pct"] < atr_range[1])
        subset = dir_trades[mask]
        if len(subset) > 50:
            wr = subset["win"].mean()
            print(f"  {atr_zone:15}: n={len(subset):,} | WR={wr:.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("9. BEST SETUPS - What has highest win rate?")
print("="*80)

# Find best combinations
results = []
for level in ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]:
    for session in ["London", "NY"]:
        for direction in ["LONG", "SHORT"]:
            mask = (trades["level"] == level) & (trades["session"] == session) & (trades["direction"] == direction)
            subset = trades[mask]
            if len(subset) >= 50:
                wr = subset["win"].mean()
                results.append({
                    "setup": f"{level} {direction} {session}",
                    "n": len(subset),
                    "wr": wr
                })

results_df = pd.DataFrame(results).sort_values("wr", ascending=False)
print("\nTop 10 setups:")
for i, row in results_df.head(10).iterrows():
    print(f"  {row['setup']:20} | n={row['n']:4,} | WR={row['wr']:.1%}")

print("\nBottom 5 setups (avoid these):")
for i, row in results_df.tail(5).iterrows():
    print(f"  {row['setup']:20} | n={row['n']:4,} | WR={row['wr']:.1%}")

# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("10. MFE/MAE ANALYSIS - Trade quality")
print("="*80)

if "max_favorable_excursion" in trades.columns and "max_adverse_excursion" in trades.columns:
    # MFE/MAE ratio
    trades["mfe_mae_ratio"] = trades["max_favorable_excursion"] / (trades["max_adverse_excursion"] + 0.01)

    print("\nWin rate by MFE/MAE ratio at exit:")
    for ratio_low in [0, 0.5, 1, 2, 3, 5]:
        ratio_high = ratio_low + 1 if ratio_low < 3 else (ratio_low + 2 if ratio_low < 5 else 100)
        mask = (trades["mfe_mae_ratio"] >= ratio_low) & (trades["mfe_mae_ratio"] < ratio_high)
        # This is post-hoc, but interesting for understanding trade quality

# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("SUMMARY: IMPROVEMENT OPPORTUNITIES")
print("="*80)
print("""
Based on the analysis above, here are potential improvements:

1. ATR% ZONES: Instead of normalized, use direction-aware zones
   - Research shows certain ATR% ranges work better for LONG vs SHORT

2. HOUR SCORE: Create time-of-day score based on actual WR by hour
   - Some hours have much higher WR than others

3. LEVEL+SESSION INTERACTION: Create combined features
   - PML in London might be different from PML in NY

4. DAY OF WEEK SCORE: Weight certain days higher
   - If Wednesday shows different patterns

5. ALIGNED FACTOR COUNT: Simple count of how many indicators agree
   - More aligned factors = higher confidence

6. BEST SETUP FLAGS: Flag the top-performing level/direction/session combos
   - Avoid the worst-performing setups

7. VOLATILITY REGIME: High vol vs low vol periods
   - Use longer-term ATR% average to identify regime
""")
