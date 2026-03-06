#!/usr/bin/env python3
"""
Per-Instrument Threshold Analysis
Walk-forward validation to find optimal thresholds per asset without overfitting.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

# Load the backtest data
OUTPUT_DIR = Path(__file__).parent.parent / "outputs"

def load_signals():
    """Load all signals for MES, MNQ, MGC."""
    all_signals = []
    for inst in ["MES", "MNQ", "MGC"]:
        filepath = OUTPUT_DIR / f"klbs_{inst}_trades_optimized.csv"
        if filepath.exists():
            df = pd.read_csv(filepath)
            df["datetime"] = pd.to_datetime(df["date"], utc=True)
            df["instrument"] = inst
            all_signals.append(df)
            print(f"Loaded {len(df)} signals for {inst}")

    return pd.concat(all_signals, ignore_index=True).sort_values("datetime")

def add_features(df):
    """Add features matching the ML model."""
    # Level type
    for lvl in ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]:
        df[f"is_{lvl}"] = (df["level"] == lvl).astype(float)

    # Direction (uppercase in data)
    df["is_long"] = (df["direction"] == "LONG").astype(float)
    df["is_short"] = (df["direction"] == "SHORT").astype(float)

    # Day of week
    df["dow"] = df["datetime"].dt.dayofweek
    for i, day in enumerate(["Mon", "Tue", "Wed", "Thu", "Fri"]):
        df[f"is_{day}"] = (df["dow"] == i).astype(float)

    # Hour
    df["hour_norm"] = df["hour"] / 24.0

    # Instrument
    for inst in ["MNQ", "MES", "MGC"]:
        df[f"is_{inst}"] = (df["instrument"] == inst).astype(float)

    # Outcome
    df["win"] = (df["outcome"] == "WIN").astype(int)

    return df

def walk_forward_analysis(df, instrument, thresholds=[0.50, 0.55, 0.60, 0.65, 0.70]):
    """
    Walk-forward validation for a single instrument.
    Train: 18 months, Test: 3 months, rolling.
    """
    from sklearn.ensemble import RandomForestClassifier

    inst_df = df[df["instrument"] == instrument].copy()
    inst_df = inst_df.sort_values("datetime").reset_index(drop=True)

    if len(inst_df) < 500:
        print(f"  {instrument}: Not enough data ({len(inst_df)} signals)")
        return None

    # Feature columns
    feature_cols = [c for c in inst_df.columns if c.startswith("is_") or c == "hour_norm"]

    # Walk-forward splits
    results = {t: {"trades": 0, "wins": 0} for t in thresholds}

    min_date = inst_df["datetime"].min()
    max_date = inst_df["datetime"].max()

    train_months = 18
    test_months = 3

    current_start = min_date
    fold = 0

    while True:
        train_end = current_start + pd.DateOffset(months=train_months)
        test_end = train_end + pd.DateOffset(months=test_months)

        if test_end > max_date:
            break

        train_df = inst_df[(inst_df["datetime"] >= current_start) & (inst_df["datetime"] < train_end)]
        test_df = inst_df[(inst_df["datetime"] >= train_end) & (inst_df["datetime"] < test_end)]

        if len(train_df) < 100 or len(test_df) < 20:
            current_start += pd.DateOffset(months=test_months)
            continue

        # Train model
        X_train = train_df[feature_cols].values
        y_train = train_df["win"].values

        model = RandomForestClassifier(
            n_estimators=100,
            max_depth=6,
            min_samples_leaf=50,
            random_state=42,
            n_jobs=-1
        )
        model.fit(X_train, y_train)

        # Predict on test
        X_test = test_df[feature_cols].values
        y_test = test_df["win"].values
        probs = model.predict_proba(X_test)[:, 1]

        # Evaluate each threshold
        for thresh in thresholds:
            mask = probs >= thresh
            if mask.sum() > 0:
                results[thresh]["trades"] += mask.sum()
                results[thresh]["wins"] += y_test[mask].sum()

        fold += 1
        current_start += pd.DateOffset(months=test_months)

    # Calculate win rates
    summary = []
    for thresh in thresholds:
        trades = results[thresh]["trades"]
        wins = results[thresh]["wins"]
        wr = wins / trades if trades > 0 else 0
        take_rate = trades / len(inst_df) * 100 / fold if fold > 0 else 0
        summary.append({
            "threshold": thresh,
            "trades": trades,
            "wins": wins,
            "win_rate": wr,
            "take_rate": take_rate
        })

    return pd.DataFrame(summary)

def main():
    print("=" * 60)
    print("PER-INSTRUMENT THRESHOLD ANALYSIS (Walk-Forward)")
    print("=" * 60)

    # Load and prepare data
    df = load_signals()
    df = add_features(df)

    print(f"\nTotal signals: {len(df)}")
    print(f"Date range: {df['datetime'].min()} to {df['datetime'].max()}")
    print()

    # Analyze each instrument
    all_results = {}

    for inst in ["MNQ", "MES", "MGC"]:
        print(f"\n{'='*40}")
        print(f"  {inst} Analysis")
        print(f"{'='*40}")

        result = walk_forward_analysis(df, inst)
        if result is not None:
            all_results[inst] = result
            print(result.to_string(index=False))

            # Find optimal
            best = result.loc[result["win_rate"].idxmax()]
            print(f"\n  → Optimal threshold: {best['threshold']:.0%} (WR: {best['win_rate']:.1%}, {best['trades']:.0f} trades)")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY - Recommended Thresholds")
    print("=" * 60)

    for inst, result in all_results.items():
        best = result.loc[result["win_rate"].idxmax()]
        print(f"  {inst}: {best['threshold']:.0%} threshold → {best['win_rate']:.1%} win rate")

    # Check if per-instrument is better than global
    print("\n" + "=" * 60)
    print("GLOBAL vs PER-INSTRUMENT")
    print("=" * 60)

    global_60 = {}
    for inst, result in all_results.items():
        row = result[result["threshold"] == 0.60].iloc[0]
        global_60[inst] = row["win_rate"]

    print(f"\nGlobal 60% threshold:")
    for inst, wr in global_60.items():
        print(f"  {inst}: {wr:.1%}")

    print(f"\nPer-instrument optimal:")
    for inst, result in all_results.items():
        best = result.loc[result["win_rate"].idxmax()]
        improvement = best["win_rate"] - global_60[inst]
        print(f"  {inst}: {best['win_rate']:.1%} ({improvement:+.1%} vs global)")

if __name__ == "__main__":
    main()
