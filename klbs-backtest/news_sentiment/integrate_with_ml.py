"""
ML Model Integration for News Sentiment

This file shows EXACTLY how to add sentiment features to:
1. train_model.py - For training with sentiment
2. main.py - For live predictions with sentiment

RUN analyze_sentiment_edge.py FIRST to validate edge!
Only add if edge is confirmed.
"""

# =============================================================================
# STEP 1: Add to train_model.py (feature extraction)
# =============================================================================

TRAIN_MODEL_ADDITIONS = '''
# Add to imports at top of train_model.py
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from news_sentiment.sentiment_features import (
    SentimentFeatureEngineering,
    join_sentiment_to_trades,
    add_direction_alignment
)

# Add to extract_features() function - after existing features
def extract_features_with_sentiment(row, sentiment_df=None):
    """Extract all features including sentiment"""

    # Get existing 30 features
    features = extract_features(row)

    # Add sentiment features (5 new features)
    if sentiment_df is not None and not sentiment_df.empty:
        # Get sentiment at trade time
        trade_time = pd.to_datetime(row['date'])

        # Find nearest sentiment before trade
        mask = sentiment_df.index <= trade_time
        if mask.any():
            nearest = sentiment_df[mask].iloc[-1]

            features['News_Sentiment'] = nearest.get('News_Sentiment', 0.5)
            features['News_Volume'] = nearest.get('News_Volume', 0.5)
            features['Sentiment_Momentum'] = nearest.get('Sentiment_Momentum', 0.5)
            features['News_Volatility'] = nearest.get('News_Volatility', 0.5)

            # Calculate direction alignment
            direction = row['direction']
            sent = features['News_Sentiment']

            if direction == 'LONG':
                if sent > 0.65:
                    features['Sentiment_Direction_Align'] = 0.9
                elif sent < 0.35:
                    features['Sentiment_Direction_Align'] = 0.4
                else:
                    features['Sentiment_Direction_Align'] = 0.6
            else:  # SHORT
                if sent < 0.35:
                    features['Sentiment_Direction_Align'] = 0.9
                elif sent > 0.65:
                    features['Sentiment_Direction_Align'] = 0.4
                else:
                    features['Sentiment_Direction_Align'] = 0.6
        else:
            # No sentiment data - use neutral
            features['News_Sentiment'] = 0.5
            features['News_Volume'] = 0.5
            features['Sentiment_Momentum'] = 0.5
            features['News_Volatility'] = 0.5
            features['Sentiment_Direction_Align'] = 0.6
    else:
        # No sentiment - use neutral
        features['News_Sentiment'] = 0.5
        features['News_Volume'] = 0.5
        features['Sentiment_Momentum'] = 0.5
        features['News_Volatility'] = 0.5
        features['Sentiment_Direction_Align'] = 0.6

    return features

# Update FEATURE_COLS list
FEATURE_COLS = [
    # ... existing 30 features ...
    # Add these 5:
    'News_Sentiment',
    'News_Volume',
    'Sentiment_Momentum',
    'News_Volatility',
    'Sentiment_Direction_Align'
]
# Total: 35 features
'''


# =============================================================================
# STEP 2: Add to main.py (live predictions)
# =============================================================================

MAIN_PY_ADDITIONS = '''
# Add to imports at top of main.py
from news_sentiment import get_live_sentiment, get_sentiment_alignment

# Modify extract_features() function in main.py
def extract_features(data: dict) -> dict:
    """Extract features from webhook signal data"""

    # ... existing feature extraction code ...

    # ADD: Get live sentiment
    instrument = data.get('instrument', 'MNQ')
    direction = data.get('direction', 'LONG')

    try:
        sentiment = get_live_sentiment(instrument)

        features['News_Sentiment'] = sentiment.get('News_Sentiment', 0.5)
        features['News_Volume'] = sentiment.get('News_Volume', 0.5)
        features['Sentiment_Momentum'] = sentiment.get('Sentiment_Momentum', 0.5)
        features['News_Volatility'] = sentiment.get('News_Volatility', 0.5)
        features['Sentiment_Direction_Align'] = get_sentiment_alignment(instrument, direction)

    except Exception as e:
        print(f"Sentiment fetch error: {e}")
        # Fall back to neutral
        features['News_Sentiment'] = 0.5
        features['News_Volume'] = 0.5
        features['Sentiment_Momentum'] = 0.5
        features['News_Volatility'] = 0.5
        features['Sentiment_Direction_Align'] = 0.6

    return features
'''


# =============================================================================
# STEP 3: Add feedparser to requirements.txt
# =============================================================================

REQUIREMENTS_ADDITIONS = '''
# Add to requirements.txt:
feedparser>=6.0.0
'''


# =============================================================================
# STEP 4: Weighting approach (if edge is small)
# =============================================================================

WEIGHTING_APPROACH = '''
If sentiment shows weak edge (1-2%), you can reduce its influence:

Option A: Direct weighting in feature engineering
    # Instead of raw sentiment, multiply by weight
    SENTIMENT_WEIGHT = 0.08  # 8% weight

    features['News_Sentiment'] = 0.5 + (raw_sentiment - 0.5) * SENTIMENT_WEIGHT
    features['Sentiment_Direction_Align'] = 0.5 + (raw_align - 0.5) * SENTIMENT_WEIGHT

Option B: Keep features at full value, rely on model to learn weights
    # The GradientBoosting model will naturally learn feature importance
    # If sentiment doesn't add edge, it gets low importance

Option C: Use sentiment as tie-breaker only
    # Only consider sentiment when ML confidence is borderline (55-65%)
    if 0.55 <= confidence <= 0.65:
        if sentiment_align > 0.7:
            confidence += 0.02  # Small boost
        elif sentiment_align < 0.4:
            confidence -= 0.02  # Small penalty
'''


def print_integration_guide():
    """Print full integration guide"""
    print("="*70)
    print("NEWS SENTIMENT ML INTEGRATION GUIDE")
    print("="*70)

    print("\n" + "-"*70)
    print("PREREQUISITE: Run edge analysis first!")
    print("-"*70)
    print("""
    cd /Users/ethanhartwell/proptrading-tracker/klbs-backtest
    python -m news_sentiment.analyze_sentiment_edge --synthetic

    Only proceed if recommendation says "Add to model: True"
    """)

    print("\n" + "-"*70)
    print("STEP 1: Add to train_model.py")
    print("-"*70)
    print(TRAIN_MODEL_ADDITIONS)

    print("\n" + "-"*70)
    print("STEP 2: Add to main.py (ML API)")
    print("-"*70)
    print(MAIN_PY_ADDITIONS)

    print("\n" + "-"*70)
    print("STEP 3: Update requirements.txt")
    print("-"*70)
    print(REQUIREMENTS_ADDITIONS)

    print("\n" + "-"*70)
    print("STEP 4: Weighting approach")
    print("-"*70)
    print(WEIGHTING_APPROACH)

    print("\n" + "-"*70)
    print("STEP 5: Retrain model")
    print("-"*70)
    print("""
    cd /Users/ethanhartwell/proptrading-tracker/klbs-backtest/ml-api-deploy
    python train_model.py

    # Compare new model performance vs old
    # If improvement, deploy:
    railway up
    """)


if __name__ == "__main__":
    print_integration_guide()
