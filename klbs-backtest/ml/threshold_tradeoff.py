#!/usr/bin/env python3
"""
Threshold Trade-off Analysis
Compare volume vs edge at different thresholds
"""

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
import warnings
warnings.filterwarnings('ignore')

OUTPUT_DIR = Path(__file__).parent.parent / "outputs"

def load_signals():
    all_signals = []
    for inst in ["MES", "MNQ", "MGC"]:
        filepath = OUTPUT_DIR / f"klbs_{inst}_trades_optimized.csv"
        if filepath.exists():
            df = pd.read_csv(filepath)
            df["datetime"] = pd.to_datetime(df["date"], utc=True)
            df["instrument"] = inst
            all_signals.append(df)
    return pd.concat(all_signals, ignore_index=True).sort_values("datetime")

def add_features(df):
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

def analyze_threshold(df, threshold):
    """Walk-forward analysis at a specific threshold."""
    feature_cols = [c for c in df.columns if c.startswith("is_") or c == "hour_norm"]

    # Walk-forward: 18 months train, 3 months test
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
                    "instrument": row["instrument"],
                    "outcome": row["outcome"],
                    "pnl_usd": row["pnl_usd"],
                    "confidence": probs[i]
                })

        current_start += pd.DateOffset(months=3)

    return pd.DataFrame(results)

def simulate_account(trades_df, starting_balance=50000, daily_loss_limit=2500):
    """Simulate account with daily loss limit (like prop firm)."""
    if len(trades_df) == 0:
        return {"max_dd": 0, "final_pnl": 0, "peak": starting_balance}

    trades_df = trades_df.sort_values("datetime").copy()
    trades_df["date"] = trades_df["datetime"].dt.date

    balance = starting_balance
    peak = starting_balance
    max_dd = 0
    daily_pnl = 0
    current_date = None
    stopped_days = 0

    results = []

    for _, trade in trades_df.iterrows():
        trade_date = trade["date"]

        # New day - reset daily pnl
        if trade_date != current_date:
            current_date = trade_date
            daily_pnl = 0

        # Check if we'd exceed daily loss limit
        if daily_pnl <= -daily_loss_limit:
            stopped_days += 1
            continue

        # Take trade
        pnl = trade["pnl_usd"]
        balance += pnl
        daily_pnl += pnl

        # Track peak and drawdown
        if balance > peak:
            peak = balance
        dd = (peak - balance) / peak * 100
        if dd > max_dd:
            max_dd = dd

        results.append({"balance": balance, "dd": dd})

    return {
        "max_dd": max_dd,
        "final_pnl": balance - starting_balance,
        "peak": peak,
        "stopped_days": stopped_days,
        "trades_taken": len(results)
    }

def main():
    print("=" * 70)
    print("THRESHOLD TRADE-OFF ANALYSIS")
    print("=" * 70)

    df = load_signals()
    df = add_features(df)

    total_days = (df["datetime"].max() - df["datetime"].min()).days
    total_weeks = total_days / 7
    total_years = total_days / 365

    print(f"Data: {len(df)} signals over {total_years:.1f} years ({total_weeks:.0f} weeks)")
    print()

    thresholds = [0.55, 0.58, 0.60, 0.62, 0.65]

    print(f"{'Thresh':<8} {'Trades':<8} {'Trades/Wk':<10} {'WR':<8} {'MaxDD':<8} {'Total PnL':<12} {'PnL/Trade':<10}")
    print("-" * 70)

    for thresh in thresholds:
        trades = analyze_threshold(df, thresh)

        if len(trades) == 0:
            print(f"{thresh:.0%}      No trades")
            continue

        # Stats
        wins = (trades["outcome"] == "WIN").sum()
        wr = wins / len(trades)
        trades_per_week = len(trades) / total_weeks
        total_pnl = trades["pnl_usd"].sum()
        pnl_per_trade = total_pnl / len(trades)

        # Simulate account
        sim = simulate_account(trades)

        print(f"{thresh:.0%}      {len(trades):<8} {trades_per_week:<10.1f} {wr:<8.1%} {sim['max_dd']:<8.1f}% ${total_pnl:<11,.0f} ${pnl_per_trade:<9.0f}")

    print()
    print("=" * 70)
    print("PER-INSTRUMENT BREAKDOWN AT 60% THRESHOLD")
    print("=" * 70)

    trades_60 = analyze_threshold(df, 0.60)

    for inst in ["MNQ", "MES", "MGC"]:
        inst_trades = trades_60[trades_60["instrument"] == inst]
        if len(inst_trades) == 0:
            continue
        wins = (inst_trades["outcome"] == "WIN").sum()
        wr = wins / len(inst_trades)
        pnl = inst_trades["pnl_usd"].sum()
        trades_per_week = len(inst_trades) / total_weeks

        print(f"{inst}: {len(inst_trades)} trades ({trades_per_week:.1f}/week), WR={wr:.1%}, PnL=${pnl:,.0f}")

    print()
    print("=" * 70)
    print("RECOMMENDATION")
    print("=" * 70)

    # Compare 55% vs 60%
    trades_55 = analyze_threshold(df, 0.55)
    trades_60 = analyze_threshold(df, 0.60)

    wr_55 = (trades_55["outcome"] == "WIN").sum() / len(trades_55) if len(trades_55) > 0 else 0
    wr_60 = (trades_60["outcome"] == "WIN").sum() / len(trades_60) if len(trades_60) > 0 else 0

    pnl_55 = trades_55["pnl_usd"].sum() if len(trades_55) > 0 else 0
    pnl_60 = trades_60["pnl_usd"].sum() if len(trades_60) > 0 else 0

    print(f"""
At 55%: {len(trades_55)} trades, {wr_55:.1%} WR, ${pnl_55:,.0f} profit
At 60%: {len(trades_60)} trades, {wr_60:.1%} WR, ${pnl_60:,.0f} profit

55% = More volume, more profit potential, but more variance
60% = Fewer trades, higher WR, better for prop firm consistency

For PROP FIRM SCALING:
- Start at 60% (safer, prove consistency)
- Once passing evals reliably, consider 55% for more volume
""")

if __name__ == "__main__":
    main()
