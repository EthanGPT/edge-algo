#!/usr/bin/env python3
"""
KLBS ML Retraining - Learn from Live Decisions (v6 SENTIMENT)

This script:
1. Pulls live signals + outcomes from Supabase
2. Combines with historical backtest data (CSVs)
3. Analyzes ML decision quality (was I right to approve/reject?)
4. Retrains the model on combined data
5. Reports insights on what's working and what needs tuning

IMPORTANT: Feature extraction MUST match main.py and train_model.py exactly!
Currently: 34 features (v6 with sentiment)

Run: python retrain_from_live.py
"""

import os
import sys
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
from sklearn.ensemble import GradientBoostingClassifier

# Add news_sentiment to path for sentiment features
sys.path.insert(0, str(Path(__file__).parent.parent / "news_sentiment"))
try:
    from sentiment_features import SentimentFeatureEngineering, join_sentiment_to_trades
    SENTIMENT_ENABLED = True
except ImportError:
    SENTIMENT_ENABLED = False
    print("WARNING: Sentiment module not found - using neutral values")

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# How much to weight live data vs historical
LIVE_DATA_WEIGHT = 3  # Each live signal counts as 3 historical ones

# Minimum live signals with outcomes needed to retrain
MIN_LIVE_SIGNALS = 10

# Feature configuration - MUST MATCH main.py and train_model.py
INSTRUMENTS = ["MES", "MNQ", "MGC"]
LEVELS = ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]
SESSIONS = ["London", "NY"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

# Historical win rates (same as main.py)
LEVEL_WIN_RATES = {
    "PDH": 0.516, "PDL": 0.526, "PMH": 0.566,
    "PML": 0.601, "LPH": 0.544, "LPL": 0.561,
}
SESSION_WIN_RATES = {"London": 0.569, "NY": 0.544}

# Setup score mappings (same as main.py)
BAD_SETUPS = {
    "PDL_LONG_London": 0.2,
    "PDH_SHORT_London": 0.2,
    "PDH_SHORT_NY": 0.5,
    "LPH_SHORT_London": 0.6,
}
GOOD_SETUPS = {
    "PML_LONG_London": 1.0,
    "PDL_LONG_NY": 0.95,
    "LPL_LONG_London": 0.9,
    "PMH_SHORT_London": 0.9,
}


# ══════════════════════════════════════════════════════════════════════════════
# SUPABASE CONNECTION
# ══════════════════════════════════════════════════════════════════════════════

def connect_supabase():
    """Connect to Supabase and return client."""
    try:
        from supabase import create_client
        if not SUPABASE_URL or not SUPABASE_KEY:
            print("ERROR: SUPABASE_URL and SUPABASE_KEY env vars required")
            return None
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    except ImportError:
        print("ERROR: pip install supabase")
        return None


def fetch_live_signals(client) -> pd.DataFrame:
    """Fetch all signals with outcomes from Supabase."""
    print("\n1. Fetching live signals from Supabase...")

    result = client.table("ml_signals")\
        .select("*")\
        .not_.is_("outcome", "null")\
        .execute()

    if not result.data:
        print("   No signals with outcomes found")
        return pd.DataFrame()

    df = pd.DataFrame(result.data)
    print(f"   Found {len(df)} signals with outcomes")

    return df


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE EXTRACTION - v6 (MUST MATCH main.py EXACTLY!)
# ══════════════════════════════════════════════════════════════════════════════

def extract_features_from_live(row: dict) -> np.ndarray:
    """
    Extract 34 features from a live signal row.

    CRITICAL: This MUST match main.py extract_features() exactly!

    Features (34 total):
    - Level one-hot (6): PDH, PDL, PMH, PML, LPH, LPL
    - Direction one-hot (2): LONG, SHORT
    - Session one-hot (2): London, NY
    - Day of week one-hot (5): Mon-Fri
    - Hour normalized (1)
    - Hour_Score (1)
    - Instrument one-hot (3): MES, MNQ, MGC
    - RSI_Score (1): Direction-aware
    - RSI_Momentum (1): Direction-aware
    - MACD_Score (1): Direction-aware
    - MACD_Hist (1): Direction-aware
    - DI_Align (1): Direction-aware
    - ATR_Score (1): Direction-aware
    - Setup_Score (1)
    - Level WR (1)
    - Session WR (1)
    - News_Sentiment (1): Rolling 4-hour sentiment
    - News_Volume (1): Article count normalized
    - Sentiment_Momentum (1): Sentiment rate of change
    - News_Volatility (1): Conflicting news indicator
    - Sentiment_Direction_Align (1): Does sentiment match trade?
    """
    features = []

    # 1. Level one-hot (6 features)
    level = row.get("level", "PDL")
    features.extend([1.0 if level == l else 0.0 for l in LEVELS])

    # 2. Direction one-hot (2 features)
    action = row.get("action", "buy")
    is_long = action == "buy"
    features.append(1.0 if is_long else 0.0)
    features.append(1.0 if not is_long else 0.0)

    # 3. Session one-hot (2 features)
    session = row.get("session", "NY")
    features.append(1.0 if session == "London" else 0.0)
    features.append(1.0 if session == "NY" else 0.0)

    # 4. Day of week one-hot (5 features)
    try:
        ts = pd.Timestamp(row.get("timestamp", ""))
        day = ts.strftime("%A")
    except:
        day = "Monday"
    features.extend([1.0 if day == d else 0.0 for d in DAYS])

    # 5. Hour normalized (1 feature)
    try:
        hour = pd.Timestamp(row.get("timestamp", "")).hour
    except:
        hour = 12
    features.append(hour / 24.0)

    # 5b. Hour_Score (1 feature) - MUST MATCH main.py
    if hour == 9:
        hour_score = 1.0
    elif hour in [7, 8]:
        hour_score = 0.8
    elif hour in [10, 12]:
        hour_score = 0.7
    elif hour in [11, 13, 14, 15]:
        hour_score = 0.3
    else:
        hour_score = 0.5
    features.append(hour_score)

    # 6. Instrument one-hot (3 features)
    inst = row.get("ticker", "MNQ")
    features.extend([1.0 if inst == i else 0.0 for i in INSTRUMENTS])

    # 7. Technical indicators - v5 DIRECTION-AWARE SCORES
    rsi = float(row.get("rsi", 50) or 50)
    rsi_roc = float(row.get("rsi_roc", 0) or 0)
    macd = float(row.get("macd", 0) or 0)
    macd_hist = float(row.get("macd_hist", 0) or 0)
    plus_di = float(row.get("plus_di", 25) or 25)
    minus_di = float(row.get("minus_di", 25) or 25)
    atr_pct = float(row.get("atr_pct", 0.5) or 0.5)

    # RSI_SCORE (1 feature) - Direction-aware
    if is_long:
        if rsi < 30:
            rsi_score = 0.3
        elif rsi < 40:
            rsi_score = 0.6
        elif rsi < 50:
            rsi_score = 0.7
        elif rsi < 55:
            rsi_score = 0.9
        elif rsi < 65:
            rsi_score = 1.0
        else:
            rsi_score = 0.9
    else:  # SHORT
        if rsi < 35:
            rsi_score = 1.0
        elif rsi < 50:
            rsi_score = 0.8
        elif rsi < 60:
            rsi_score = 0.6
        elif rsi < 70:
            rsi_score = 0.4
        else:
            rsi_score = 0.3
    features.append(rsi_score)

    # RSI_MOMENTUM (1 feature) - Direction-aware
    if is_long:
        rsi_momentum = 1.0 if rsi_roc >= 0 else 0.7
    else:
        rsi_momentum = 0.9 if rsi_roc <= 0 else 0.6
    features.append(rsi_momentum)

    # MACD_SCORE (1 feature) - Direction-aware
    if is_long:
        macd_score = 0.9 if macd > 0 else 0.7
    else:
        macd_score = 0.8 if macd <= 0 else 0.6
    features.append(macd_score)

    # MACD_HIST (1 feature) - Direction-aware
    if is_long:
        macd_hist_score = 0.9 if macd_hist > 0 else 0.75
    else:
        macd_hist_score = 0.8 if macd_hist <= 0 else 0.6
    features.append(macd_hist_score)

    # DI_ALIGN (1 feature) - Direction-aware
    if is_long:
        di_align = 0.9 if plus_di > minus_di else 0.7
    else:
        di_align = 0.8 if minus_di > plus_di else 0.6
    features.append(di_align)

    # ATR_SCORE (1 feature) - Direction-aware
    if is_long:
        if atr_pct < 0.25:
            atr_score = 0.8
        elif atr_pct < 0.5:
            atr_score = 0.75
        else:
            atr_score = 0.7
    else:  # SHORT - high vol is best
        if atr_pct < 0.25:
            atr_score = 0.6
        elif atr_pct < 0.5:
            atr_score = 0.8
        else:
            atr_score = 1.0
    features.append(atr_score)

    # SETUP_SCORE (1 feature)
    direction = "LONG" if is_long else "SHORT"
    setup_key = f"{level}_{direction}_{session}"
    if setup_key in BAD_SETUPS:
        setup_score = BAD_SETUPS[setup_key]
    elif setup_key in GOOD_SETUPS:
        setup_score = GOOD_SETUPS[setup_key]
    else:
        setup_score = 0.7
    features.append(setup_score)

    # 8. Historical win rates (2 features)
    features.append(LEVEL_WIN_RATES.get(level, 0.55))
    features.append(SESSION_WIN_RATES.get(session, 0.55))

    # 9. News Sentiment features (5 features) - v6
    # For live signals, we need to get sentiment from live RSS or use neutral
    # Since retraining happens after the fact, we use neutral values
    # The live model will fetch real-time sentiment
    news_sentiment = row.get('News_Sentiment', 0.5)
    news_volume = row.get('News_Volume', 0.0)
    sentiment_momentum = row.get('Sentiment_Momentum', 0.5)
    news_volatility = row.get('News_Volatility', 0.0)

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


def extract_features_from_historical(row: dict) -> np.ndarray:
    """
    Extract 34 features from historical backtest row.
    Uses same logic as live but with different field names.

    For historical data, sentiment features come from pre-processed
    sentiment CSVs joined to trade data.
    """
    features = []

    # 1. Level one-hot (6 features)
    level = row.get("level", "PDL")
    features.extend([1.0 if level == l else 0.0 for l in LEVELS])

    # 2. Direction one-hot (2 features)
    direction = row.get("direction", "LONG")
    is_long = direction == "LONG"
    features.append(1.0 if is_long else 0.0)
    features.append(1.0 if not is_long else 0.0)

    # 3. Session one-hot (2 features)
    session = row.get("session", "NY")
    features.append(1.0 if session == "London" else 0.0)
    features.append(1.0 if session == "NY" else 0.0)

    # 4. Day of week one-hot (5 features)
    try:
        day = pd.Timestamp(row["date"]).strftime("%A")
    except:
        day = "Monday"
    features.extend([1.0 if day == d else 0.0 for d in DAYS])

    # 5. Hour normalized (1 feature)
    try:
        hour = pd.Timestamp(row["date"]).hour
    except:
        hour = 12
    features.append(hour / 24.0)

    # 5b. Hour_Score (1 feature)
    if hour == 9:
        hour_score = 1.0
    elif hour in [7, 8]:
        hour_score = 0.8
    elif hour in [10, 12]:
        hour_score = 0.7
    elif hour in [11, 13, 14, 15]:
        hour_score = 0.3
    else:
        hour_score = 0.5
    features.append(hour_score)

    # 6. Instrument one-hot (3 features)
    inst = row.get("ticker", "MNQ")
    features.extend([1.0 if inst == i else 0.0 for i in INSTRUMENTS])

    # 7. Technical indicators - DEFAULT VALUES for historical
    # Historical CSVs don't have indicators, use neutral defaults
    rsi = 50
    rsi_roc = 0
    macd = 0
    macd_hist = 0
    plus_di = 25
    minus_di = 25
    atr_pct = 0.5

    # RSI_SCORE - use neutral since no data
    rsi_score = 0.7 if is_long else 0.65
    features.append(rsi_score)

    # RSI_MOMENTUM - neutral
    rsi_momentum = 0.85 if is_long else 0.75
    features.append(rsi_momentum)

    # MACD_SCORE - neutral
    macd_score = 0.8 if is_long else 0.7
    features.append(macd_score)

    # MACD_HIST - neutral
    macd_hist_score = 0.82 if is_long else 0.7
    features.append(macd_hist_score)

    # DI_ALIGN - neutral
    di_align = 0.8 if is_long else 0.7
    features.append(di_align)

    # ATR_SCORE - neutral
    atr_score = 0.75 if is_long else 0.8
    features.append(atr_score)

    # SETUP_SCORE
    dir_str = "LONG" if is_long else "SHORT"
    setup_key = f"{level}_{dir_str}_{session}"
    if setup_key in BAD_SETUPS:
        setup_score = BAD_SETUPS[setup_key]
    elif setup_key in GOOD_SETUPS:
        setup_score = GOOD_SETUPS[setup_key]
    else:
        setup_score = 0.7
    features.append(setup_score)

    # 8. Historical win rates (2 features)
    features.append(LEVEL_WIN_RATES.get(level, 0.55))
    features.append(SESSION_WIN_RATES.get(session, 0.55))

    # 9. News Sentiment features (5 features) - v6
    # For historical data, these come from pre-joined sentiment CSVs
    news_sentiment = row.get('News_Sentiment', 0.5)
    news_volume = row.get('News_Volume', 0.0)
    sentiment_momentum = row.get('Sentiment_Momentum', 0.5)
    news_volatility = row.get('News_Volatility', 0.0)

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


# ══════════════════════════════════════════════════════════════════════════════
# DECISION ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════

def analyze_decisions(df: pd.DataFrame) -> dict:
    """Analyze ML decision quality."""
    print("\n2. Analyzing ML Decision Quality...")
    print("=" * 60)

    insights = {
        "approved": {},
        "rejected": {},
        "mistakes": [],
        "recommendations": [],
    }

    approved = df[df["approved"] == True]
    rejected = df[df["approved"] == False]

    if len(approved) > 0:
        approved_wins = (approved["outcome"] == "WIN").sum()
        approved_wr = approved_wins / len(approved)
        insights["approved"] = {
            "count": len(approved),
            "wins": approved_wins,
            "losses": len(approved) - approved_wins,
            "win_rate": approved_wr,
        }
        print(f"\n   APPROVED SIGNALS: {len(approved)}")
        print(f"   Win Rate: {approved_wr:.1%} ({approved_wins}W / {len(approved) - approved_wins}L)")

    if len(rejected) > 0:
        rejected_wins = (rejected["outcome"] == "WIN").sum()
        rejected_wr = rejected_wins / len(rejected)
        insights["rejected"] = {
            "count": len(rejected),
            "wins": rejected_wins,
            "losses": len(rejected) - rejected_wins,
            "win_rate": rejected_wr,
        }
        print(f"\n   REJECTED SIGNALS: {len(rejected)}")
        print(f"   Win Rate: {rejected_wr:.1%} ({rejected_wins}W / {len(rejected) - rejected_wins}L)")

    if len(approved) > 0 and len(rejected) > 0:
        edge = insights["approved"]["win_rate"] - insights["rejected"]["win_rate"]
        print(f"\n   FILTER EDGE: {edge:+.1%}")
        if edge > 0.10:
            print("   ✓ Filter is working well!")
        elif edge > 0:
            print("   ~ Filter has some edge")
        else:
            print("   ✗ Filter may be rejecting good signals!")
            insights["recommendations"].append("Consider lowering confidence threshold")

    print("=" * 60)
    return insights


# ══════════════════════════════════════════════════════════════════════════════
# LOAD HISTORICAL DATA
# ══════════════════════════════════════════════════════════════════════════════

def load_historical_data():
    """Load historical backtest data from CSVs."""
    print("\n3. Loading historical backtest data...")

    script_dir = Path(__file__).parent.parent
    signals_list = []

    for inst in INSTRUMENTS:
        filepath = script_dir / "outputs" / f"klbs_{inst}_trades.csv"
        if filepath.exists():
            df = pd.read_csv(filepath, parse_dates=["date"])
            df["ticker"] = inst
            df["action"] = df["direction"].apply(lambda x: "buy" if x == "LONG" else "sell")
            signals_list.append(df)
            print(f"   Loaded {inst}: {len(df):,} signals")

    if not signals_list:
        print("   No historical data found")
        return pd.DataFrame()

    signals = pd.concat(signals_list, ignore_index=True)
    print(f"   Total historical: {len(signals):,} signals")

    return signals


# ══════════════════════════════════════════════════════════════════════════════
# TRAINING
# ══════════════════════════════════════════════════════════════════════════════

def prepare_training_data(live_df: pd.DataFrame, hist_df: pd.DataFrame):
    """Combine live and historical data for training."""
    print("\n4. Preparing training data...")

    X_list = []
    y_list = []
    weights_list = []

    # Process live signals
    print(f"   Processing {len(live_df)} live signals (weight={LIVE_DATA_WEIGHT}x)...")
    for _, row in live_df.iterrows():
        features = extract_features_from_live(row.to_dict())
        outcome = 1 if row["outcome"] == "WIN" else 0

        X_list.append(features)
        y_list.append(outcome)
        weights_list.append(LIVE_DATA_WEIGHT)

    # Process historical signals
    if len(hist_df) > 0:
        print(f"   Processing {len(hist_df):,} historical signals (weight=1x)...")
        for i, row in hist_df.iterrows():
            features = extract_features_from_historical(row.to_dict())
            outcome = 1 if row["outcome"] == "WIN" else 0

            X_list.append(features)
            y_list.append(outcome)
            weights_list.append(1)

            if (i + 1) % 5000 == 0:
                print(f"      ... {i+1:,}/{len(hist_df):,}")

    X = np.array(X_list)
    y = np.array(y_list)
    weights = np.array(weights_list)

    print(f"   Final dataset: {len(X):,} samples, {X.shape[1]} features")
    print(f"   Live signals contribute: {len(live_df) * LIVE_DATA_WEIGHT / weights.sum() * 100:.1f}% of weight")

    return X, y, weights


def train_model(X, y, weights):
    """Train the model with sample weights."""
    print("\n5. Training model...")

    model = GradientBoostingClassifier(
        n_estimators=500,
        max_depth=5,
        min_samples_leaf=50,
        learning_rate=0.03,
        subsample=0.7,
        max_features=0.8,
        random_state=42,
    )

    model.fit(X, y, sample_weight=weights)

    # Quick validation
    probs = model.predict_proba(X)[:, 1]

    print("\n   Training Results (on combined data):")
    for thresh in [0.50, 0.55, 0.60, 0.65]:
        mask = probs >= thresh
        if mask.sum() < 10:
            continue
        wr = y[mask].mean()
        pct = mask.mean()
        print(f"   {thresh:.0%} threshold: {mask.sum():,} signals ({pct:.1%}), WR={wr:.1%}")

    return model


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("KLBS ML RETRAINING - v5 Features (29 direction-aware)")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print("=" * 70)

    # Connect to Supabase
    client = connect_supabase()
    if not client:
        return

    # Fetch live signals with outcomes
    live_df = fetch_live_signals(client)

    if len(live_df) < MIN_LIVE_SIGNALS:
        print(f"\nNeed at least {MIN_LIVE_SIGNALS} signals with outcomes to retrain.")
        print(f"Currently have: {len(live_df)}")
        print("Exiting without retraining.")
        return

    # Analyze decisions
    insights = analyze_decisions(live_df)

    # Load historical data
    hist_df = load_historical_data()

    # Prepare combined training data
    X, y, weights = prepare_training_data(live_df, hist_df)

    # Verify feature count
    expected_features = 34  # v6 with sentiment features
    if X.shape[1] != expected_features:
        print(f"\n!!! ERROR: Feature count mismatch!")
        print(f"    Expected: {expected_features}, Got: {X.shape[1]}")
        print("    This will break the model. Fix before continuing.")
        return

    # Train
    model = train_model(X, y, weights)

    # Save model
    print("\n6. Saving updated model...")
    model_path = Path(__file__).parent / "model.pkl"
    backup_path = Path(__file__).parent / f"model_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pkl"

    # Backup existing model
    if model_path.exists():
        import shutil
        shutil.copy(model_path, backup_path)
        print(f"   Backed up existing model to: {backup_path.name}")

    # Save new model
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    print(f"   Saved new model to: {model_path}")
    print(f"   Model expects {model.n_features_in_} features")

    # Summary
    print("\n" + "=" * 70)
    print("RETRAINING COMPLETE")
    print("=" * 70)
    print(f"\nData used:")
    print(f"   Live signals: {len(live_df)} (weighted {LIVE_DATA_WEIGHT}x)")
    print(f"   Historical: {len(hist_df):,}")

    if insights.get("approved", {}).get("count", 0) > 0:
        print(f"\nApproved signal accuracy: {insights['approved']['win_rate']:.1%}")
    if insights.get("rejected", {}).get("count", 0) > 0:
        print(f"Rejected signal win rate: {insights['rejected']['win_rate']:.1%}")

    print("\nModel is now updated! Restart the API to use the new model.")
    print("=" * 70)


if __name__ == "__main__":
    main()
