"""
Sentiment Edge Analysis
Determines if news sentiment provides trading edge for KLBS

This script:
1. Loads/generates sentiment data
2. Joins to backtest trades
3. Calculates win rate by sentiment buckets
4. Reports if sentiment should be added to ML model

Run this BEFORE adding sentiment to production ML!
"""

import pandas as pd
import numpy as np
from pathlib import Path
import sys

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from news_sentiment.gdelt_fetcher import GDELTFetcher, create_synthetic_historical_sentiment
from news_sentiment.sentiment_features import (
    SentimentFeatureEngineering,
    join_sentiment_to_trades,
    add_direction_alignment
)


class SentimentEdgeAnalyzer:
    """
    Analyzes whether news sentiment provides trading edge
    """

    def __init__(self, data_dir: str = None):
        self.data_dir = Path(data_dir) if data_dir else Path(__file__).parent.parent
        self.outputs_dir = self.data_dir / "outputs"
        self.sentiment_dir = Path(__file__).parent / "data"
        self.ohlc_dir = self.data_dir / "data"

        # Ensure directories exist
        self.sentiment_dir.mkdir(parents=True, exist_ok=True)

    def load_trades(self, instrument: str) -> pd.DataFrame:
        """Load backtest trade data"""
        path = self.outputs_dir / f"klbs_{instrument}_trades.csv"
        if not path.exists():
            print(f"Trade data not found: {path}")
            return pd.DataFrame()

        df = pd.read_csv(path, parse_dates=['date'])
        print(f"Loaded {len(df)} {instrument} trades")
        return df

    def get_or_create_sentiment(
        self,
        instrument: str,
        start_date: str,
        end_date: str,
        use_synthetic: bool = False
    ) -> pd.DataFrame:
        """
        Get sentiment data - fetch from GDELT or create synthetic

        Args:
            instrument: MGC, MNQ, MES
            start_date: YYYY-MM-DD
            end_date: YYYY-MM-DD
            use_synthetic: If True, skip GDELT and use price-based synthetic

        Returns:
            DataFrame with sentiment features
        """
        feature_path = self.sentiment_dir / f"{instrument}_sentiment_features.csv"

        # Check if we already have processed features
        if feature_path.exists():
            print(f"Loading existing sentiment features: {feature_path}")
            df = pd.read_csv(feature_path, parse_dates=['timestamp'], index_col='timestamp')
            return df

        # Check for raw sentiment
        raw_path = self.sentiment_dir / f"{instrument}_sentiment.csv"

        if raw_path.exists():
            print(f"Processing existing raw sentiment: {raw_path}")
        elif use_synthetic:
            print(f"Creating synthetic sentiment from price data...")
            ohlc_path = self.ohlc_dir / f"{instrument}_combined_15m.csv"
            if not ohlc_path.exists():
                ohlc_path = self.ohlc_dir / f"{instrument.replace('M', '')}_15m.csv"

            if ohlc_path.exists():
                create_synthetic_historical_sentiment(str(ohlc_path), str(raw_path))
            else:
                print(f"No OHLC data found for synthetic sentiment")
                return pd.DataFrame()
        else:
            print(f"Fetching GDELT sentiment for {instrument}...")
            fetcher = GDELTFetcher(output_dir=str(self.sentiment_dir))
            fetcher.fetch_sentiment(instrument, start_date, end_date)

        # Now process into features
        eng = SentimentFeatureEngineering(str(self.sentiment_dir))
        raw = eng.load_sentiment(instrument)

        if raw.empty:
            print(f"Failed to load/create sentiment for {instrument}")
            return pd.DataFrame()

        features = eng.create_features(raw)
        features.to_csv(feature_path)

        return features

    def analyze_edge(
        self,
        trades_df: pd.DataFrame,
        sentiment_df: pd.DataFrame
    ) -> dict:
        """
        Analyze win rate by sentiment buckets

        Returns dict with edge analysis results
        """
        if trades_df.empty or sentiment_df.empty:
            return {'error': 'Missing data'}

        # Join sentiment to trades
        merged = join_sentiment_to_trades(trades_df, sentiment_df)
        merged = add_direction_alignment(merged)

        # Filter to only trades with sentiment data
        has_sentiment = merged['News_Sentiment'].notna()
        merged = merged[has_sentiment]

        if len(merged) < 100:
            return {'error': f'Only {len(merged)} trades with sentiment - need more data'}

        # Overall baseline
        total = len(merged)
        wins = (merged['outcome'] == 'WIN').sum()
        baseline_wr = wins / total * 100

        results = {
            'total_trades': total,
            'baseline_win_rate': baseline_wr,
            'sentiment_buckets': {},
            'direction_align_buckets': {},
            'combined_buckets': {}
        }

        # Analyze by News_Sentiment buckets
        merged['sent_bucket'] = pd.cut(
            merged['News_Sentiment'],
            bins=[0, 0.35, 0.45, 0.55, 0.65, 1.0],
            labels=['Very_Neg', 'Negative', 'Neutral', 'Positive', 'Very_Pos']
        )

        for bucket in merged['sent_bucket'].unique():
            subset = merged[merged['sent_bucket'] == bucket]
            if len(subset) >= 20:
                wr = (subset['outcome'] == 'WIN').sum() / len(subset) * 100
                results['sentiment_buckets'][str(bucket)] = {
                    'count': len(subset),
                    'win_rate': round(wr, 1),
                    'edge': round(wr - baseline_wr, 1)
                }

        # Analyze by Sentiment_Direction_Align
        merged['align_bucket'] = pd.cut(
            merged['Sentiment_Direction_Align'],
            bins=[0, 0.5, 0.7, 0.85, 1.0],
            labels=['Misaligned', 'Weak', 'Good', 'Strong']
        )

        for bucket in merged['align_bucket'].unique():
            subset = merged[merged['align_bucket'] == bucket]
            if len(subset) >= 20:
                wr = (subset['outcome'] == 'WIN').sum() / len(subset) * 100
                results['direction_align_buckets'][str(bucket)] = {
                    'count': len(subset),
                    'win_rate': round(wr, 1),
                    'edge': round(wr - baseline_wr, 1)
                }

        # Combined: LONG with positive sentiment vs SHORT with negative
        long_pos = merged[(merged['direction'] == 'LONG') & (merged['News_Sentiment'] > 0.6)]
        long_neg = merged[(merged['direction'] == 'LONG') & (merged['News_Sentiment'] < 0.4)]
        short_neg = merged[(merged['direction'] == 'SHORT') & (merged['News_Sentiment'] < 0.4)]
        short_pos = merged[(merged['direction'] == 'SHORT') & (merged['News_Sentiment'] > 0.6)]

        for name, subset in [
            ('LONG_pos_sentiment', long_pos),
            ('LONG_neg_sentiment', long_neg),
            ('SHORT_neg_sentiment', short_neg),
            ('SHORT_pos_sentiment', short_pos)
        ]:
            if len(subset) >= 20:
                wr = (subset['outcome'] == 'WIN').sum() / len(subset) * 100
                results['combined_buckets'][name] = {
                    'count': len(subset),
                    'win_rate': round(wr, 1),
                    'edge': round(wr - baseline_wr, 1)
                }

        # Calculate recommended weighting
        results['recommendation'] = self._calculate_recommendation(results)

        return results

    def _calculate_recommendation(self, results: dict) -> dict:
        """
        Determine if sentiment should be added and with what weight
        """
        # Check if direction alignment shows edge
        align_buckets = results.get('direction_align_buckets', {})

        strong_wr = align_buckets.get('Strong', {}).get('win_rate', 0)
        strong_edge = align_buckets.get('Strong', {}).get('edge', 0)
        misaligned_wr = align_buckets.get('Misaligned', {}).get('win_rate', 0)

        # Check combined direction + sentiment
        combined = results.get('combined_buckets', {})
        aligned_trades = (
            combined.get('LONG_pos_sentiment', {}).get('edge', 0) +
            combined.get('SHORT_neg_sentiment', {}).get('edge', 0)
        ) / 2

        contra_trades = (
            combined.get('LONG_neg_sentiment', {}).get('edge', 0) +
            combined.get('SHORT_pos_sentiment', {}).get('edge', 0)
        ) / 2

        spread = aligned_trades - contra_trades

        recommendation = {
            'add_to_model': False,
            'suggested_weight': 0,
            'confidence': 'low',
            'reasoning': ''
        }

        if strong_edge > 3.0 and spread > 2.0:
            # Strong edge found
            recommendation['add_to_model'] = True
            recommendation['suggested_weight'] = 0.15  # 15% weight
            recommendation['confidence'] = 'high'
            recommendation['reasoning'] = (
                f"Strong alignment shows +{strong_edge:.1f}% edge. "
                f"Direction-aligned sentiment vs contra spread: {spread:.1f}%"
            )
        elif strong_edge > 1.5 or spread > 1.0:
            # Moderate edge
            recommendation['add_to_model'] = True
            recommendation['suggested_weight'] = 0.08  # 8% weight
            recommendation['confidence'] = 'medium'
            recommendation['reasoning'] = (
                f"Moderate edge detected. Strong alignment: +{strong_edge:.1f}%. "
                f"Aligned vs contra spread: {spread:.1f}%"
            )
        elif strong_edge > 0 or spread > 0:
            # Weak edge
            recommendation['add_to_model'] = True
            recommendation['suggested_weight'] = 0.05  # 5% weight
            recommendation['confidence'] = 'low'
            recommendation['reasoning'] = (
                f"Weak but positive edge. Consider small weight. "
                f"Strong alignment: +{strong_edge:.1f}%, spread: {spread:.1f}%"
            )
        else:
            # No edge or negative
            recommendation['add_to_model'] = False
            recommendation['suggested_weight'] = 0
            recommendation['confidence'] = 'high'
            recommendation['reasoning'] = (
                f"No edge found from sentiment. "
                f"Aligned edge: {strong_edge:.1f}%, spread: {spread:.1f}%"
            )

        return recommendation


def run_full_analysis(use_synthetic: bool = True):
    """
    Run complete sentiment edge analysis for all instruments
    """
    analyzer = SentimentEdgeAnalyzer()

    print("\n" + "="*70)
    print("NEWS SENTIMENT EDGE ANALYSIS")
    print("="*70)

    all_results = {}

    for instrument in ['MNQ', 'MES', 'MGC']:
        print(f"\n{'='*50}")
        print(f"Analyzing {instrument}")
        print(f"{'='*50}")

        # Load trades
        trades = analyzer.load_trades(instrument)
        if trades.empty:
            print(f"No trade data for {instrument}")
            continue

        # Get date range from trades
        start_date = trades['date'].min().strftime("%Y-%m-%d")
        end_date = trades['date'].max().strftime("%Y-%m-%d")

        # Get/create sentiment
        sentiment = analyzer.get_or_create_sentiment(
            instrument, start_date, end_date,
            use_synthetic=use_synthetic
        )

        if sentiment.empty:
            print(f"No sentiment data for {instrument}")
            continue

        # Analyze edge
        results = analyzer.analyze_edge(trades, sentiment)
        all_results[instrument] = results

        # Print results
        print(f"\nBaseline Win Rate: {results['baseline_win_rate']:.1f}%")
        print(f"Trades with Sentiment: {results['total_trades']}")

        print("\nBy Sentiment Level:")
        for bucket, data in sorted(results['sentiment_buckets'].items()):
            edge_str = f"+{data['edge']}" if data['edge'] > 0 else str(data['edge'])
            print(f"  {bucket}: {data['win_rate']:.1f}% ({edge_str}%) n={data['count']}")

        print("\nBy Direction Alignment:")
        for bucket, data in sorted(results['direction_align_buckets'].items()):
            edge_str = f"+{data['edge']}" if data['edge'] > 0 else str(data['edge'])
            print(f"  {bucket}: {data['win_rate']:.1f}% ({edge_str}%) n={data['count']}")

        print("\nCombined Direction + Sentiment:")
        for name, data in results['combined_buckets'].items():
            edge_str = f"+{data['edge']}" if data['edge'] > 0 else str(data['edge'])
            print(f"  {name}: {data['win_rate']:.1f}% ({edge_str}%) n={data['count']}")

        rec = results['recommendation']
        print(f"\n>>> RECOMMENDATION:")
        print(f"    Add to model: {rec['add_to_model']}")
        print(f"    Suggested weight: {rec['suggested_weight']*100:.0f}%")
        print(f"    Confidence: {rec['confidence']}")
        print(f"    Reasoning: {rec['reasoning']}")

    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)

    should_add = []
    for inst, res in all_results.items():
        rec = res.get('recommendation', {})
        if rec.get('add_to_model'):
            should_add.append({
                'instrument': inst,
                'weight': rec['suggested_weight'],
                'confidence': rec['confidence']
            })

    if should_add:
        print("\nSentiment SHOULD be added to ML model:")
        for item in should_add:
            print(f"  {item['instrument']}: {item['weight']*100:.0f}% weight ({item['confidence']} confidence)")
    else:
        print("\nNo significant edge found. DO NOT add sentiment to ML model.")

    return all_results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Analyze sentiment edge')
    parser.add_argument(
        '--synthetic', action='store_true', default=True,
        help='Use synthetic sentiment from price action (default: True)'
    )
    parser.add_argument(
        '--gdelt', action='store_true',
        help='Fetch real sentiment from GDELT (may hit rate limits)'
    )

    args = parser.parse_args()

    use_synthetic = not args.gdelt

    results = run_full_analysis(use_synthetic=use_synthetic)
