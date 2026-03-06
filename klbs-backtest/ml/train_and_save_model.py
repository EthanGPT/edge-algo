#!/usr/bin/env python3
"""
Train and Save ML Model for Deployment

Run this to train the signal filter model and save it for the API.

Usage:
    cd klbs-backtest
    python -m ml.train_and_save_model
"""

import os
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier

# Ensure we're in the right directory
SCRIPT_DIR = Path(__file__).parent.parent
os.chdir(SCRIPT_DIR)


def load_signals(instruments=None):
    """Load signals from backtest outputs."""
    outputs_path = Path("outputs")
    all_signals = []

    for filepath in outputs_path.glob("klbs_*_trades.csv"):
        if "optimized" in str(filepath) or "_be" in str(filepath):
            continue

        filename = filepath.stem
        parts = filename.split("_")
        instrument = parts[1] if len(parts) >= 2 else "UNK"

        if instruments and instrument not in instruments:
            continue

        df = pd.read_csv(filepath, parse_dates=["date"])
        df["instrument"] = instrument
        all_signals.append(df)
        print(f"  Loaded {instrument}: {len(df):,} signals")

    signals = pd.concat(all_signals, ignore_index=True)
    signals = signals.sort_values("date").reset_index(drop=True)
    return signals


def load_ohlc_data(instruments=None):
    """Load OHLC data with indicators."""
    data_path = Path("data")
    ohlc = {}

    for inst in instruments or ["MNQ", "MES", "MGC"]:
        filepath = data_path / f"{inst}_15m.csv"
        if not filepath.exists():
            continue

        df = pd.read_csv(filepath, parse_dates=["ts_event"])
        df = df.set_index("ts_event").sort_index()
        df.index = df.index.tz_localize("UTC") if df.index.tzinfo is None else df.index

        # Add indicators
        df["rsi"] = calculate_rsi(df["close"])
        df["macd"], df["macd_signal"] = calculate_macd(df["close"])
        df["adx"] = calculate_adx(df["high"], df["low"], df["close"])
        atr = calculate_atr(df["high"], df["low"], df["close"])
        df["atr_pct"] = (atr / df["close"]) * 100

        ohlc[inst] = df
        print(f"  Loaded {inst}: {len(df):,} bars")

    return ohlc


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
    adx = dx.rolling(window=period).mean()
    return adx.fillna(25)


def calculate_atr(high, low, close, period=14):
    tr1 = high - low
    tr2 = abs(high - close.shift())
    tr3 = abs(low - close.shift())
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(window=period).mean().bfill()


def get_market_context(ohlc, instrument, signal_time):
    """Get indicators at signal time."""
    if instrument not in ohlc:
        return {"rsi": 50, "macd": 0, "adx": 25, "atr_pct": 0.5}

    df = ohlc[instrument]

    # Handle timezone
    if signal_time.tzinfo is None:
        signal_time = pd.Timestamp(signal_time, tz='UTC')
    else:
        signal_time = signal_time.tz_convert('UTC')

    mask = df.index <= signal_time
    if mask.sum() == 0:
        return {"rsi": 50, "macd": 0, "adx": 25, "atr_pct": 0.5}

    bar = df[mask].iloc[-1]
    return {
        "rsi": bar["rsi"],
        "macd": bar["macd"],
        "adx": bar["adx"],
        "atr_pct": bar["atr_pct"],
    }


def extract_features(signal, ohlc, context_signals):
    """Extract features for a single signal."""
    features = []

    # 1. Level type (one-hot, 6 features)
    levels = ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]
    level = signal.get("level", "PDL")
    features.extend([1.0 if level == l else 0.0 for l in levels])

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
    features.extend([1.0 if day == d else 0.0 for d in days])

    # 5. Hour (normalized, 1 feature)
    hour = signal.get("hour", 12)
    features.append(hour / 24.0)

    # 6. Instrument (one-hot, 3 features)
    instruments = ["MNQ", "MES", "MGC"]
    inst = signal.get("instrument", "MNQ")
    features.extend([1.0 if inst == i else 0.0 for i in instruments])

    # 7. Technical indicators (7 features)
    signal_time = pd.Timestamp(signal["date"])
    ctx = get_market_context(ohlc, inst, signal_time)

    rsi = ctx["rsi"]
    macd = ctx["macd"]
    adx = ctx["adx"]
    atr_pct = ctx["atr_pct"]

    features.append(rsi / 100.0 if not pd.isna(rsi) else 0.5)
    features.append(1.0 if rsi > 70 else 0.0)
    features.append(1.0 if rsi < 30 else 0.0)
    features.append(1.0 if macd > 0 else 0.0)
    features.append(adx / 100.0 if not pd.isna(adx) else 0.25)
    features.append(min(atr_pct / 2.0, 1.0) if not pd.isna(atr_pct) else 0.25)
    features.append(0.5)  # Turbulence placeholder

    # 8. Rolling context (5 features)
    if context_signals is not None and len(context_signals) > 0:
        inst_recent = context_signals[context_signals["instrument"] == inst].tail(10)
        recent_wr = (inst_recent["outcome"] == "WIN").mean() if len(inst_recent) > 0 else 0.5

        consec_loss = 0
        for outcome in inst_recent["outcome"].iloc[::-1]:
            if outcome == "LOSS":
                consec_loss += 1
            else:
                break

        level_recent = context_signals[context_signals["level"] == level].tail(10)
        level_wr = (level_recent["outcome"] == "WIN").mean() if len(level_recent) > 0 else 0.5

        sess_recent = context_signals[context_signals["session"] == session].tail(10)
        sess_wr = (sess_recent["outcome"] == "WIN").mean() if len(sess_recent) > 0 else 0.5

        frequency = len(context_signals.tail(20)) / 20.0
    else:
        recent_wr = 0.5
        consec_loss = 0
        level_wr = 0.5
        sess_wr = 0.5
        frequency = 0.5

    features.extend([recent_wr, min(consec_loss / 5.0, 1.0), level_wr, sess_wr, frequency])

    return np.array(features, dtype=np.float32)


def main():
    print("=" * 70)
    print("KLBS ML Signal Filter - Train & Save Model")
    print("=" * 70)

    # Load data
    print("\n1. Loading data...")
    instruments = ["MNQ", "MES", "MGC"]
    ohlc = load_ohlc_data(instruments)
    signals = load_signals(instruments)

    print(f"\n   Total signals: {len(signals):,}")
    print(f"   Baseline win rate: {(signals['outcome'] == 'WIN').mean():.1%}")

    # Prepare features
    print("\n2. Extracting features...")
    signals["label"] = (signals["outcome"] == "WIN").astype(int)

    X = []
    for i in range(len(signals)):
        row = signals.iloc[i]
        context = signals.iloc[max(0, i-100):i]
        X.append(extract_features(row, ohlc, context))

        if (i + 1) % 3000 == 0:
            print(f"   ... {i+1:,}/{len(signals):,} processed")

    X = np.array(X)
    y = signals["label"].values

    print(f"   Features shape: {X.shape}")

    # Train model
    print("\n3. Training model...")
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=6,
        min_samples_leaf=50,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X, y)

    # Evaluate
    probs = model.predict_proba(X)[:, 1]
    for thresh in [0.50, 0.55, 0.60, 0.65]:
        mask = probs >= thresh
        taken = signals[mask]
        if len(taken) > 0:
            wr = (taken["outcome"] == "WIN").mean()
            print(f"   Threshold {thresh}: Take {len(taken):,} ({mask.mean():.1%}), WR={wr:.1%}")

    # Save model
    print("\n4. Saving model...")
    model_path = Path("ml/models/signal_filter_v2.pkl")
    model_path.parent.mkdir(parents=True, exist_ok=True)

    with open(model_path, "wb") as f:
        pickle.dump(model, f)

    print(f"   Model saved to: {model_path}")
    print(f"   Model size: {model_path.stat().st_size / 1024:.1f} KB")

    # Feature importance
    print("\n5. Feature Importance (Top 10)")
    print("-" * 50)

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

    print("\n" + "=" * 70)
    print("Model ready for deployment!")
    print("=" * 70)
    print("""
Next steps:
1. Deploy the API:
   uvicorn ml.api.filter_service:app --host 0.0.0.0 --port 8000

2. Set environment variables:
   export TRADERSPOST_WEBHOOK_URL="your-traderspost-url"

3. Update TradingView alert webhook URL to point to your API

4. Test with: curl -X POST http://localhost:8000/webhook -d '{"ticker":"MES",...}'
    """)


if __name__ == "__main__":
    main()
