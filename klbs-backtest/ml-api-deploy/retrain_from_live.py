#!/usr/bin/env python3
"""
KLBS ML Retraining - Learn from Live Decisions

This script:
1. Pulls live signals + outcomes from Supabase
2. Combines with historical backtest data (CSVs)
3. Analyzes ML decision quality (was I right to approve/reject?)
4. Retrains the model on combined data
5. Reports insights on what's working and what needs tuning

Run: python -m ml-api-deploy.retrain_from_live
"""

import os
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
from sklearn.ensemble import GradientBoostingClassifier

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# How much to weight live data vs historical
# Higher = more emphasis on recent live signals
LIVE_DATA_WEIGHT = 3  # Each live signal counts as 3 historical ones

# Minimum live signals with outcomes needed to retrain
MIN_LIVE_SIGNALS = 10

# Historical win rates (same as train_model.py)
LEVEL_WIN_RATES = {
    "PDH": 0.516, "PDL": 0.526, "PMH": 0.566,
    "PML": 0.601, "LPH": 0.544, "LPL": 0.561,
}
SESSION_WIN_RATES = {"London": 0.569, "NY": 0.544}

INSTRUMENTS = ["MES", "MNQ", "MGC"]
LEVELS = ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]
SESSIONS = ["London", "NY"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]


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
# DECISION ANALYSIS - THE LEARNING INSIGHTS
# ══════════════════════════════════════════════════════════════════════════════

def analyze_decisions(df: pd.DataFrame) -> dict:
    """
    Analyze ML decision quality.

    Key questions:
    - Approved signals: What % won? (Should be high)
    - Rejected signals: What % won? (Should be low - we were right to reject)
    - Where is the model making mistakes?
    """
    print("\n2. Analyzing ML Decision Quality...")
    print("=" * 60)

    insights = {
        "approved": {},
        "rejected": {},
        "mistakes": [],
        "recommendations": [],
    }

    # Split by approved/rejected
    approved = df[df["approved"] == True]
    rejected = df[df["approved"] == False]

    # Approved signal stats
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

    # Rejected signal stats (hypothetical - what would have happened)
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

        # Find rejected signals that would have won (mistakes)
        missed_wins = rejected[rejected["outcome"] == "WIN"]
        if len(missed_wins) > 0:
            print(f"\n   MISSED OPPORTUNITIES ({len(missed_wins)} rejected signals that won):")
            for _, row in missed_wins.iterrows():
                conf = row.get("confidence", 0) * 100
                print(f"      - {row['ticker']} {row['level']} {row['session']} | Conf: {conf:.1f}% | RSI: {row.get('rsi', 'N/A')}")
                insights["mistakes"].append({
                    "type": "missed_win",
                    "ticker": row["ticker"],
                    "level": row["level"],
                    "session": row["session"],
                    "confidence": row.get("confidence", 0),
                    "rsi": row.get("rsi"),
                })

    # Find approved signals that lost
    if len(approved) > 0:
        bad_approvals = approved[approved["outcome"] == "LOSS"]
        if len(bad_approvals) > 0:
            print(f"\n   BAD APPROVALS ({len(bad_approvals)} approved signals that lost):")
            for _, row in bad_approvals.iterrows():
                conf = row.get("confidence", 0) * 100
                print(f"      - {row['ticker']} {row['level']} {row['session']} | Conf: {conf:.1f}% | RSI: {row.get('rsi', 'N/A')}")
                insights["mistakes"].append({
                    "type": "bad_approval",
                    "ticker": row["ticker"],
                    "level": row["level"],
                    "session": row["session"],
                    "confidence": row.get("confidence", 0),
                    "rsi": row.get("rsi"),
                })

    # Calculate filter edge
    if len(approved) > 0 and len(rejected) > 0:
        edge = insights["approved"]["win_rate"] - insights["rejected"]["win_rate"]
        print(f"\n   FILTER EDGE: {edge:+.1%}")
        if edge > 0.10:
            print("   Verdict: Filter is working well!")
        elif edge > 0:
            print("   Verdict: Filter has some edge, room to improve")
        else:
            print("   Verdict: Filter may be rejecting good signals!")
            insights["recommendations"].append("Consider lowering confidence threshold")

    # Breakdown by level
    print("\n   WIN RATE BY LEVEL:")
    for level in LEVELS:
        level_df = df[df["level"] == level]
        if len(level_df) >= 3:
            wr = (level_df["outcome"] == "WIN").mean()
            print(f"      {level}: {wr:.1%} ({len(level_df)} signals)")

    # Breakdown by session
    print("\n   WIN RATE BY SESSION:")
    for session in SESSIONS:
        sess_df = df[df["session"] == session]
        if len(sess_df) >= 3:
            wr = (sess_df["outcome"] == "WIN").mean()
            print(f"      {session}: {wr:.1%} ({len(sess_df)} signals)")

    # Breakdown by instrument
    print("\n   WIN RATE BY INSTRUMENT:")
    for inst in INSTRUMENTS:
        inst_df = df[df["ticker"] == inst]
        if len(inst_df) >= 3:
            wr = (inst_df["outcome"] == "WIN").mean()
            print(f"      {inst}: {wr:.1%} ({len(inst_df)} signals)")

    print("=" * 60)

    return insights


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE EXTRACTION (same as train_model.py)
# ══════════════════════════════════════════════════════════════════════════════

def extract_features_from_live(row: dict) -> np.ndarray:
    """Extract 29 features from a live signal row."""
    features = []

    # 1. Level one-hot (6)
    level = row.get("level", "PDL")
    features.extend([1.0 if level == l else 0.0 for l in LEVELS])

    # 2. Direction one-hot (2)
    action = row.get("action", "buy")
    is_long = action == "buy"
    features.append(1.0 if is_long else 0.0)
    features.append(1.0 if not is_long else 0.0)

    # 3. Session one-hot (2)
    session = row.get("session", "NY")
    features.append(1.0 if session == "London" else 0.0)
    features.append(1.0 if session == "NY" else 0.0)

    # 4. Day of week one-hot (5)
    try:
        ts = pd.Timestamp(row.get("timestamp", ""))
        day = ts.strftime("%A")
    except:
        day = "Monday"
    features.extend([1.0 if day == d else 0.0 for d in DAYS])

    # 5. Hour normalized (1)
    try:
        hour = pd.Timestamp(row.get("timestamp", "")).hour
    except:
        hour = 12
    features.append(hour / 24.0)

    # 6. Instrument one-hot (3)
    inst = row.get("ticker", "MNQ")
    features.extend([1.0 if inst == i else 0.0 for i in INSTRUMENTS])

    # 7. Technical indicators
    rsi = float(row.get("rsi", 50) or 50)
    macd = float(row.get("macd", 0) or 0)
    adx = float(row.get("adx", 25) or 25)
    atr_pct = float(row.get("atr_pct", 0.5) or 0.5)

    # RSI ROC - use stored value if available
    rsi_roc = float(row.get("rsi_roc", 0) or 0)

    # RSI normalized (1)
    features.append(rsi / 100.0)

    # RSI ROC normalized (1)
    features.append(np.clip(rsi_roc / 20.0, -1.0, 1.0))

    # RSI balanced zone (1)
    features.append(1.0 if 35 <= rsi <= 65 else 0.0)

    # Momentum aligned (1)
    if is_long:
        momentum_aligned = 1.0 if rsi_roc >= -5 else 0.0
    else:
        momentum_aligned = 1.0 if rsi_roc <= 5 else 0.0
    features.append(momentum_aligned)

    # MACD bullish (1)
    features.append(1.0 if macd > 0 else 0.0)

    # ADX normalized (1)
    features.append(adx / 100.0)

    # ADX strong trend (1)
    features.append(1.0 if adx > 25 else 0.0)

    # ATR% normalized (1)
    features.append(min(atr_pct / 2.0, 1.0))

    # 8. Historical win rates (2)
    features.append(LEVEL_WIN_RATES.get(level, 0.55))
    features.append(SESSION_WIN_RATES.get(session, 0.55))

    return np.array(features, dtype=np.float32)


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


def extract_features_from_historical(row: dict, ohlc: dict = None) -> np.ndarray:
    """Extract features from historical backtest row."""
    features = []

    # 1. Level one-hot (6)
    level = row.get("level", "PDL")
    features.extend([1.0 if level == l else 0.0 for l in LEVELS])

    # 2. Direction one-hot (2)
    direction = row.get("direction", "LONG")
    is_long = direction == "LONG"
    features.append(1.0 if is_long else 0.0)
    features.append(1.0 if not is_long else 0.0)

    # 3. Session one-hot (2)
    session = row.get("session", "NY")
    features.append(1.0 if session == "London" else 0.0)
    features.append(1.0 if session == "NY" else 0.0)

    # 4. Day of week one-hot (5)
    try:
        day = pd.Timestamp(row["date"]).strftime("%A")
    except:
        day = "Monday"
    features.extend([1.0 if day == d else 0.0 for d in DAYS])

    # 5. Hour normalized (1)
    try:
        hour = pd.Timestamp(row["date"]).hour
    except:
        hour = 12
    features.append(hour / 24.0)

    # 6. Instrument one-hot (3)
    inst = row.get("ticker", "MNQ")
    features.extend([1.0 if inst == i else 0.0 for i in INSTRUMENTS])

    # 7. Technical indicators (use defaults for historical - no OHLC lookup for speed)
    rsi = 50
    rsi_roc = 0
    macd = 0
    adx = 25
    atr_pct = 0.5

    features.append(rsi / 100.0)
    features.append(np.clip(rsi_roc / 20.0, -1.0, 1.0))
    features.append(1.0 if 35 <= rsi <= 65 else 0.0)
    features.append(1.0)  # momentum aligned default
    features.append(0.5)  # MACD neutral
    features.append(adx / 100.0)
    features.append(1.0 if adx > 25 else 0.0)
    features.append(min(atr_pct / 2.0, 1.0))

    # 8. Historical win rates (2)
    features.append(LEVEL_WIN_RATES.get(level, 0.55))
    features.append(SESSION_WIN_RATES.get(session, 0.55))

    return np.array(features, dtype=np.float32)


# ══════════════════════════════════════════════════════════════════════════════
# TRAINING
# ══════════════════════════════════════════════════════════════════════════════

def prepare_training_data(live_df: pd.DataFrame, hist_df: pd.DataFrame):
    """
    Combine live and historical data for training.

    Live data is weighted more heavily (LIVE_DATA_WEIGHT).
    """
    print("\n4. Preparing training data...")

    X_list = []
    y_list = []
    weights_list = []

    # Process live signals (ALL of them - both approved and rejected)
    # This is how the model learns from its mistakes
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

    print(f"   Final dataset: {len(X):,} samples")
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

    # Train with sample weights so live data has more influence
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
    print("KLBS ML RETRAINING - Learning from Live Decisions")
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

    # Analyze decisions - this is the learning insights
    insights = analyze_decisions(live_df)

    # Load historical data
    hist_df = load_historical_data()

    # Prepare combined training data
    X, y, weights = prepare_training_data(live_df, hist_df)

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
        print(f"(Lower is better - means we're right to reject them)")

    if insights.get("recommendations"):
        print(f"\nRecommendations:")
        for rec in insights["recommendations"]:
            print(f"   - {rec}")

    print("\nModel is now updated with live learning!")
    print("Restart the API to use the new model.")
    print("=" * 70)


if __name__ == "__main__":
    main()
