#!/usr/bin/env python3
"""
Funded Account Evaluation Simulator

Simulates prop firm evaluations using the ML signal filter.
Optimizes for passing evals quickly (high win rate, limited trades).

Usage:
    cd klbs-backtest
    python -m ml.funded_sim
"""

import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional
from collections import defaultdict

SCRIPT_DIR = Path(__file__).parent.parent
os.chdir(SCRIPT_DIR)

from ml.run_backtest import load_signals, extract_features, simple_model_train


@dataclass
class EvalConfig:
    """Prop firm evaluation configuration."""
    name: str
    account_size: int
    profit_target: float  # As percentage (e.g., 0.08 = 8%)
    max_daily_loss: float  # As percentage
    max_total_drawdown: float  # As percentage
    min_trading_days: int
    max_calendar_days: int


# Common prop firm eval configs
EVAL_CONFIGS = {
    "apex_50k": EvalConfig(
        name="Apex 50K",
        account_size=50_000,
        profit_target=0.06,  # $3,000
        max_daily_loss=0.026,  # $1,300
        max_total_drawdown=0.06,  # $3,000
        min_trading_days=7,
        max_calendar_days=30,
    ),
    "apex_100k": EvalConfig(
        name="Apex 100K",
        account_size=100_000,
        profit_target=0.06,  # $6,000
        max_daily_loss=0.02,  # $2,000
        max_total_drawdown=0.035,  # $3,500
        min_trading_days=7,
        max_calendar_days=30,
    ),
    "topstep_50k": EvalConfig(
        name="Topstep 50K",
        account_size=50_000,
        profit_target=0.06,  # $3,000
        max_daily_loss=0.02,  # $1,000
        max_total_drawdown=0.04,  # $2,000
        min_trading_days=5,
        max_calendar_days=60,
    ),
}


@dataclass
class EvalResult:
    """Result of a single evaluation attempt."""
    passed: bool
    days_to_complete: int
    final_pnl: float
    max_drawdown: float
    total_trades: int
    win_rate: float
    fail_reason: Optional[str] = None


def simulate_eval(
    signals: pd.DataFrame,
    model,
    config: EvalConfig,
    threshold: float = 0.55,
    max_trades_per_day: int = 2,
    instruments: List[str] = None,
    start_idx: int = 0,
) -> EvalResult:
    """
    Simulate a single evaluation attempt.

    Args:
        signals: All signals with outcomes
        model: Trained model for filtering
        config: Evaluation configuration
        threshold: Confidence threshold for taking trades
        max_trades_per_day: Maximum trades to take per day
        instruments: Which instruments to trade (None = all)
        start_idx: Starting index in signals

    Returns:
        EvalResult with pass/fail and metrics
    """
    # Filter to allowed instruments
    if instruments:
        signals = signals[signals["instrument"].isin(instruments)].reset_index(drop=True)

    if start_idx >= len(signals):
        return EvalResult(False, 0, 0, 0, 0, 0, "No signals")

    # State
    pnl = 0.0
    peak_pnl = 0.0
    max_dd = 0.0
    daily_pnl = 0.0
    current_day = None
    trades_today = 0
    total_trades = 0
    wins = 0
    trading_days = set()

    profit_target = config.account_size * config.profit_target
    max_daily_loss = config.account_size * config.max_daily_loss
    max_total_dd = config.account_size * config.max_total_drawdown

    start_date = None

    for idx in range(start_idx, len(signals)):
        signal = signals.iloc[idx]
        signal_date = pd.Timestamp(signal["date"]).date()

        # Initialize start date
        if start_date is None:
            start_date = signal_date

        # Check calendar days limit
        days_elapsed = (signal_date - start_date).days
        if days_elapsed > config.max_calendar_days:
            return EvalResult(
                passed=False,
                days_to_complete=days_elapsed,
                final_pnl=pnl,
                max_drawdown=max_dd,
                total_trades=total_trades,
                win_rate=wins / total_trades if total_trades > 0 else 0,
                fail_reason="Calendar days exceeded",
            )

        # New day - reset daily counters
        if signal_date != current_day:
            # Check previous day's loss
            if current_day is not None and daily_pnl < -max_daily_loss:
                return EvalResult(
                    passed=False,
                    days_to_complete=days_elapsed,
                    final_pnl=pnl,
                    max_drawdown=max_dd,
                    total_trades=total_trades,
                    win_rate=wins / total_trades if total_trades > 0 else 0,
                    fail_reason=f"Daily loss limit (${daily_pnl:.0f})",
                )

            current_day = signal_date
            daily_pnl = 0.0
            trades_today = 0

        # Skip if we've hit daily trade limit
        if trades_today >= max_trades_per_day:
            continue

        # Get model prediction
        context = signals.iloc[max(0, idx - 100):idx]
        features = extract_features(signal, context)
        prob = model.predict_proba(features.reshape(1, -1))[0, 1]

        # Skip low confidence signals
        if prob < threshold:
            continue

        # Take the trade
        trade_pnl = signal["pnl_usd"]
        pnl += trade_pnl
        daily_pnl += trade_pnl
        total_trades += 1
        trades_today += 1
        trading_days.add(signal_date)

        if signal["outcome"] == "WIN":
            wins += 1

        # Track drawdown
        peak_pnl = max(peak_pnl, pnl)
        current_dd = peak_pnl - pnl
        max_dd = max(max_dd, current_dd)

        # Check total drawdown
        if max_dd > max_total_dd:
            return EvalResult(
                passed=False,
                days_to_complete=days_elapsed,
                final_pnl=pnl,
                max_drawdown=max_dd,
                total_trades=total_trades,
                win_rate=wins / total_trades if total_trades > 0 else 0,
                fail_reason=f"Max drawdown exceeded (${max_dd:.0f})",
            )

        # Check if passed
        if pnl >= profit_target and len(trading_days) >= config.min_trading_days:
            return EvalResult(
                passed=True,
                days_to_complete=days_elapsed,
                final_pnl=pnl,
                max_drawdown=max_dd,
                total_trades=total_trades,
                win_rate=wins / total_trades if total_trades > 0 else 0,
            )

    # Ran out of signals
    return EvalResult(
        passed=False,
        days_to_complete=(pd.Timestamp(signals.iloc[-1]["date"]).date() - start_date).days if start_date else 0,
        final_pnl=pnl,
        max_drawdown=max_dd,
        total_trades=total_trades,
        win_rate=wins / total_trades if total_trades > 0 else 0,
        fail_reason="Ran out of signals",
    )


def monte_carlo_evals(
    signals: pd.DataFrame,
    model,
    config: EvalConfig,
    threshold: float = 0.55,
    max_trades_per_day: int = 2,
    instruments: List[str] = None,
    n_simulations: int = 100,
) -> Dict:
    """
    Run Monte Carlo simulation of evaluation attempts.

    Starts eval from random points in the signal history.
    """
    results = []
    n_signals = len(signals)

    # Sample random starting points
    np.random.seed(42)
    start_indices = np.random.randint(0, n_signals - 500, size=n_simulations)

    for i, start_idx in enumerate(start_indices):
        result = simulate_eval(
            signals=signals,
            model=model,
            config=config,
            threshold=threshold,
            max_trades_per_day=max_trades_per_day,
            instruments=instruments,
            start_idx=start_idx,
        )
        results.append(result)

        if (i + 1) % 25 == 0:
            pass_rate = sum(1 for r in results if r.passed) / len(results)
            print(f"   ... {i+1}/{n_simulations} simulations, pass rate: {pass_rate:.1%}")

    # Aggregate results
    passed = [r for r in results if r.passed]
    failed = [r for r in results if not r.passed]

    fail_reasons = defaultdict(int)
    for r in failed:
        fail_reasons[r.fail_reason] += 1

    return {
        "pass_rate": len(passed) / len(results),
        "n_passed": len(passed),
        "n_failed": len(failed),
        "avg_days_to_pass": np.mean([r.days_to_complete for r in passed]) if passed else 0,
        "avg_trades_to_pass": np.mean([r.total_trades for r in passed]) if passed else 0,
        "avg_winrate_passed": np.mean([r.win_rate for r in passed]) if passed else 0,
        "avg_max_dd_passed": np.mean([r.max_drawdown for r in passed]) if passed else 0,
        "fail_reasons": dict(fail_reasons),
    }


def run_funded_sim():
    """Main simulation runner."""
    print("=" * 70)
    print("KLBS Signal Filter - Funded Account Simulator")
    print("=" * 70)

    # Load data
    print("\n1. Loading signals...")
    signals = load_signals()

    # Split for training
    n = len(signals)
    train_end = int(n * 0.70)
    train = signals.iloc[:train_end]
    test = signals.iloc[train_end:]

    print(f"   Train: {len(train):,} signals")
    print(f"   Test:  {len(test):,} signals (used for simulations)")

    # Train model
    print("\n2. Training model...")
    signals["label"] = (signals["outcome"] == "WIN").astype(int)
    train["label"] = (train["outcome"] == "WIN").astype(int)

    X_train = []
    for i, (idx, row) in enumerate(train.iterrows()):
        start = max(0, idx - 100)
        context = signals.iloc[start:idx] if idx > 0 else None
        X_train.append(extract_features(row, context))
    X_train = np.array(X_train)
    y_train = train["label"].values

    models = simple_model_train(X_train, y_train)
    model = models["rf"]
    print("   Model trained!")

    # Test different configurations
    print("\n3. Finding Optimal Settings")
    print("-" * 70)

    best_config = None
    best_pass_rate = 0

    for threshold in [0.50, 0.55, 0.60, 0.65]:
        for max_trades in [2, 3, 4]:
            # Quick test with fewer simulations
            result = monte_carlo_evals(
                signals=test,
                model=model,
                config=EVAL_CONFIGS["apex_50k"],
                threshold=threshold,
                max_trades_per_day=max_trades,
                instruments=["MNQ", "MES"],  # Focus on liquid micros
                n_simulations=50,
            )

            print(
                f"   Thresh={threshold:.2f}, MaxTrades={max_trades}: "
                f"Pass Rate={result['pass_rate']:.1%}, "
                f"Avg Days={result['avg_days_to_pass']:.1f}"
            )

            if result["pass_rate"] > best_pass_rate:
                best_pass_rate = result["pass_rate"]
                best_config = (threshold, max_trades)

    print(f"\n   Best: threshold={best_config[0]}, max_trades={best_config[1]}")

    # Full simulation with best config
    print("\n4. Full Simulation (Best Config)")
    print("-" * 70)

    for eval_name, eval_config in EVAL_CONFIGS.items():
        print(f"\n   {eval_config.name}")
        print(f"   Target: ${eval_config.account_size * eval_config.profit_target:,.0f} | "
              f"Max DD: ${eval_config.account_size * eval_config.max_total_drawdown:,.0f} | "
              f"Daily Loss: ${eval_config.account_size * eval_config.max_daily_loss:,.0f}")

        result = monte_carlo_evals(
            signals=test,
            model=model,
            config=eval_config,
            threshold=best_config[0],
            max_trades_per_day=best_config[1],
            instruments=["MNQ", "MES"],
            n_simulations=100,
        )

        print(f"   Pass Rate:        {result['pass_rate']:.1%}")
        print(f"   Avg Days to Pass: {result['avg_days_to_pass']:.1f}")
        print(f"   Avg Trades:       {result['avg_trades_to_pass']:.0f}")
        print(f"   Avg Win Rate:     {result['avg_winrate_passed']:.1%}")
        print(f"   Avg Max DD:       ${result['avg_max_dd_passed']:,.0f}")

        if result["fail_reasons"]:
            print("   Fail Reasons:")
            for reason, count in sorted(result["fail_reasons"].items(), key=lambda x: -x[1]):
                print(f"     - {reason}: {count}")

    # Per-instrument analysis
    print("\n5. Per-Instrument Analysis (Apex 50K)")
    print("-" * 70)

    for instrument in ["MNQ", "MES", "MGC", "6E"]:
        inst_signals = test[test["instrument"] == instrument]
        if len(inst_signals) < 100:
            continue

        result = monte_carlo_evals(
            signals=inst_signals.reset_index(drop=True),
            model=model,
            config=EVAL_CONFIGS["apex_50k"],
            threshold=best_config[0],
            max_trades_per_day=best_config[1],
            instruments=[instrument],
            n_simulations=50,
        )

        print(f"   {instrument}: Pass={result['pass_rate']:.1%}, "
              f"Avg Days={result['avg_days_to_pass']:.1f}, "
              f"WR={result['avg_winrate_passed']:.1%}")

    # Strategy summary
    print("\n" + "=" * 70)
    print("RECOMMENDED STRATEGY FOR FUNDED EVALS")
    print("=" * 70)
    print(f"""
   1. Use threshold: {best_config[0]:.2f}
   2. Max {best_config[1]} trades per day
   3. Focus on MNQ + MES (most liquid)
   4. Expected pass rate: ~{best_pass_rate:.0%}
   5. Expected days to pass: ~{result['avg_days_to_pass']:.0f}

   Signal Filter Rules:
   - Only take signals with >{best_config[0]*100:.0f}% model confidence
   - Stop trading after {best_config[1]} wins OR losses per day
   - If on losing streak (3+ consecutive losses), skip next day
    """)


if __name__ == "__main__":
    run_funded_sim()
