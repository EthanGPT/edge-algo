#!/usr/bin/env python3
"""
KLBS ML Signal Filter - Training Script v4

Focused on MES/MNQ/MGC micros only.
Uses CONTINUOUS weights for RSI, MACD, and ADX/DI based on backtest analysis.

Key changes from v3:
- RSI: Continuous score based on direction (not binary 35-65 zone)
- MACD: Added histogram momentum (not just binary > 0)
- ADX: Replaced ADX_Strong with DI alignment score

Run: python -m ml-api-deploy.train_model
"""

import os
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import TimeSeriesSplit
from datetime import datetime

# ══════════════════════════════════════════════════════════════════════════════
# HISTORICAL WIN RATES (from 15,736 signals across 6+ years)
# These are CONSTANTS - baked into the model from real data
# ══════════════════════════════════════════════════════════════════════════════

LEVEL_WIN_RATES = {
    "PDH": 0.516,
    "PDL": 0.526,
    "PMH": 0.566,
    "PML": 0.601,
    "LPH": 0.544,
    "LPL": 0.561,
}

SESSION_WIN_RATES = {
    "London": 0.569,
    "NY": 0.544,
}

INSTRUMENT_WIN_RATES = {
    "MES": 0.568,
    "MNQ": 0.548,
    "MGC": 0.602,
}

DIRECTION_WIN_RATES = {
    "LONG": 0.578,
    "SHORT": 0.552,
}

# Feature configuration
INSTRUMENTS = ["MES", "MNQ", "MGC"]  # Model outputs (micros)
ALL_INSTRUMENTS = ["MES", "MNQ", "MGC"]  # ONLY micros - full-size dilutes edge!
INSTRUMENT_MAP = {}  # No mapping needed
LEVELS = ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]
SESSIONS = ["London", "NY"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]


def load_data():
    """Load OHLC and signals for ALL instruments (micros + full-size)."""
    script_dir = Path(__file__).parent.parent
    os.chdir(script_dir)

    # Load OHLC data for all instruments (use combined files for extended history)
    ohlc = {}
    for inst in ALL_INSTRUMENTS:
        # Prefer combined files (ES+MES, NQ+MNQ, GC+MGC) for more training data
        combined_path = Path("data") / f"{inst}_combined_15m.csv"
        regular_path = Path("data") / f"{inst}_15m.csv"
        filepath = combined_path if combined_path.exists() else regular_path
        if filepath.exists():
            df = pd.read_csv(filepath, parse_dates=["ts_event"])
            df = df.set_index("ts_event").sort_index()
            if df.index.tzinfo is None:
                df.index = df.index.tz_localize("UTC")

            # Add indicators
            df["rsi"] = calculate_rsi(df["close"])
            df["rsi_roc"] = df["rsi"].diff(3)  # RSI rate of change over 3 bars
            df["macd"], df["macd_signal"] = calculate_macd(df["close"])
            df["macd_hist"] = df["macd"] - df["macd_signal"]  # Histogram for momentum
            df["adx"], df["plus_di"], df["minus_di"] = calculate_adx(df["high"], df["low"], df["close"])
            atr = calculate_atr(df["high"], df["low"], df["close"])
            df["atr_pct"] = (atr / df["close"]) * 100

            ohlc[inst] = df
            print(f"  Loaded {inst}: {len(df):,} bars")

    # Load signals from ALL instruments
    signals_list = []
    for inst in ALL_INSTRUMENTS:
        filepath = Path("outputs") / f"klbs_{inst}_trades.csv"
        if filepath.exists():
            df = pd.read_csv(filepath, parse_dates=["date"])
            # Map full-size to micro for consistent feature encoding
            df["instrument"] = INSTRUMENT_MAP.get(inst, inst)
            df["source_instrument"] = inst  # Keep track of original
            signals_list.append(df)
            print(f"  Loaded {inst}: {len(df):,} signals → mapped to {INSTRUMENT_MAP.get(inst, inst)}")

    signals = pd.concat(signals_list, ignore_index=True)
    signals = signals.sort_values("date").reset_index(drop=True)

    return ohlc, signals


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
    """Calculate ADX, +DI, and -DI for directional movement analysis."""
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

    return adx, plus_di.fillna(25), minus_di.fillna(25)


def calculate_atr(high, low, close, period=14):
    tr1 = high - low
    tr2 = abs(high - close.shift())
    tr3 = abs(low - close.shift())
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(window=period).mean().bfill()


def get_market_context(ohlc, instrument, signal_time):
    """Get indicators at signal time including RSI ROC, MACD histogram, and DI values."""
    defaults = {
        "rsi": 50, "rsi_roc": 0,
        "macd": 0, "macd_hist": 0,
        "adx": 25, "plus_di": 25, "minus_di": 25,
        "atr_pct": 0.5
    }

    if instrument not in ohlc:
        return defaults

    df = ohlc[instrument]

    # Handle timezone
    if signal_time.tzinfo is None:
        signal_time = pd.Timestamp(signal_time, tz="UTC")
    else:
        signal_time = signal_time.tz_convert("UTC")

    mask = df.index <= signal_time
    if mask.sum() == 0:
        return defaults

    bar = df[mask].iloc[-1]
    return {
        "rsi": bar["rsi"] if not pd.isna(bar["rsi"]) else 50,
        "rsi_roc": bar["rsi_roc"] if not pd.isna(bar["rsi_roc"]) else 0,
        "macd": bar["macd"] if not pd.isna(bar["macd"]) else 0,
        "macd_hist": bar["macd_hist"] if not pd.isna(bar["macd_hist"]) else 0,
        "adx": bar["adx"] if not pd.isna(bar["adx"]) else 25,
        "plus_di": bar["plus_di"] if not pd.isna(bar["plus_di"]) else 25,
        "minus_di": bar["minus_di"] if not pd.isna(bar["minus_di"]) else 25,
        "atr_pct": bar["atr_pct"] if not pd.isna(bar["atr_pct"]) else 0.5,
    }


def extract_features(signal, ohlc, rolling_context=None):
    """
    Extract features for a signal.

    Feature vector (26 features) - v4 CLEAN with data-driven scores only:
    - Level one-hot (6): PDH, PDL, PMH, PML, LPH, LPL
    - Direction one-hot (2): LONG, SHORT
    - Session one-hot (2): London, NY
    - Day of week one-hot (5): Mon-Fri
    - Hour normalized (1)
    - Instrument one-hot (3): MES, MNQ, MGC
    - RSI_Score (1): Direction-aware continuous score from backtest data
    - RSI_Momentum (1): RSI ROC aligned with direction
    - MACD_Score (1): Direction-aware MACD alignment
    - MACD_Hist (1): Momentum direction from histogram
    - DI_Align (1): +DI/-DI alignment with direction
    - ATR% normalized (1)
    - Historical level WR (1)
    - Historical session WR (1)

    REMOVED: Raw RSI, raw ADX, raw MACD - using data-driven scores instead
    """
    features = []

    # 1. Level one-hot (6 features)
    level = signal.get("level", "PDL")
    features.extend([1.0 if level == l else 0.0 for l in LEVELS])

    # 2. Direction one-hot (2 features)
    direction = signal.get("direction", "LONG")
    is_long = direction == "LONG"
    features.append(1.0 if is_long else 0.0)
    features.append(1.0 if not is_long else 0.0)

    # 3. Session one-hot (2 features)
    session = signal.get("session", "NY")
    features.append(1.0 if session == "London" else 0.0)
    features.append(1.0 if session == "NY" else 0.0)

    # 4. Day of week one-hot (5 features)
    try:
        day = pd.Timestamp(signal["date"]).strftime("%A")
    except:
        day = "Monday"
    features.extend([1.0 if day == d else 0.0 for d in DAYS])

    # 5. Hour normalized (1 feature)
    try:
        hour = pd.Timestamp(signal["date"]).hour
    except:
        hour = 12
    features.append(hour / 24.0)

    # 6. Instrument one-hot (3 features)
    inst = signal.get("instrument", "MNQ")
    features.extend([1.0 if inst == i else 0.0 for i in INSTRUMENTS])

    # 7. Technical indicators - DATA-DRIVEN SCORES ONLY
    signal_time = pd.Timestamp(signal["date"])
    source_inst = signal.get("source_instrument", inst)
    ctx = get_market_context(ohlc, source_inst, signal_time)

    rsi = ctx["rsi"]
    rsi_roc = ctx["rsi_roc"]
    macd = ctx["macd"]
    macd_hist = ctx["macd_hist"]
    plus_di = ctx["plus_di"]
    minus_di = ctx["minus_di"]

    # RSI_SCORE (1 feature) - Direction-aware from backtest data
    # LONG: RSI 45-65 = best (62% WR), <35 = worst (51% WR)
    # SHORT: RSI 35-55 = best (60% WR), >65 = worst (51% WR)
    if is_long:
        if rsi < 35:
            rsi_score = 0.3   # Falling knife - 51% WR
        elif rsi < 45:
            rsi_score = 0.6   # OK - 57% WR
        elif rsi < 65:
            rsi_score = 1.0   # Best - 62% WR
        else:
            rsi_score = 0.8   # Still good - 62% WR
    else:
        if rsi > 65:
            rsi_score = 0.3   # FOMO rally - 51% WR
        elif rsi > 55:
            rsi_score = 0.6   # OK - 55% WR
        elif rsi > 35:
            rsi_score = 1.0   # Best - 60% WR
        else:
            rsi_score = 0.8   # Still good - 59% WR
    features.append(rsi_score)

    # RSI_MOMENTUM (1 feature) - RSI ROC aligned with direction
    # LONG + rising RSI = 61.3% WR vs 56% falling
    # SHORT + falling RSI = 58.2% WR vs 53.4% rising
    if is_long:
        rsi_momentum = 1.0 if rsi_roc >= 0 else (0.7 if rsi_roc >= -5 else 0.3)
    else:
        rsi_momentum = 1.0 if rsi_roc <= 0 else (0.7 if rsi_roc <= 5 else 0.3)
    features.append(rsi_momentum)

    # MACD_SCORE (1 feature) - Direction-aware MACD alignment
    # LONG + bullish MACD = 59.9% WR vs 55.8%
    # SHORT + bearish MACD = 57.3% WR vs 54%
    if is_long:
        macd_score = 1.0 if macd > 0 else 0.5
    else:
        macd_score = 1.0 if macd <= 0 else 0.5
    features.append(macd_score)

    # MACD_HIST (1 feature) - Momentum direction
    # LONG + rising histogram = 62% WR
    # SHORT + falling histogram = 59.5% WR
    if is_long:
        macd_hist_score = 1.0 if macd_hist > 0 else 0.5
    else:
        macd_hist_score = 1.0 if macd_hist <= 0 else 0.5
    features.append(macd_hist_score)

    # DI_ALIGN (1 feature) - Directional movement alignment
    # LONG + (+DI > -DI) = 61.8% WR vs 55.7%
    # SHORT + (-DI > +DI) = 57.8% WR vs 53.7%
    if is_long:
        di_align = 1.0 if plus_di > minus_di else 0.5
    else:
        di_align = 1.0 if minus_di > plus_di else 0.5
    features.append(di_align)

    # ATR% normalized (1 feature) - Keep this, it's useful for volatility
    features.append(min(ctx["atr_pct"] / 2.0, 1.0))

    # 8. Historical win rates (2 features) - REAL DATA
    features.append(LEVEL_WIN_RATES.get(level, 0.55))
    features.append(SESSION_WIN_RATES.get(session, 0.55))

    return np.array(features, dtype=np.float32)


def get_feature_names():
    """Return feature names for interpretability."""
    names = []
    names.extend(LEVELS)  # 6
    names.extend(["LONG", "SHORT"])  # 2
    names.extend(["London", "NY"])  # 2
    names.extend(DAYS)  # 5
    names.append("Hour")  # 1
    names.extend(INSTRUMENTS)  # 3
    # Data-driven scores only - NO raw RSI/ADX/MACD
    names.extend(["RSI_Score", "RSI_Momentum", "MACD_Score", "MACD_Hist", "DI_Align"])  # 5
    names.extend(["ATR%", "LevelWR", "SessWR"])  # 3
    return names  # Total: 26


def train_model(X, y, signals):
    """Train with walk-forward validation."""
    print("\n3. Training with walk-forward validation...")

    # Use GradientBoosting with stronger regularization for better edge
    model = GradientBoostingClassifier(
        n_estimators=500,
        max_depth=5,
        min_samples_leaf=50,
        learning_rate=0.03,
        subsample=0.7,
        max_features=0.8,
        random_state=42,
    )

    # Walk-forward split (use last 20% as holdout)
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]
    signals_test = signals.iloc[split_idx:]

    print(f"   Train: {len(X_train):,} | Test: {len(X_test):,}")

    model.fit(X_train, y_train)

    # Evaluate on test set
    probs = model.predict_proba(X_test)[:, 1]

    print("\n4. Walk-Forward Test Results:")
    print("-" * 60)

    baseline_wr = y_test.mean()
    print(f"   Baseline WR: {baseline_wr:.1%}")

    for thresh in [0.50, 0.55, 0.60, 0.65, 0.70]:
        mask = probs >= thresh
        if mask.sum() < 10:
            continue
        taken = signals_test[mask]
        wr = (taken["outcome"] == "WIN").mean()
        lift = wr - baseline_wr
        pct_taken = mask.mean()
        print(f"   {thresh:.0%} threshold: Take {mask.sum():,} ({pct_taken:.1%}), WR={wr:.1%} ({lift:+.1%} lift)")

    # Retrain on full data for production
    print("\n5. Retraining on full dataset for production...")
    model.fit(X, y)

    return model


def main():
    print("=" * 70)
    print("KLBS ML Signal Filter - Training v3")
    print("Focused on MES/MNQ/MGC with RSI Momentum")
    print("=" * 70)

    # Load data
    print("\n1. Loading data...")
    ohlc, signals = load_data()

    print(f"\n   Total: {len(signals):,} signals")
    print(f"   Baseline WR: {(signals['outcome'] == 'WIN').mean():.1%}")

    # Extract features
    print("\n2. Extracting features...")
    X = []
    for i in range(len(signals)):
        row = signals.iloc[i].to_dict()
        X.append(extract_features(row, ohlc))
        if (i + 1) % 5000 == 0:
            print(f"   ... {i+1:,}/{len(signals):,}")

    X = np.array(X)
    y = (signals["outcome"] == "WIN").astype(int).values

    print(f"   Feature matrix: {X.shape}")

    # Train
    model = train_model(X, y, signals)

    # Save model
    print("\n6. Saving model...")
    model_path = Path(__file__).parent / "model.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)

    print(f"   Saved to: {model_path}")
    print(f"   Size: {model_path.stat().st_size / 1024:.1f} KB")

    # Feature importance
    print("\n7. Feature Importance (Top 10):")
    print("-" * 50)

    feature_names = get_feature_names()
    importances = model.feature_importances_
    sorted_idx = np.argsort(importances)[::-1][:10]

    for rank, idx in enumerate(sorted_idx, 1):
        print(f"   {rank:2}. {feature_names[idx]:12s} {importances[idx]:.4f}")

    print("\n" + "=" * 70)
    print("Model ready! Deploy with: model.pkl")
    print("=" * 70)

    return model


if __name__ == "__main__":
    main()
