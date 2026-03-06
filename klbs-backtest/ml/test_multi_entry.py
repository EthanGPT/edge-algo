#!/usr/bin/env python3
"""
Test Multi-Entry vs Locked Levels

Compares:
1. Current: One trade per level per day (locked after firing)
2. New: Multiple trades per level (re-arm after cooldown)

Uses existing optimized trade data to simulate both scenarios.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
import warnings
warnings.filterwarnings('ignore')

OUTPUT_DIR = Path(__file__).parent.parent / "outputs"

def load_all_signals():
    """Load signals for MNQ, MES, MGC."""
    all_signals = []
    for inst in ["MNQ", "MES", "MGC"]:
        filepath = OUTPUT_DIR / f"klbs_{inst}_trades_optimized.csv"
        if filepath.exists():
            df = pd.read_csv(filepath)
            df["datetime"] = pd.to_datetime(df["date"], utc=True)
            df["instrument"] = inst
            all_signals.append(df)
    return pd.concat(all_signals, ignore_index=True).sort_values("datetime")

def add_features(df):
    """Add ML features."""
    for lvl in ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]:
        df[f"is_{lvl}"] = (df["level"] == lvl).astype(float)
    df["is_long"] = (df["direction"] == "LONG").astype(float)
    df["is_short"] = (df["direction"] == "SHORT").astype(float)
    df["dow"] = df["datetime"].dt.dayofweek
    for i, day in enumerate(["Mon", "Tue", "Wed", "Thu", "Fri"]):
        df[f"is_{day}"] = (df["dow"] == i).astype(float)
    df["hour_norm"] = df["hour"] / 24.0
    for inst in ["MNQ", "MES", "MGC"]:
        df[f"is_{inst}"] = (df["instrument"] == inst).astype(float)
    df["win"] = (df["outcome"] == "WIN").astype(int)
    return df

def simulate_locked_strategy(df, threshold=0.60):
    """
    Current strategy: One trade per level per day.
    The existing data already has this baked in.
    """
    feature_cols = [c for c in df.columns if c.startswith("is_") or c == "hour_norm"]

    results = []
    min_date = df["datetime"].min()
    max_date = df["datetime"].max()

    current_start = min_date

    while True:
        train_end = current_start + pd.DateOffset(months=18)
        test_end = train_end + pd.DateOffset(months=3)

        if test_end > max_date:
            break

        train_df = df[(df["datetime"] >= current_start) & (df["datetime"] < train_end)]
        test_df = df[(df["datetime"] >= train_end) & (df["datetime"] < test_end)]

        if len(train_df) < 100 or len(test_df) < 20:
            current_start += pd.DateOffset(months=3)
            continue

        model = RandomForestClassifier(n_estimators=100, max_depth=6, min_samples_leaf=50, random_state=42, n_jobs=-1)
        model.fit(train_df[feature_cols].values, train_df["win"].values)

        probs = model.predict_proba(test_df[feature_cols].values)[:, 1]

        for i, (idx, row) in enumerate(test_df.iterrows()):
            if probs[i] >= threshold:
                results.append({
                    "datetime": row["datetime"],
                    "outcome": row["outcome"],
                    "pnl_usd": row["pnl_usd"],
                    "level": row["level"],
                    "confidence": probs[i],
                })

        current_start += pd.DateOffset(months=3)

    return pd.DataFrame(results)

def simulate_multi_entry_strategy(df, threshold=0.60, cooldown_bars=4):
    """
    Multi-entry: Allow re-entry after cooldown_bars (4 bars = 1 hour on 15m).

    Since we don't have the actual OHLC data here, we'll simulate by:
    1. Looking for signals at the same level on the same day
    2. Only taking them if they're > cooldown_bars apart

    The existing data has duplicates filtered out, so we need to estimate
    what additional signals we might have gotten.
    """
    feature_cols = [c for c in df.columns if c.startswith("is_") or c == "hour_norm"]

    results = []
    min_date = df["datetime"].min()
    max_date = df["datetime"].max()

    current_start = min_date

    while True:
        train_end = current_start + pd.DateOffset(months=18)
        test_end = train_end + pd.DateOffset(months=3)

        if test_end > max_date:
            break

        train_df = df[(df["datetime"] >= current_start) & (df["datetime"] < train_end)]
        test_df = df[(df["datetime"] >= train_end) & (df["datetime"] < test_end)].copy()

        if len(train_df) < 100 or len(test_df) < 20:
            current_start += pd.DateOffset(months=3)
            continue

        model = RandomForestClassifier(n_estimators=100, max_depth=6, min_samples_leaf=50, random_state=42, n_jobs=-1)
        model.fit(train_df[feature_cols].values, train_df["win"].values)

        probs = model.predict_proba(test_df[feature_cols].values)[:, 1]
        test_df["prob"] = probs

        # Take trades above threshold
        for idx, row in test_df.iterrows():
            if row["prob"] >= threshold:
                results.append({
                    "datetime": row["datetime"],
                    "outcome": row["outcome"],
                    "pnl_usd": row["pnl_usd"],
                    "level": row["level"],
                    "confidence": row["prob"],
                })

        # Estimate additional trades from multi-entry
        # Assume ~20% of signals could have had a second entry
        # with same win rate distribution (conservative estimate)
        high_conf = test_df[test_df["prob"] >= threshold + 0.05]  # Higher threshold for 2nd entry
        for idx, row in high_conf.iterrows():
            if np.random.random() < 0.15:  # 15% chance of valid re-entry
                # Use same win rate as the original signal
                outcome = row["outcome"]
                # Slightly lower PnL for second entries (more noise)
                pnl = row["pnl_usd"] * 0.9
                results.append({
                    "datetime": row["datetime"] + pd.Timedelta(hours=1),
                    "outcome": outcome,
                    "pnl_usd": pnl,
                    "level": row["level"],
                    "confidence": row["prob"],
                    "is_reentry": True,
                })

        current_start += pd.DateOffset(months=3)

    return pd.DataFrame(results)

def calc_stats(trades_df, label=""):
    """Calculate trading stats."""
    if len(trades_df) == 0:
        return {"label": label, "trades": 0}

    wins = (trades_df["outcome"] == "WIN").sum()
    wr = wins / len(trades_df)
    total_pnl = trades_df["pnl_usd"].sum()

    # Max drawdown calculation
    trades_df = trades_df.sort_values("datetime")
    cumsum = trades_df["pnl_usd"].cumsum()
    peak = cumsum.cummax()
    dd = peak - cumsum
    max_dd = dd.max()

    return {
        "label": label,
        "trades": len(trades_df),
        "wins": wins,
        "win_rate": f"{wr:.1%}",
        "total_pnl": f"${total_pnl:,.0f}",
        "max_dd": f"${max_dd:,.0f}",
        "pnl_per_trade": f"${total_pnl/len(trades_df):.0f}",
    }

def main():
    print("=" * 70)
    print("MULTI-ENTRY vs LOCKED LEVEL COMPARISON")
    print("=" * 70)

    df = load_all_signals()
    df = add_features(df)

    print(f"Total signals: {len(df):,}")
    print(f"Date range: {df['datetime'].min().date()} to {df['datetime'].max().date()}")
    print()

    for thresh in [0.55, 0.60, 0.65]:
        print(f"\n{'='*50}")
        print(f"THRESHOLD: {thresh:.0%}")
        print(f"{'='*50}")

        locked = simulate_locked_strategy(df, threshold=thresh)
        multi = simulate_multi_entry_strategy(df, threshold=thresh)

        locked_stats = calc_stats(locked, "LOCKED (current)")
        multi_stats = calc_stats(multi, "MULTI-ENTRY")

        print(f"\n{'Strategy':<20} {'Trades':<10} {'WR':<10} {'Total PnL':<15} {'Max DD':<12} {'$/Trade':<10}")
        print("-" * 70)
        for s in [locked_stats, multi_stats]:
            print(f"{s['label']:<20} {s['trades']:<10} {s['win_rate']:<10} {s['total_pnl']:<15} {s['max_dd']:<12} {s['pnl_per_trade']:<10}")

        if len(multi) > 0 and len(locked) > 0:
            extra_trades = len(multi) - len(locked)
            extra_pnl = multi["pnl_usd"].sum() - locked["pnl_usd"].sum()
            print(f"\nMulti-entry adds: {extra_trades} trades (+{extra_trades/len(locked)*100:.0f}%), ${extra_pnl:,.0f} extra PnL")

    print("\n" + "=" * 70)
    print("NOTE: Multi-entry estimates are based on signal distribution.")
    print("For accurate results, need to re-run backtest with unlocked levels.")
    print("=" * 70)

if __name__ == "__main__":
    main()
