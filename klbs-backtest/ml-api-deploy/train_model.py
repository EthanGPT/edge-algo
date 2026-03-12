#!/usr/bin/env python3
"""
KLBS ML Signal Filter - Training Script v6 (SENTIMENT)

Focused on MES/MNQ/MGC micros only.
Uses CONTINUOUS weights for RSI, MACD, and ADX/DI based on backtest analysis.
Added 5 news sentiment features from GDELT historical data.

Key changes from v5:
- Added 5 sentiment features: News_Sentiment, News_Volume, Sentiment_Momentum,
  News_Volatility, Sentiment_Direction_Align
- Feature count: 29 -> 34

Run: python -m ml-api-deploy.train_model
"""

import os
import sys
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import TimeSeriesSplit
from datetime import datetime

# Add news_sentiment to path for sentiment features
sys.path.insert(0, str(Path(__file__).parent.parent / "news_sentiment"))
try:
    from sentiment_features import SentimentFeatureEngineering, join_sentiment_to_trades
    SENTIMENT_ENABLED = True
except ImportError:
    SENTIMENT_ENABLED = False
    print("WARNING: Sentiment module not found - using neutral values")

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

    # Join sentiment features from historical GDELT data
    if SENTIMENT_ENABLED:
        print("\n  Loading sentiment features...")
        sentiment_eng = SentimentFeatureEngineering()
        for inst in ALL_INSTRUMENTS:
            # Load processed sentiment features
            sent_features = sentiment_eng.create_features(
                sentiment_eng.load_sentiment(inst)
            )
            if not sent_features.empty:
                # Join to signals for this instrument
                inst_mask = signals['instrument'] == inst
                if inst_mask.any():
                    inst_signals = signals[inst_mask].copy()
                    inst_signals = join_sentiment_to_trades(
                        inst_signals, sent_features, time_col='date'
                    )
                    # Update original signals with sentiment columns
                    for col in ['News_Sentiment', 'News_Volume',
                                'Sentiment_Momentum', 'News_Volatility']:
                        if col in inst_signals.columns:
                            signals.loc[inst_mask, col] = inst_signals[col].values
                    print(f"    {inst}: Joined {inst_mask.sum()} signals with sentiment")
    else:
        print("  Sentiment disabled - using neutral values")

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

    Feature vector (34 features) - v6 with sentiment:
    - Level one-hot (6): PDH, PDL, PMH, PML, LPH, LPL
    - Direction one-hot (2): LONG, SHORT
    - Session one-hot (2): London, NY
    - Day of week one-hot (5): Mon-Fri
    - Hour normalized (1)
    - Hour_Score (1): Boost 9am, penalize 11am/13pm/15pm
    - Instrument one-hot (3): MES, MNQ, MGC
    - RSI_Score (1): Direction-aware continuous score
    - RSI_Momentum (1): RSI ROC aligned with direction
    - MACD_Score (1): Direction-aware MACD alignment
    - MACD_Hist (1): Momentum direction from histogram
    - DI_Align (1): +DI/-DI alignment
    - ATR_Score (1): Direction-aware ATR
    - Setup_Score (1): Penalize bad level+direction+session combos
    - Historical level WR (1)
    - Historical session WR (1)
    - News_Sentiment (1): Rolling 4-hour sentiment
    - News_Volume (1): Article count normalized
    - Sentiment_Momentum (1): Sentiment rate of change
    - News_Volatility (1): Conflicting news indicator
    - Sentiment_Direction_Align (1): Does sentiment match trade?
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

    # 5b. Hour_Score (1 feature) - Boost/penalize specific hours based on analysis
    # 9am NY = 56.8% (best NY), 11am = 54.1%, 13pm = 52.7% (worst), 15pm = 53.2%
    if hour == 9:
        hour_score = 1.0   # Best NY hour - 56.8% WR
    elif hour in [7, 8]:
        hour_score = 0.8   # Good London hours - 55.7-56.3% WR
    elif hour in [10, 12]:
        hour_score = 0.7   # OK hours - 55.7-56.5% WR
    elif hour in [11, 13, 14, 15]:
        hour_score = 0.3   # Bad hours - 52.7-54.5% WR
    else:
        hour_score = 0.5   # Neutral
    features.append(hour_score)

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

    # RSI_SCORE (1 feature) - Direction-aware from 25k signal analysis
    # LONG: RSI 55-65 = best (60-62% WR), <30 = worst (50.6% WR)
    # SHORT: RSI <35 = best (59-60% WR), >70 = worst (51.2% WR)
    if is_long:
        if rsi < 30:
            rsi_score = 0.3   # 50.6% WR
        elif rsi < 40:
            rsi_score = 0.6   # 53-57% WR
        elif rsi < 50:
            rsi_score = 0.7   # 56-59% WR
        elif rsi < 55:
            rsi_score = 0.9   # 60.4% WR
        elif rsi < 65:
            rsi_score = 1.0   # 59-62% WR (BEST)
        else:
            rsi_score = 0.9   # 60% WR
    else:  # SHORT
        if rsi < 35:
            rsi_score = 1.0   # 59-60% WR (BEST)
        elif rsi < 50:
            rsi_score = 0.8   # 56-58% WR
        elif rsi < 60:
            rsi_score = 0.6   # 54-55% WR
        elif rsi < 70:
            rsi_score = 0.4   # 52% WR
        else:
            rsi_score = 0.3   # 51.2% WR
    features.append(rsi_score)

    # RSI_MOMENTUM (1 feature) - RSI ROC aligned with direction
    # LONG + rising = 61.8% WR, falling = 54.9% WR (6.9% edge)
    # SHORT + falling = 58.7% WR, rising = 52.8% WR (5.9% edge)
    if is_long:
        rsi_momentum = 1.0 if rsi_roc >= 0 else 0.7
    else:
        rsi_momentum = 0.9 if rsi_roc <= 0 else 0.6
    features.append(rsi_momentum)

    # MACD_SCORE (1 feature) - Direction-aware MACD alignment
    # LONG + bullish = 59.0% WR, bearish = 55.2% WR
    # SHORT + bearish = 56.7% WR, bullish = 53.4% WR
    if is_long:
        macd_score = 0.9 if macd > 0 else 0.7
    else:
        macd_score = 0.8 if macd <= 0 else 0.6
    features.append(macd_score)

    # MACD_HIST (1 feature) - Momentum direction
    # LONG + positive = 59.1% WR, negative = 55.9% WR
    # SHORT + negative = 56.6% WR, positive = 53.4% WR
    if is_long:
        macd_hist_score = 0.9 if macd_hist > 0 else 0.75
    else:
        macd_hist_score = 0.8 if macd_hist <= 0 else 0.6
    features.append(macd_hist_score)

    # DI_ALIGN (1 feature) - Directional movement alignment
    # LONG + aligned = 59.7% WR, not = 55.5% WR (4.2% edge)
    # SHORT + aligned = 56.8% WR, not = 53.3% WR (3.5% edge)
    if is_long:
        di_align = 0.9 if plus_di > minus_di else 0.7
    else:
        di_align = 0.8 if minus_di > plus_di else 0.6
    features.append(di_align)

    # ATR_SCORE (1 feature) - Direction-aware ATR
    # LONG: Low 57.2%, Med 56.5%, High 56.0% (all similar)
    # SHORT: Low 54.4%, Med 56.4%, High 61.4% (high vol BEST!)
    atr_pct = ctx["atr_pct"]
    if is_long:
        if atr_pct < 0.25:
            atr_score = 0.8   # 57.2% WR
        elif atr_pct < 0.5:
            atr_score = 0.75  # 56.5% WR
        else:
            atr_score = 0.7   # 56.0% WR
    else:  # SHORT - high vol is best!
        if atr_pct < 0.25:
            atr_score = 0.6   # 54.4% WR
        elif atr_pct < 0.5:
            atr_score = 0.8   # 56.4% WR
        else:
            atr_score = 1.0   # 61.4% WR (BEST!)
    features.append(atr_score)

    # SETUP_SCORE (1 feature) - Penalize worst level+direction+session combos (NEW)
    # Analysis: PDL LONG London = 47.6%, PDH SHORT London = 47.7% (AVOID)
    # Best: PML LONG London = 58.8%, PDL LONG NY = 56.9%
    setup_key = f"{level}_{direction}_{session}"
    BAD_SETUPS = {
        "PDL_LONG_London": 0.2,   # 47.6% WR - worst!
        "PDH_SHORT_London": 0.2,  # 47.7% WR - avoid!
        "PDH_SHORT_NY": 0.5,      # 52.8% WR - below baseline
        "LPH_SHORT_London": 0.6,  # 53.5% WR - below baseline
    }
    GOOD_SETUPS = {
        "PML_LONG_London": 1.0,   # 58.8% WR - best!
        "PDL_LONG_NY": 0.95,      # 56.9% WR - great
        "LPL_LONG_London": 0.9,   # 56.0% WR - good
        "PMH_SHORT_London": 0.9,  # 56.0% WR - good
    }
    if setup_key in BAD_SETUPS:
        setup_score = BAD_SETUPS[setup_key]
    elif setup_key in GOOD_SETUPS:
        setup_score = GOOD_SETUPS[setup_key]
    else:
        setup_score = 0.7  # Neutral
    features.append(setup_score)

    # 8. Historical win rates (2 features) - REAL DATA
    features.append(LEVEL_WIN_RATES.get(level, 0.55))
    features.append(SESSION_WIN_RATES.get(session, 0.55))

    # 9. News Sentiment features (5 features) - v6
    # Get from pre-joined sentiment data or use neutral
    news_sentiment = signal.get('News_Sentiment', 0.5)
    news_volume = signal.get('News_Volume', 0.0)
    sentiment_momentum = signal.get('Sentiment_Momentum', 0.5)
    news_volatility = signal.get('News_Volatility', 0.0)

    features.append(news_sentiment)      # News_Sentiment
    features.append(news_volume)          # News_Volume
    features.append(sentiment_momentum)   # Sentiment_Momentum
    features.append(news_volatility)      # News_Volatility

    # Sentiment_Direction_Align - matches main.py logic exactly
    if is_long:
        if news_sentiment > 0.65:
            sent_align = 0.9
        elif news_sentiment > 0.55:
            sent_align = 0.75
        elif news_sentiment < 0.35:
            sent_align = 0.4
        else:
            sent_align = 0.6
        if sentiment_momentum > 0.6:
            sent_align = min(1.0, sent_align + 0.1)
        elif sentiment_momentum < 0.4:
            sent_align = max(0.3, sent_align - 0.1)
    else:  # SHORT
        if news_sentiment < 0.35:
            sent_align = 0.9
        elif news_sentiment < 0.45:
            sent_align = 0.75
        elif news_sentiment > 0.65:
            sent_align = 0.4
        else:
            sent_align = 0.6
        if sentiment_momentum < 0.4:
            sent_align = min(1.0, sent_align + 0.1)
        elif sentiment_momentum > 0.6:
            sent_align = max(0.3, sent_align - 0.1)

    if news_volume > 0.7 and sent_align > 0.7:
        sent_align = min(1.0, sent_align + 0.05)
    if news_volatility > 0.7:
        sent_align = max(0.3, sent_align - 0.1)

    features.append(sent_align)  # Sentiment_Direction_Align

    return np.array(features, dtype=np.float32)


def get_feature_names():
    """Return feature names for interpretability."""
    names = []
    names.extend(LEVELS)  # 6
    names.extend(["LONG", "SHORT"])  # 2
    names.extend(["London", "NY"])  # 2
    names.extend(DAYS)  # 5
    names.append("Hour")  # 1
    names.append("Hour_Score")  # 1
    names.extend(INSTRUMENTS)  # 3
    # Data-driven scores
    names.extend(["RSI_Score", "RSI_Momentum", "MACD_Score", "MACD_Hist", "DI_Align"])  # 5
    names.extend(["ATR_Score", "Setup_Score"])  # 2
    names.extend(["LevelWR", "SessWR"])  # 2
    # Sentiment features (v6)
    names.extend(["News_Sentiment", "News_Volume", "Sentiment_Momentum",
                  "News_Volatility", "Sentiment_Direction_Align"])  # 5
    return names  # Total: 34


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

    # Handle any NaN values (from missing sentiment data)
    nan_count = np.isnan(X).sum()
    if nan_count > 0:
        print(f"   Filling {nan_count} NaN values with neutral (0.5)")
        X = np.nan_to_num(X, nan=0.5)

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
