#!/usr/bin/env python3
"""
KLBS Signal Filter - Simple Backtest

Run this to test the signal filter concept using only your existing data.
No external APIs needed - just your backtest signals + OHLC data.

Usage:
    cd klbs-backtest
    python -m ml.run_backtest
"""

import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, List, Tuple

# Ensure we're in the right directory
SCRIPT_DIR = Path(__file__).parent.parent
os.chdir(SCRIPT_DIR)


def load_signals(outputs_dir: str = "outputs") -> pd.DataFrame:
    """Load all historical signals from backtest outputs."""
    outputs_path = Path(outputs_dir)
    all_signals = []

    for filepath in outputs_path.glob("klbs_*_trades.csv"):
        # Skip variant files
        if "optimized" in str(filepath) or "_be" in str(filepath):
            continue

        filename = filepath.stem
        parts = filename.split("_")
        instrument = parts[1] if len(parts) >= 2 else "UNK"

        df = pd.read_csv(filepath, parse_dates=["date"])
        df["instrument"] = instrument
        all_signals.append(df)
        print(f"  Loaded {instrument}: {len(df):,} signals")

    signals = pd.concat(all_signals, ignore_index=True)
    signals = signals.sort_values("date").reset_index(drop=True)
    return signals


def extract_features(signal: pd.Series, recent_signals: pd.DataFrame = None) -> np.ndarray:
    """
    Extract features from a signal.
    Uses data available in your backtest CSVs + rolling context.
    """
    features = []

    # 1. Level type (one-hot, 6 features)
    levels = ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]
    level = signal.get("level", "PDL")
    level_vec = [1.0 if level == l else 0.0 for l in levels]
    features.extend(level_vec)

    # 2. Direction (one-hot, 2 features)
    direction = signal.get("direction", "LONG")
    features.append(1.0 if direction == "LONG" else 0.0)
    features.append(1.0 if direction == "SHORT" else 0.0)

    # 3. Session (one-hot, 2 features)
    session = signal.get("session", "NY")
    features.append(1.0 if session == "London" else 0.0)
    features.append(1.0 if session == "NY" else 0.0)

    # 4. Day of week (one-hot, 5 features)
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    day = signal.get("day_of_week", "Monday")
    day_vec = [1.0 if day == d else 0.0 for d in days]
    features.extend(day_vec)

    # 5. Hour (normalized, 1 feature)
    hour = signal.get("hour", 12)
    features.append(hour / 24.0)

    # 6. Instrument (one-hot, 8 features)
    instruments = ["MNQ", "MES", "MGC", "M2K", "ZN", "ZB", "6E", "6J"]
    inst = signal.get("instrument", "MNQ")
    inst_vec = [1.0 if inst == i else 0.0 for i in instruments]
    features.extend(inst_vec)

    # 7. Year/Month (for seasonality, 2 features)
    year = signal.get("year", 2022)
    month = signal.get("month", 6)
    features.append((year - 2019) / 5.0)
    features.append(month / 12.0)

    # 8. Rolling performance context (if available, 5 features)
    if recent_signals is not None and len(recent_signals) > 0:
        # Recent win rate (last 10 signals for this instrument)
        inst_recent = recent_signals[recent_signals["instrument"] == inst].tail(10)
        if len(inst_recent) > 0:
            recent_winrate = (inst_recent["outcome"] == "WIN").mean()
            recent_consec_loss = 0
            for outcome in inst_recent["outcome"].iloc[::-1]:
                if outcome == "LOSS":
                    recent_consec_loss += 1
                else:
                    break
        else:
            recent_winrate = 0.5
            recent_consec_loss = 0

        # Recent level performance
        level_recent = recent_signals[recent_signals["level"] == level].tail(10)
        if len(level_recent) > 0:
            level_winrate = (level_recent["outcome"] == "WIN").mean()
        else:
            level_winrate = 0.5

        # Session recent performance
        sess_recent = recent_signals[recent_signals["session"] == session].tail(10)
        if len(sess_recent) > 0:
            session_winrate = (sess_recent["outcome"] == "WIN").mean()
        else:
            session_winrate = 0.5

        # Day recent performance
        day_recent = recent_signals[recent_signals["day_of_week"] == day].tail(10)
        if len(day_recent) > 0:
            day_winrate = (day_recent["outcome"] == "WIN").mean()
        else:
            day_winrate = 0.5

        features.extend([
            recent_winrate,
            min(recent_consec_loss / 5.0, 1.0),
            level_winrate,
            session_winrate,
            day_winrate,
        ])
    else:
        features.extend([0.5, 0.0, 0.5, 0.5, 0.5])

    return np.array(features, dtype=np.float32)


def simple_model_train(
    X_train: np.ndarray,
    y_train: np.ndarray,
) -> Dict:
    """
    Train a simple logistic regression or random forest.
    No RL needed for initial validation.
    """
    try:
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.linear_model import LogisticRegression

        # Random Forest
        rf = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            min_samples_leaf=20,
            random_state=42,
            n_jobs=-1,
        )
        rf.fit(X_train, y_train)

        # Logistic Regression
        lr = LogisticRegression(max_iter=1000, random_state=42)
        lr.fit(X_train, y_train)

        return {"rf": rf, "lr": lr}

    except ImportError:
        print("sklearn not installed. Install with: pip install scikit-learn")
        return {}


def evaluate_filter(
    signals: pd.DataFrame,
    model,
    threshold: float = 0.5,
) -> Dict:
    """Evaluate filter performance on signals."""
    X = np.array([extract_features(row) for _, row in signals.iterrows()])

    # Get probabilities
    probs = model.predict_proba(X)[:, 1]  # Probability of WIN

    # Apply threshold
    take_mask = probs >= threshold

    # Results
    taken_signals = signals[take_mask]
    skipped_signals = signals[~take_mask]

    # Calculate metrics
    n_total = len(signals)
    n_taken = len(taken_signals)
    n_skipped = len(skipped_signals)

    # Original performance (take all)
    orig_wins = (signals["outcome"] == "WIN").sum()
    orig_losses = (signals["outcome"] == "LOSS").sum()
    orig_pnl = signals["pnl_usd"].sum()
    orig_winrate = orig_wins / n_total if n_total > 0 else 0

    # Filtered performance
    if n_taken > 0:
        filt_wins = (taken_signals["outcome"] == "WIN").sum()
        filt_losses = (taken_signals["outcome"] == "LOSS").sum()
        filt_pnl = taken_signals["pnl_usd"].sum()
        filt_winrate = filt_wins / n_taken
    else:
        filt_wins = filt_losses = 0
        filt_pnl = 0.0
        filt_winrate = 0.0

    # Skipped analysis
    if n_skipped > 0:
        skip_wins = (skipped_signals["outcome"] == "WIN").sum()
        skip_losses = (skipped_signals["outcome"] == "LOSS").sum()
        skip_pnl = skipped_signals["pnl_usd"].sum()
    else:
        skip_wins = skip_losses = 0
        skip_pnl = 0.0

    return {
        "total_signals": n_total,
        "signals_taken": n_taken,
        "signals_skipped": n_skipped,
        "take_rate": n_taken / n_total if n_total > 0 else 0,
        # Original
        "original_wins": orig_wins,
        "original_losses": orig_losses,
        "original_winrate": orig_winrate,
        "original_pnl": orig_pnl,
        # Filtered
        "filtered_wins": filt_wins,
        "filtered_losses": filt_losses,
        "filtered_winrate": filt_winrate,
        "filtered_pnl": filt_pnl,
        # Skipped
        "skipped_wins": skip_wins,
        "skipped_losses": skip_losses,
        "skipped_pnl": skip_pnl,
        # Improvement
        "pnl_improvement": filt_pnl - orig_pnl,
        "winrate_improvement": filt_winrate - orig_winrate,
    }


def run_backtest():
    """Main backtest runner."""
    print("=" * 60)
    print("KLBS Signal Filter - Backtest")
    print("=" * 60)

    # 1. Load data
    print("\n1. Loading signals...")
    signals = load_signals()
    print(f"\n   Total: {len(signals):,} signals")
    print(f"   Date range: {signals['date'].min()} to {signals['date'].max()}")

    # 2. Create labels (WIN = 1, LOSS/BE = 0)
    print("\n2. Preparing features...")
    signals["label"] = (signals["outcome"] == "WIN").astype(int)

    # 3. Split chronologically (70/15/15)
    n = len(signals)
    train_end = int(n * 0.70)
    val_end = int(n * 0.85)

    train = signals.iloc[:train_end]
    val = signals.iloc[train_end:val_end]
    test = signals.iloc[val_end:]

    print(f"   Train: {len(train):,} ({train['date'].min().date()} to {train['date'].max().date()})")
    print(f"   Val:   {len(val):,} ({val['date'].min().date()} to {val['date'].max().date()})")
    print(f"   Test:  {len(test):,} ({test['date'].min().date()} to {test['date'].max().date()})")

    # 4. Extract features with rolling context
    print("\n3. Extracting features (with rolling context)...")

    # Use a lookback window for efficiency
    LOOKBACK = 100

    # For training
    X_train = []
    for i, (idx, row) in enumerate(train.iterrows()):
        start = max(0, idx - LOOKBACK)
        context = signals.iloc[start:idx] if idx > 0 else None
        X_train.append(extract_features(row, context))
        if (i + 1) % 5000 == 0:
            print(f"   ... processed {i+1:,}/{len(train):,} training samples")
    X_train = np.array(X_train)
    y_train = train["label"].values

    # For val/test
    X_val = []
    for i, (idx, row) in enumerate(val.iterrows()):
        start = max(0, idx - LOOKBACK)
        context = signals.iloc[start:idx]
        X_val.append(extract_features(row, context))
    X_val = np.array(X_val)

    X_test = []
    for i, (idx, row) in enumerate(test.iterrows()):
        start = max(0, idx - LOOKBACK)
        context = signals.iloc[start:idx]
        X_test.append(extract_features(row, context))
    X_test = np.array(X_test)

    print(f"   Feature dimension: {X_train.shape[1]}")

    # 5. Train models
    print("\n4. Training models...")
    models = simple_model_train(X_train, y_train)

    if not models:
        print("   No models trained. Install sklearn and retry.")
        return

    # 6. Threshold sweep on validation set
    print("\n5. Threshold Sweep (Validation Set)")
    print("-" * 60)
    print(f"   {'Thresh':>6} | {'Take%':>6} | {'WinRate':>7} | {'PnL':>12} | {'vs Base':>10}")
    print("   " + "-" * 55)

    best_threshold = 0.5
    best_pnl = float("-inf")

    for threshold in np.arange(0.35, 0.70, 0.05):
        results = evaluate_filter(val, models["rf"], threshold)

        print(
            f"   {threshold:>6.2f} | "
            f"{results['take_rate']*100:>5.1f}% | "
            f"{results['filtered_winrate']*100:>6.1f}% | "
            f"${results['filtered_pnl']:>10,.0f} | "
            f"${results['pnl_improvement']:>+9,.0f}"
        )

        if results["filtered_pnl"] > best_pnl:
            best_pnl = results["filtered_pnl"]
            best_threshold = threshold

    print(f"\n   Best threshold: {best_threshold:.2f} (maximizes filtered PnL)")

    # 7. Evaluate on test set with sweep
    print("\n6. Test Set Threshold Sweep (RF Model)")
    print("-" * 60)
    print(f"   {'Thresh':>6} | {'Take%':>6} | {'WinRate':>7} | {'PnL':>12} | {'Losses Avoided':>14}")
    print("   " + "-" * 60)

    for threshold in np.arange(0.35, 0.70, 0.05):
        results = evaluate_filter(test, models["rf"], threshold)
        print(
            f"   {threshold:>6.2f} | "
            f"{results['take_rate']*100:>5.1f}% | "
            f"{results['filtered_winrate']*100:>6.1f}% | "
            f"${results['filtered_pnl']:>10,.0f} | "
            f"{results['skipped_losses']:>14}"
        )

    # Show detailed results for key thresholds
    print("\n   Detailed Analysis (Key Thresholds)")
    print("-" * 60)

    for threshold in [0.50, 0.55, 0.60]:
        results = evaluate_filter(test, models["rf"], threshold)

        print(f"\n   Threshold: {threshold:.2f}")
        print(f"   Signals: {results['signals_taken']}/{results['total_signals']} taken ({results['take_rate']:.1%})")
        print(f"   Win Rate: {results['original_winrate']:.1%} -> {results['filtered_winrate']:.1%} ({results['winrate_improvement']:+.1%})")
        print(f"   PnL: ${results['original_pnl']:,.0f} -> ${results['filtered_pnl']:,.0f} ({results['pnl_improvement']:+,.0f})")
        print(f"   Skipped: {results['skipped_wins']} wins + {results['skipped_losses']} losses = ${results['skipped_pnl']:,.0f}")

    # 8. Feature importance
    print("\n7. Feature Importance (Random Forest)")
    print("-" * 60)

    feature_names = (
        ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"] +
        ["LONG", "SHORT"] +
        ["London", "NY"] +
        ["Mon", "Tue", "Wed", "Thu", "Fri"] +
        ["Hour"] +
        ["MNQ", "MES", "MGC", "M2K", "ZN", "ZB", "6E", "6J"] +
        ["Year", "Month"] +
        ["RecentWR", "ConsecLoss", "LevelWR", "SessionWR", "DayWR"]
    )

    importances = models["rf"].feature_importances_
    sorted_idx = np.argsort(importances)[::-1][:10]

    for idx in sorted_idx:
        print(f"   {feature_names[idx]:12s}: {importances[idx]:.4f}")

    print("\n" + "=" * 60)
    print("Backtest complete!")
    print("=" * 60)


if __name__ == "__main__":
    run_backtest()
