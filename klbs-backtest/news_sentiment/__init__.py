"""
News Sentiment Module for KLBS ML Model

Components:
1. gdelt_fetcher.py - Historical sentiment from GDELT (free)
2. sentiment_features.py - Feature engineering for ML
3. live_rss_feed.py - Real-time sentiment from RSS feeds
4. analyze_sentiment_edge.py - Backtesting to validate edge

Usage:
    # Historical backtesting
    python -m news_sentiment.analyze_sentiment_edge --synthetic

    # Live sentiment (for ML API)
    from news_sentiment.live_rss_feed import get_live_sentiment, get_sentiment_alignment
    sentiment = get_live_sentiment('MNQ')
    align = get_sentiment_alignment('MNQ', 'LONG')
"""

from .live_rss_feed import get_live_sentiment, get_sentiment_alignment

__all__ = ['get_live_sentiment', 'get_sentiment_alignment']
