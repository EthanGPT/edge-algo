"""
News Sentiment Feature Engineering for ML Model
Creates direction-aware sentiment features matching your existing feature style

Features Created:
1. News_Sentiment (1): Rolling 4-hour average sentiment, normalized 0-1
2. News_Volume (1): Rolling article count, normalized 0-1
3. Sentiment_Momentum (1): Rate of change in sentiment
4. Sentiment_Direction_Align (1): Does sentiment match trade direction?
5. News_Volatility (1): Sentiment variance (conflicting news = uncertainty)

Total: 5 new features to add to existing 30
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, Tuple


class SentimentFeatureEngineering:
    """
    Creates ML-ready sentiment features from raw news sentiment data
    Matches your existing direction-aware feature engineering style
    """

    def __init__(self, sentiment_data_dir: str = None):
        self.data_dir = Path(sentiment_data_dir) if sentiment_data_dir else Path(__file__).parent / "data"

    def load_sentiment(self, instrument: str) -> pd.DataFrame:
        """Load sentiment CSV for an instrument"""
        path = self.data_dir / f"{instrument}_sentiment.csv"

        if not path.exists():
            print(f"Sentiment data not found: {path}")
            return pd.DataFrame()

        df = pd.read_csv(path, parse_dates=['timestamp'])
        df = df.set_index('timestamp').sort_index()
        return df

    def create_features(
        self,
        sentiment_df: pd.DataFrame,
        lookback_hours: int = 4
    ) -> pd.DataFrame:
        """
        Create ML features from raw sentiment data

        Args:
            sentiment_df: DataFrame with timestamp index, sentiment, volume columns
            lookback_hours: How far back to look for rolling calculations

        Returns:
            DataFrame with engineered features
        """
        if sentiment_df.empty:
            return pd.DataFrame()

        df = sentiment_df.copy()

        # Ensure hourly frequency for consistent rolling
        df = df.resample('h').agg({
            'sentiment': 'mean',
            'volume': 'sum'
        }).ffill()

        # 1. Rolling Sentiment (normalized 0-1)
        # GDELT tone typically -5 to +5, normalize to 0-1
        df['sentiment_raw'] = df['sentiment'].rolling(
            lookback_hours, min_periods=1
        ).mean()
        df['News_Sentiment'] = (df['sentiment_raw'] + 5) / 10  # Map -5,+5 to 0,1
        df['News_Sentiment'] = df['News_Sentiment'].clip(0, 1)

        # 2. Rolling Volume (normalized by percentile)
        df['volume_raw'] = df['volume'].rolling(
            lookback_hours, min_periods=1
        ).sum()
        vol_99 = df['volume_raw'].quantile(0.99)
        df['News_Volume'] = (df['volume_raw'] / vol_99).clip(0, 1)

        # 3. Sentiment Momentum (change in sentiment)
        # Positive = sentiment improving, Negative = sentiment declining
        df['sentiment_change'] = df['sentiment_raw'].diff(lookback_hours)
        # Normalize to 0-1 (0.5 = no change)
        df['Sentiment_Momentum'] = 0.5 + (df['sentiment_change'] / 10).clip(-0.5, 0.5)

        # 4. News Volatility (conflicting sentiment = uncertainty)
        df['sentiment_std'] = df['sentiment'].rolling(
            lookback_hours * 2, min_periods=1
        ).std()
        std_99 = df['sentiment_std'].quantile(0.99)
        df['News_Volatility'] = (df['sentiment_std'] / std_99).clip(0, 1)

        # Clean up
        feature_cols = [
            'News_Sentiment', 'News_Volume',
            'Sentiment_Momentum', 'News_Volatility'
        ]
        return df[feature_cols].fillna(0.5)  # 0.5 = neutral for missing

    def create_direction_aligned_features(
        self,
        features_df: pd.DataFrame,
        direction: str
    ) -> Dict[str, float]:
        """
        Create direction-aware feature at a specific timestamp

        For LONG trades:
        - Positive sentiment (>0.6) is bullish = 0.9
        - Negative sentiment (<0.4) is bearish = 0.4
        - Rising momentum helps = 0.8

        For SHORT trades:
        - Negative sentiment (<0.4) is bearish = 0.9
        - Positive sentiment (>0.6) is bullish risk = 0.4
        - Falling momentum helps = 0.8
        """
        sent = features_df['News_Sentiment']
        mom = features_df['Sentiment_Momentum']
        vol = features_df['News_Volume']
        volatility = features_df['News_Volatility']

        if direction == 'LONG':
            # Positive sentiment helps longs
            if sent > 0.65:
                sent_align = 0.9
            elif sent > 0.55:
                sent_align = 0.75
            elif sent < 0.35:
                sent_align = 0.4  # Negative sentiment hurts longs
            else:
                sent_align = 0.6  # Neutral

            # Rising momentum helps longs
            if mom > 0.6:
                mom_align = 0.85
            elif mom < 0.4:
                mom_align = 0.5
            else:
                mom_align = 0.65

        else:  # SHORT
            # Negative sentiment helps shorts
            if sent < 0.35:
                sent_align = 0.9
            elif sent < 0.45:
                sent_align = 0.75
            elif sent > 0.65:
                sent_align = 0.4  # Positive sentiment hurts shorts
            else:
                sent_align = 0.6  # Neutral

            # Falling momentum helps shorts
            if mom < 0.4:
                mom_align = 0.85
            elif mom > 0.6:
                mom_align = 0.5
            else:
                mom_align = 0.65

        # High volume during aligned sentiment = stronger signal
        volume_boost = 0.05 if vol > 0.7 and sent_align > 0.7 else 0

        # High volatility = uncertainty = reduce confidence
        vol_penalty = 0.1 if volatility > 0.7 else 0

        return {
            'News_Sentiment': sent,
            'News_Volume': vol,
            'Sentiment_Momentum': mom,
            'News_Volatility': volatility,
            'Sentiment_Direction_Align': min(1.0, sent_align + volume_boost - vol_penalty)
        }


def join_sentiment_to_trades(
    trades_df: pd.DataFrame,
    sentiment_features_df: pd.DataFrame,
    time_col: str = 'date'
) -> pd.DataFrame:
    """
    Join sentiment features to trade data

    Uses asof merge to get most recent sentiment before each trade

    Args:
        trades_df: Your backtest trade data (klbs_MNQ_trades.csv etc)
        sentiment_features_df: Processed sentiment features
        time_col: Column name for trade timestamp

    Returns:
        trades_df with sentiment features added
    """
    trades = trades_df.copy()
    sentiment = sentiment_features_df.copy()

    # Ensure datetime types (handle timezone-aware dates)
    trades[time_col] = pd.to_datetime(trades[time_col], utc=True)
    trades[time_col] = trades[time_col].dt.tz_localize(None)  # Remove tz for merge
    trades = trades.sort_values(time_col)

    # Reset index for merge
    sentiment = sentiment.reset_index()
    sentiment = sentiment.rename(columns={'index': 'timestamp'})
    sentiment['timestamp'] = pd.to_datetime(sentiment['timestamp'])
    # Remove timezone if present
    if sentiment['timestamp'].dt.tz is not None:
        sentiment['timestamp'] = sentiment['timestamp'].dt.tz_localize(None)
    sentiment = sentiment.sort_values('timestamp')

    # Merge: get most recent sentiment before each trade
    result = pd.merge_asof(
        trades,
        sentiment,
        left_on=time_col,
        right_on='timestamp',
        direction='backward'  # Get most recent sentiment
    )

    # Fill any missing with neutral values
    feature_cols = [
        'News_Sentiment', 'News_Volume',
        'Sentiment_Momentum', 'News_Volatility'
    ]
    for col in feature_cols:
        if col in result.columns:
            result[col] = result[col].fillna(0.5)

    return result


def add_direction_alignment(trades_df: pd.DataFrame) -> pd.DataFrame:
    """
    Add direction-aware sentiment alignment feature

    This is calculated per-trade based on direction
    """
    df = trades_df.copy()

    def calc_align(row):
        eng = SentimentFeatureEngineering()
        features = {
            'News_Sentiment': row.get('News_Sentiment', 0.5),
            'News_Volume': row.get('News_Volume', 0.5),
            'Sentiment_Momentum': row.get('Sentiment_Momentum', 0.5),
            'News_Volatility': row.get('News_Volatility', 0.5)
        }
        result = eng.create_direction_aligned_features(
            pd.Series(features),
            row['direction']
        )
        return result['Sentiment_Direction_Align']

    df['Sentiment_Direction_Align'] = df.apply(calc_align, axis=1)
    return df


if __name__ == "__main__":
    # Example: Process sentiment and analyze
    eng = SentimentFeatureEngineering()

    for instrument in ['MGC', 'MNQ', 'MES']:
        print(f"\n{'='*50}")
        print(f"Processing {instrument}")
        print(f"{'='*50}")

        # Load raw sentiment
        raw = eng.load_sentiment(instrument)
        if raw.empty:
            print(f"No sentiment data for {instrument}")
            continue

        # Create features
        features = eng.create_features(raw)

        print(f"Sentiment range: {features['News_Sentiment'].min():.2f} to {features['News_Sentiment'].max():.2f}")
        print(f"Mean sentiment: {features['News_Sentiment'].mean():.2f}")
        print(f"Volume range: {features['News_Volume'].min():.2f} to {features['News_Volume'].max():.2f}")

        # Save processed features
        output_path = eng.data_dir / f"{instrument}_sentiment_features.csv"
        features.to_csv(output_path)
        print(f"Saved features to {output_path}")
