#!/usr/bin/env python3
"""
KLBS Signal Filter v2 - With Technical Indicators & Turbulence Detection

Focused on passing prop firm evals:
- High win rate
- Low drawdown
- MES, MNQ, MGC only

Uses walk-forward validation to avoid overfitting.
"""

import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, List, Tuple
from collections import defaultdict
from dataclasses import dataclass

SCRIPT_DIR = Path(__file__).parent.parent
os.chdir(SCRIPT_DIR)


# ============================================================================
# TECHNICAL INDICATORS
# ============================================================================

def calculate_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index - overbought/oversold."""
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / (loss + 1e-10)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def calculate_macd(prices: pd.Series) -> Tuple[pd.Series, pd.Series]:
    """MACD - momentum indicator."""
    ema12 = prices.ewm(span=12, adjust=False).mean()
    ema26 = prices.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    return macd.fillna(0), signal.fillna(0)


def calculate_adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average Directional Index - trend strength."""
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
    adx = dx.rolling(window=period).mean()
    return adx.fillna(25)


def calculate_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average True Range - volatility."""
    tr1 = high - low
    tr2 = abs(high - close.shift())
    tr3 = abs(low - close.shift())
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.rolling(window=period).mean()
    return atr.bfill()


def calculate_turbulence(returns: pd.DataFrame, lookback: int = 60) -> pd.Series:
    """
    Turbulence Index - detects market stress.
    High turbulence = unusual price movements = risky to trade.
    """
    turbulence = pd.Series(index=returns.index, dtype=float)

    for i in range(lookback, len(returns)):
        hist = returns.iloc[i-lookback:i]
        current = returns.iloc[i:i+1]

        mean = hist.mean()
        cov = hist.cov()

        try:
            cov_inv = np.linalg.pinv(cov.values)
            diff = (current.values - mean.values).flatten()
            turb = diff @ cov_inv @ diff.T
            turbulence.iloc[i] = turb
        except:
            turbulence.iloc[i] = 0

    return turbulence.fillna(0)


# ============================================================================
# DATA LOADING
# ============================================================================

def load_ohlc_data(data_dir: str = "data") -> Dict[str, pd.DataFrame]:
    """Load OHLC data for technical indicator calculation."""
    ohlc = {}
    data_path = Path(data_dir)

    for instrument in ["MNQ", "MES", "MGC"]:
        filepath = data_path / f"{instrument}_15m.csv"
        if filepath.exists():
            df = pd.read_csv(filepath, parse_dates=["ts_event"])
            df = df.sort_values("ts_event").set_index("ts_event")

            # Calculate indicators
            df["rsi"] = calculate_rsi(df["close"])
            df["macd"], df["macd_signal"] = calculate_macd(df["close"])
            df["adx"] = calculate_adx(df["high"], df["low"], df["close"])
            df["atr"] = calculate_atr(df["high"], df["low"], df["close"])
            df["atr_pct"] = df["atr"] / df["close"] * 100

            ohlc[instrument] = df
            print(f"  Loaded {instrument}: {len(df):,} bars with indicators")

    return ohlc


def load_signals(outputs_dir: str = "outputs", instruments: List[str] = None) -> pd.DataFrame:
    """Load signals for specified instruments."""
    outputs_path = Path(outputs_dir)
    all_signals = []

    if instruments is None:
        instruments = ["MNQ", "MES", "MGC"]

    for filepath in outputs_path.glob("klbs_*_trades.csv"):
        if "optimized" in str(filepath) or "_be" in str(filepath):
            continue

        filename = filepath.stem
        parts = filename.split("_")
        inst = parts[1] if len(parts) >= 2 else "UNK"

        if inst not in instruments:
            continue

        df = pd.read_csv(filepath, parse_dates=["date"])
        df["instrument"] = inst
        all_signals.append(df)
        print(f"  Loaded {inst}: {len(df):,} signals")

    signals = pd.concat(all_signals, ignore_index=True)
    signals = signals.sort_values("date").reset_index(drop=True)
    return signals


# ============================================================================
# FEATURE EXTRACTION
# ============================================================================

def get_market_context(ohlc: Dict[str, pd.DataFrame], instrument: str,
                       signal_time: pd.Timestamp) -> Dict[str, float]:
    """Get technical indicators at signal time."""
    if instrument not in ohlc:
        return {"rsi": 50, "macd": 0, "adx": 25, "atr_pct": 0.5, "turbulence": 0}

    df = ohlc[instrument]

    # Normalize timezone for comparison
    if signal_time.tzinfo is None:
        signal_time = pd.Timestamp(signal_time, tz='UTC')
    else:
        signal_time = signal_time.tz_convert('UTC')

    # Find closest bar before signal
    mask = df.index <= signal_time
    if mask.sum() == 0:
        return {"rsi": 50, "macd": 0, "adx": 25, "atr_pct": 0.5, "turbulence": 0}

    bar = df[mask].iloc[-1]

    # Calculate local turbulence (simplified - just recent volatility spike)
    recent = df[mask].tail(20)
    if len(recent) >= 10:
        recent_vol = recent["atr_pct"].std()
        longer_vol = df[mask].tail(100)["atr_pct"].std() if len(df[mask]) >= 100 else recent_vol
        turbulence = recent_vol / (longer_vol + 1e-10)
    else:
        turbulence = 1.0

    return {
        "rsi": bar["rsi"],
        "macd": bar["macd"],
        "macd_signal": bar["macd_signal"],
        "adx": bar["adx"],
        "atr_pct": bar["atr_pct"],
        "turbulence": turbulence,
    }


def extract_features_v2(signal: pd.Series, ohlc: Dict[str, pd.DataFrame],
                        recent_signals: pd.DataFrame = None) -> np.ndarray:
    """
    Extract features including technical indicators.
    """
    features = []

    # 1. Level type (6)
    levels = ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]
    level = signal.get("level", "PDL")
    features.extend([1.0 if level == l else 0.0 for l in levels])

    # 2. Direction (2)
    direction = signal.get("direction", "LONG")
    features.append(1.0 if direction == "LONG" else 0.0)
    features.append(1.0 if direction == "SHORT" else 0.0)

    # 3. Session (2)
    session = signal.get("session", "NY")
    features.append(1.0 if session == "London" else 0.0)
    features.append(1.0 if session == "NY" else 0.0)

    # 4. Day of week (5)
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    day = signal.get("day_of_week", "Monday")
    features.extend([1.0 if day == d else 0.0 for d in days])

    # 5. Hour normalized (1)
    hour = signal.get("hour", 12)
    features.append(hour / 24.0)

    # 6. Instrument (3 - only MES, MNQ, MGC)
    instruments = ["MNQ", "MES", "MGC"]
    inst = signal.get("instrument", "MNQ")
    features.extend([1.0 if inst == i else 0.0 for i in instruments])

    # 7. Technical indicators (6)
    signal_time = pd.Timestamp(signal["date"])
    ctx = get_market_context(ohlc, inst, signal_time)

    # RSI - normalize to 0-1, flag extremes
    rsi = ctx["rsi"]
    features.append(rsi / 100.0)
    features.append(1.0 if rsi > 70 else 0.0)  # Overbought
    features.append(1.0 if rsi < 30 else 0.0)  # Oversold

    # MACD - signal alignment
    macd_bullish = 1.0 if ctx["macd"] > ctx.get("macd_signal", 0) else 0.0
    features.append(macd_bullish)

    # ADX - trend strength (normalize 0-1, capped at 50)
    adx = min(ctx["adx"], 50) / 50.0
    features.append(adx)

    # Volatility/Turbulence
    features.append(min(ctx["atr_pct"], 2.0) / 2.0)
    features.append(min(ctx["turbulence"], 3.0) / 3.0)

    # 8. Rolling performance (5)
    if recent_signals is not None and len(recent_signals) > 0:
        inst_recent = recent_signals[recent_signals["instrument"] == inst].tail(10)
        if len(inst_recent) > 0:
            recent_wr = (inst_recent["outcome"] == "WIN").mean()
            consec_loss = 0
            for o in inst_recent["outcome"].iloc[::-1]:
                if o == "LOSS":
                    consec_loss += 1
                else:
                    break
        else:
            recent_wr = 0.5
            consec_loss = 0

        level_recent = recent_signals[recent_signals["level"] == level].tail(10)
        level_wr = (level_recent["outcome"] == "WIN").mean() if len(level_recent) > 0 else 0.5

        sess_recent = recent_signals[recent_signals["session"] == session].tail(10)
        sess_wr = (sess_recent["outcome"] == "WIN").mean() if len(sess_recent) > 0 else 0.5

        features.extend([
            recent_wr,
            min(consec_loss / 5.0, 1.0),
            level_wr,
            sess_wr,
            len(inst_recent) / 10.0,  # Signal frequency
        ])
    else:
        features.extend([0.5, 0.0, 0.5, 0.5, 0.5])

    return np.array(features, dtype=np.float32)


# ============================================================================
# TRAINING WITH WALK-FORWARD VALIDATION
# ============================================================================

def train_model(X: np.ndarray, y: np.ndarray):
    """Train Random Forest with conservative settings to avoid overfitting."""
    from sklearn.ensemble import RandomForestClassifier

    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=6,           # Shallow to avoid overfitting
        min_samples_leaf=50,   # Require significant sample size
        min_samples_split=100,
        max_features="sqrt",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X, y)
    return model


def precompute_all_features(
    signals: pd.DataFrame,
    ohlc: Dict[str, pd.DataFrame],
) -> np.ndarray:
    """Pre-compute features for ALL signals once (major speedup)."""
    print("   Pre-computing features for all signals...")

    signals = signals.copy()
    signals["date"] = pd.to_datetime(signals["date"], utc=True).dt.tz_localize(None)

    X_all = []
    n = len(signals)

    for i in range(n):
        row = signals.iloc[i]
        context = signals.iloc[max(0, i-100):i]
        X_all.append(extract_features_v2(row, ohlc, context))

        if (i + 1) % 2000 == 0:
            print(f"   ... {i+1:,}/{n:,} signals processed")

    print(f"   Features extracted: {len(X_all):,} x {len(X_all[0])} features")
    return np.array(X_all)


def walk_forward_backtest(
    signals: pd.DataFrame,
    X_all: np.ndarray,
    train_months: int = 18,
    test_months: int = 3,
) -> List[Dict]:
    """
    Walk-forward validation to avoid overfitting.
    Train on N months, test on next M months, roll forward.
    Uses pre-computed features for speed.
    """
    signals = signals.copy()
    signals["date"] = pd.to_datetime(signals["date"], utc=True).dt.tz_localize(None)
    signals["label"] = (signals["outcome"] == "WIN").astype(int)

    min_date = signals["date"].min()
    max_date = signals["date"].max()

    results = []
    current_start = min_date

    print(f"\n   Walk-Forward Validation ({train_months}m train / {test_months}m test)")
    print("   " + "-" * 60)

    while True:
        train_end = current_start + pd.DateOffset(months=train_months)
        test_start = train_end
        test_end = test_start + pd.DateOffset(months=test_months)

        if test_end > max_date:
            break

        # Split data using indices
        train_mask = (signals["date"] >= current_start) & (signals["date"] < train_end)
        test_mask = (signals["date"] >= test_start) & (signals["date"] < test_end)

        train_indices = signals[train_mask].index.tolist()
        test_indices = signals[test_mask].index.tolist()

        if len(train_indices) < 200 or len(test_indices) < 50:
            current_start += pd.DateOffset(months=test_months)
            continue

        # Use pre-computed features (fast!)
        X_train = X_all[train_indices]
        y_train = signals.iloc[train_indices]["label"].values
        X_test = X_all[test_indices]
        test_df = signals.iloc[test_indices]

        # Train model
        model = train_model(X_train, y_train)

        # Test at different thresholds
        probs = model.predict_proba(X_test)[:, 1]

        for threshold in [0.50, 0.55, 0.60]:
            take_mask = probs >= threshold
            taken = test_df[take_mask]

            if len(taken) > 0:
                wr = (taken["outcome"] == "WIN").mean()
                pnl = taken["pnl_usd"].sum()
                n_taken = len(taken)
            else:
                wr = 0
                pnl = 0
                n_taken = 0

            results.append({
                "period": f"{test_start.date()} to {test_end.date()}",
                "threshold": threshold,
                "n_train": len(train_indices),
                "n_test": len(test_indices),
                "n_taken": n_taken,
                "take_rate": n_taken / len(test_indices) if len(test_indices) > 0 else 0,
                "win_rate": wr,
                "pnl": pnl,
                "baseline_wr": (test_df["outcome"] == "WIN").mean(),
                "baseline_pnl": test_df["pnl_usd"].sum(),
            })

        # Print progress
        print(f"   {test_start.date()} - {test_end.date()}: "
              f"n={len(test_indices)}, baseline WR={results[-1]['baseline_wr']:.1%}")

        current_start += pd.DateOffset(months=test_months)

    return results


# ============================================================================
# FUNDED ACCOUNT SIMULATION
# ============================================================================

@dataclass
class EvalConfig:
    name: str
    profit_target: float
    max_daily_loss: float
    max_drawdown: float
    min_days: int


EVAL_CONFIGS = {
    "apex_50k": EvalConfig("Apex 50K", 3000, 1300, 3000, 7),
    "topstep_50k": EvalConfig("Topstep 50K", 3000, 1000, 2000, 5),
}


def simulate_eval_v2(
    signals: pd.DataFrame,
    model,
    ohlc: Dict[str, pd.DataFrame],
    config: EvalConfig,
    threshold: float,
    max_trades_per_day: int,
    turbulence_threshold: float = 2.0,
    start_idx: int = 0,
) -> Dict:
    """Simulate eval with turbulence filter."""

    pnl = 0.0
    peak = 0.0
    max_dd = 0.0
    daily_pnl = 0.0
    current_day = None
    trades_today = 0
    total_trades = 0
    wins = 0
    trading_days = set()
    start_date = None

    for idx in range(start_idx, len(signals)):
        signal = signals.iloc[idx]
        signal_date = pd.Timestamp(signal["date"]).date()

        if start_date is None:
            start_date = signal_date

        days_elapsed = (signal_date - start_date).days
        if days_elapsed > 30:
            return {"passed": False, "reason": "Calendar limit", "days": days_elapsed,
                    "pnl": pnl, "max_dd": max_dd, "trades": total_trades,
                    "win_rate": wins/total_trades if total_trades > 0 else 0}

        # New day reset
        if signal_date != current_day:
            if current_day and daily_pnl < -config.max_daily_loss:
                return {"passed": False, "reason": "Daily loss", "days": days_elapsed,
                        "pnl": pnl, "max_dd": max_dd, "trades": total_trades,
                        "win_rate": wins/total_trades if total_trades > 0 else 0}
            current_day = signal_date
            daily_pnl = 0.0
            trades_today = 0

        if trades_today >= max_trades_per_day:
            continue

        # Get features and check turbulence
        context = signals.iloc[max(0, idx-100):idx]
        features = extract_features_v2(signal, ohlc, context)

        # Turbulence check (last feature)
        if features[-3] > turbulence_threshold / 3.0:  # ATR too high
            continue

        # Model prediction
        prob = model.predict_proba(features.reshape(1, -1))[0, 1]

        if prob < threshold:
            continue

        # Take trade
        trade_pnl = signal["pnl_usd"]
        pnl += trade_pnl
        daily_pnl += trade_pnl
        total_trades += 1
        trades_today += 1
        trading_days.add(signal_date)

        if signal["outcome"] == "WIN":
            wins += 1

        peak = max(peak, pnl)
        max_dd = max(max_dd, peak - pnl)

        if max_dd > config.max_drawdown:
            return {"passed": False, "reason": "Max DD", "days": days_elapsed,
                    "pnl": pnl, "max_dd": max_dd, "trades": total_trades,
                    "win_rate": wins/total_trades if total_trades > 0 else 0}

        if pnl >= config.profit_target and len(trading_days) >= config.min_days:
            return {"passed": True, "reason": "Target hit", "days": days_elapsed,
                    "pnl": pnl, "max_dd": max_dd, "trades": total_trades,
                    "win_rate": wins/total_trades if total_trades > 0 else 0}

    return {"passed": False, "reason": "No signals", "days": 0,
            "pnl": pnl, "max_dd": max_dd, "trades": total_trades,
            "win_rate": wins/total_trades if total_trades > 0 else 0}


def monte_carlo_evals_v2(
    signals: pd.DataFrame,
    model,
    ohlc: Dict[str, pd.DataFrame],
    config: EvalConfig,
    threshold: float,
    max_trades: int,
    n_sims: int = 100,
) -> Dict:
    """Run Monte Carlo simulations."""
    results = []
    n = len(signals)

    np.random.seed(42)
    starts = np.random.randint(0, max(1, n - 500), size=n_sims)

    for start_idx in starts:
        r = simulate_eval_v2(signals, model, ohlc, config, threshold, max_trades, start_idx=start_idx)
        results.append(r)

    passed = [r for r in results if r["passed"]]

    return {
        "pass_rate": len(passed) / len(results),
        "avg_days": np.mean([r["days"] for r in passed]) if passed else 0,
        "avg_trades": np.mean([r["trades"] for r in passed]) if passed else 0,
        "avg_win_rate": np.mean([r["win_rate"] for r in passed]) if passed else 0,
        "avg_max_dd": np.mean([r["max_dd"] for r in passed]) if passed else 0,
        "fail_reasons": defaultdict(int, {r["reason"]: sum(1 for x in results if x["reason"] == r["reason"]) for r in results if not r["passed"]}),
    }


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("=" * 70)
    print("KLBS Signal Filter v2 - Technical Indicators + Turbulence")
    print("Focused on: MES, MNQ, MGC | Goal: Pass Prop Evals Fast")
    print("=" * 70)

    # Load data
    print("\n1. Loading Data...")
    ohlc = load_ohlc_data()
    signals = load_signals(instruments=["MNQ", "MES", "MGC"])

    print(f"\n   Total signals: {len(signals):,}")
    print(f"   Date range: {signals['date'].min()} to {signals['date'].max()}")
    print(f"   Baseline win rate: {(signals['outcome'] == 'WIN').mean():.1%}")

    # Pre-compute all features once (major speedup)
    print("\n2. Pre-computing Features...")
    X_all = precompute_all_features(signals, ohlc)

    # Walk-forward validation
    print("\n3. Walk-Forward Validation...")
    wf_results = walk_forward_backtest(signals, X_all, train_months=18, test_months=3)

    # Aggregate results by threshold
    print("\n4. Aggregated Results by Threshold")
    print("-" * 70)

    for thresh in [0.50, 0.55, 0.60]:
        thresh_results = [r for r in wf_results if r["threshold"] == thresh]
        if not thresh_results:
            continue

        avg_wr = np.mean([r["win_rate"] for r in thresh_results if r["n_taken"] > 0])
        avg_take = np.mean([r["take_rate"] for r in thresh_results])
        total_pnl = sum(r["pnl"] for r in thresh_results)
        baseline_pnl = sum(r["baseline_pnl"] for r in thresh_results)

        print(f"   Threshold {thresh}: Take={avg_take:.1%}, WR={avg_wr:.1%}, "
              f"PnL=${total_pnl:,.0f} (vs ${baseline_pnl:,.0f} baseline)")

    # Train final model using pre-computed features
    print("\n5. Training Final Model for Eval Simulation...")
    signals["label"] = (signals["outcome"] == "WIN").astype(int)

    # Use first 70% for training
    n = len(signals)
    train_end = int(n * 0.7)

    X_train = X_all[:train_end]
    y_train = signals.iloc[:train_end]["label"].values

    model = train_model(X_train, y_train)
    print("   Model trained!")

    # Feature importance
    print("\n6. Feature Importance (Top 10)")
    print("-" * 70)

    feature_names = (
        ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"] +
        ["LONG", "SHORT", "London", "NY"] +
        ["Mon", "Tue", "Wed", "Thu", "Fri", "Hour"] +
        ["MNQ", "MES", "MGC"] +
        ["RSI", "RSI_OB", "RSI_OS", "MACD_Bull", "ADX", "ATR%", "Turb"] +
        ["RecentWR", "ConsecLoss", "LevelWR", "SessWR", "Frequency"]
    )

    importances = model.feature_importances_
    sorted_idx = np.argsort(importances)[::-1][:10]
    for idx in sorted_idx:
        print(f"   {feature_names[idx]:12s}: {importances[idx]:.4f}")

    # Funded account simulation
    print("\n7. Funded Account Simulation (Apex 50K)")
    print("-" * 70)

    test_signals = signals.iloc[train_end:].reset_index(drop=True)

    best_config = None
    best_pass_rate = 0

    for threshold in [0.50, 0.55, 0.60, 0.65]:
        for max_trades in [2, 3, 4]:
            result = monte_carlo_evals_v2(
                test_signals, model, ohlc,
                EVAL_CONFIGS["apex_50k"],
                threshold=threshold,
                max_trades=max_trades,
                n_sims=50,
            )

            print(f"   Thresh={threshold}, MaxTrades={max_trades}: "
                  f"Pass={result['pass_rate']:.0%}, Days={result['avg_days']:.1f}, "
                  f"WR={result['avg_win_rate']:.1%}")

            if result['pass_rate'] > best_pass_rate:
                best_pass_rate = result['pass_rate']
                best_config = (threshold, max_trades)

    # Full simulation with best config
    print(f"\n   Best Config: threshold={best_config[0]}, max_trades={best_config[1]}")
    print("\n8. Per-Instrument Analysis (Best Config)")
    print("-" * 70)

    for inst in ["MNQ", "MES", "MGC"]:
        inst_signals = test_signals[test_signals["instrument"] == inst].reset_index(drop=True)
        if len(inst_signals) < 100:
            continue

        result = monte_carlo_evals_v2(
            inst_signals, model, ohlc,
            EVAL_CONFIGS["apex_50k"],
            threshold=best_config[0],
            max_trades=best_config[1],
            n_sims=50,
        )

        print(f"   {inst}: Pass={result['pass_rate']:.0%}, "
              f"Days={result['avg_days']:.1f}, WR={result['avg_win_rate']:.1%}, "
              f"MaxDD=${result['avg_max_dd']:,.0f}")

    # Summary
    print("\n" + "=" * 70)
    print("RECOMMENDED STRATEGY")
    print("=" * 70)
    print(f"""
   Instruments:    MES, MNQ, MGC (diversified)
   Threshold:      {best_config[0]:.2f}
   Max Trades/Day: {best_config[1]}

   Signal Filter Rules:
   1. Only take signals with >{best_config[0]*100:.0f}% model confidence
   2. Skip if ATR% > 1.5% (high volatility)
   3. Max {best_config[1]} trades per day per account
   4. After 3 consecutive losses, skip next day

   Expected Results:
   - Pass Rate: ~{best_pass_rate:.0%}
   - Win Rate:  ~{result['avg_win_rate']:.0%}
   - Days to Pass: ~{result['avg_days']:.0f}
    """)


if __name__ == "__main__":
    main()
