"""
Live RSS News Feed for Production ML Model
Fetches real-time news sentiment from free RSS feeds

Sources (all FREE):
1. Google News RSS - Comprehensive, real-time
2. Yahoo Finance RSS - Financial focus
3. Reuters RSS - Quality financial news

Usage:
    fetcher = LiveNewsFetcher()
    sentiment = fetcher.get_current_sentiment('MNQ')
    # Returns: {'sentiment': 0.65, 'volume': 12, 'momentum': 0.55, ...}
"""

import feedparser
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import re
import statistics

# Simple sentiment scoring using financial keyword lists
POSITIVE_WORDS = {
    'rally', 'surge', 'gain', 'gains', 'rise', 'rises', 'rising', 'higher',
    'bullish', 'optimism', 'optimistic', 'growth', 'profit', 'profits',
    'beat', 'beats', 'exceeds', 'strong', 'strength', 'recovery', 'rebound',
    'outperform', 'upgrade', 'upgraded', 'buy', 'buying', 'upside', 'boom',
    'record', 'high', 'highs', 'positive', 'boost', 'soar', 'soaring', 'jump'
}

NEGATIVE_WORDS = {
    'fall', 'falls', 'falling', 'drop', 'drops', 'decline', 'declines',
    'bearish', 'pessimism', 'pessimistic', 'loss', 'losses', 'miss',
    'weak', 'weakness', 'recession', 'crash', 'plunge', 'slump', 'selloff',
    'downgrade', 'downgraded', 'sell', 'selling', 'downside', 'fear',
    'low', 'lows', 'negative', 'concern', 'risk', 'warning', 'crisis'
}

# RSS Feed URLs for each instrument
INSTRUMENT_FEEDS = {
    'MGC': {
        'name': 'Micro Gold',
        'feeds': [
            'https://news.google.com/rss/search?q=gold+price+futures&hl=en-US&gl=US&ceid=US:en',
            'https://news.google.com/rss/search?q=gold+market+federal+reserve&hl=en-US&gl=US&ceid=US:en',
        ],
        'keywords': ['gold', 'precious metal', 'bullion', 'fed', 'inflation']
    },
    'MNQ': {
        'name': 'Micro Nasdaq',
        'feeds': [
            'https://news.google.com/rss/search?q=nasdaq+tech+stocks&hl=en-US&gl=US&ceid=US:en',
            'https://news.google.com/rss/search?q=technology+sector+market&hl=en-US&gl=US&ceid=US:en',
        ],
        'keywords': ['nasdaq', 'tech', 'technology', 'nvda', 'aapl', 'msft', 'semiconductor']
    },
    'MES': {
        'name': 'Micro S&P',
        'feeds': [
            'https://news.google.com/rss/search?q=S%26P+500+stock+market&hl=en-US&gl=US&ceid=US:en',
            'https://news.google.com/rss/search?q=wall+street+equities&hl=en-US&gl=US&ceid=US:en',
        ],
        'keywords': ['s&p', 'market', 'stocks', 'equities', 'wall street', 'dow']
    }
}


class LiveNewsFetcher:
    """
    Fetches and scores live news sentiment from RSS feeds
    """

    def __init__(self, lookback_hours: int = 4):
        self.lookback_hours = lookback_hours
        self._cache: Dict[str, dict] = {}
        self._cache_time: Dict[str, datetime] = {}
        self._cache_ttl = timedelta(minutes=15)  # Cache for 15 min

    def fetch_rss(self, url: str, max_articles: int = 50) -> List[dict]:
        """
        Fetch articles from RSS feed

        Returns list of dicts with title, summary, published, link
        """
        try:
            feed = feedparser.parse(url)

            articles = []
            cutoff = datetime.utcnow() - timedelta(hours=self.lookback_hours)

            for entry in feed.entries[:max_articles]:
                # Parse published date
                pub_time = None
                if hasattr(entry, 'published_parsed') and entry.published_parsed:
                    pub_time = datetime(*entry.published_parsed[:6])
                elif hasattr(entry, 'updated_parsed') and entry.updated_parsed:
                    pub_time = datetime(*entry.updated_parsed[:6])
                else:
                    pub_time = datetime.utcnow()  # Assume recent

                # Filter by time
                if pub_time < cutoff:
                    continue

                articles.append({
                    'title': entry.get('title', ''),
                    'summary': entry.get('summary', entry.get('description', '')),
                    'published': pub_time,
                    'link': entry.get('link', '')
                })

            return articles

        except Exception as e:
            print(f"RSS fetch error: {e}")
            return []

    def score_text(self, text: str) -> float:
        """
        Score text sentiment using keyword analysis

        Returns: -1.0 (very negative) to +1.0 (very positive)
        """
        text_lower = text.lower()
        words = re.findall(r'\b\w+\b', text_lower)

        pos_count = sum(1 for w in words if w in POSITIVE_WORDS)
        neg_count = sum(1 for w in words if w in NEGATIVE_WORDS)

        total = pos_count + neg_count
        if total == 0:
            return 0.0

        # Score from -1 to +1
        score = (pos_count - neg_count) / total
        return score

    def get_articles(self, instrument: str) -> List[dict]:
        """
        Get all recent articles for an instrument
        """
        if instrument not in INSTRUMENT_FEEDS:
            return []

        config = INSTRUMENT_FEEDS[instrument]
        all_articles = []

        for feed_url in config['feeds']:
            articles = self.fetch_rss(feed_url)
            all_articles.extend(articles)

        # Filter by relevance using keywords
        keywords = config['keywords']
        relevant = []
        for article in all_articles:
            text = f"{article['title']} {article['summary']}".lower()
            if any(kw in text for kw in keywords):
                # Score the article
                article['sentiment'] = self.score_text(text)
                relevant.append(article)

        # Sort by time
        relevant.sort(key=lambda x: x['published'], reverse=True)

        return relevant

    def get_current_sentiment(self, instrument: str) -> Dict[str, float]:
        """
        Get current sentiment features for an instrument

        Returns dict with ML-ready features:
        - News_Sentiment: 0-1 normalized sentiment
        - News_Volume: 0-1 normalized article count
        - Sentiment_Momentum: 0-1 sentiment change
        - News_Volatility: 0-1 sentiment variance
        """
        # Check cache
        cache_key = instrument
        if cache_key in self._cache:
            if datetime.utcnow() - self._cache_time[cache_key] < self._cache_ttl:
                return self._cache[cache_key]

        articles = self.get_articles(instrument)

        if not articles:
            # No news = neutral
            result = {
                'News_Sentiment': 0.5,
                'News_Volume': 0.0,
                'Sentiment_Momentum': 0.5,
                'News_Volatility': 0.0,
                'article_count': 0,
                'latest_headline': None
            }
            self._cache[cache_key] = result
            self._cache_time[cache_key] = datetime.utcnow()
            return result

        # Calculate sentiment stats
        sentiments = [a['sentiment'] for a in articles]

        # Average sentiment (map -1,+1 to 0,1)
        avg_sentiment = statistics.mean(sentiments)
        news_sentiment = (avg_sentiment + 1) / 2  # Map to 0-1

        # Volume (normalize by expected articles, ~20 per 4 hours)
        volume = min(1.0, len(articles) / 20)

        # Momentum: compare recent (last 1hr) vs older
        now = datetime.utcnow()
        recent_cutoff = now - timedelta(hours=1)

        recent = [a['sentiment'] for a in articles if a['published'] > recent_cutoff]
        older = [a['sentiment'] for a in articles if a['published'] <= recent_cutoff]

        if recent and older:
            recent_avg = statistics.mean(recent)
            older_avg = statistics.mean(older)
            momentum = (recent_avg - older_avg + 1) / 2  # Map to 0-1
        else:
            momentum = 0.5  # Neutral

        # Volatility: std dev of sentiments
        if len(sentiments) > 1:
            vol = statistics.stdev(sentiments)
            volatility = min(1.0, vol / 0.5)  # Normalize
        else:
            volatility = 0.0

        result = {
            'News_Sentiment': round(news_sentiment, 3),
            'News_Volume': round(volume, 3),
            'Sentiment_Momentum': round(momentum, 3),
            'News_Volatility': round(volatility, 3),
            'article_count': len(articles),
            'latest_headline': articles[0]['title'] if articles else None,
            'raw_sentiment': round(avg_sentiment, 3)  # For debugging
        }

        # Cache result
        self._cache[cache_key] = result
        self._cache_time[cache_key] = datetime.utcnow()

        return result

    def get_direction_aligned_score(
        self,
        instrument: str,
        direction: str
    ) -> float:
        """
        Get direction-aware sentiment alignment score (0-1)

        Use this directly in ML model:
        - High score (>0.7) = sentiment aligns with direction
        - Low score (<0.4) = sentiment against direction
        """
        sentiment = self.get_current_sentiment(instrument)

        sent = sentiment['News_Sentiment']
        mom = sentiment['Sentiment_Momentum']

        if direction == 'LONG':
            # Positive sentiment helps longs
            if sent > 0.65:
                align = 0.9
            elif sent > 0.55:
                align = 0.75
            elif sent < 0.35:
                align = 0.4
            else:
                align = 0.6

            # Rising momentum helps
            if mom > 0.6:
                align = min(1.0, align + 0.1)
            elif mom < 0.4:
                align = max(0.3, align - 0.1)

        else:  # SHORT
            # Negative sentiment helps shorts
            if sent < 0.35:
                align = 0.9
            elif sent < 0.45:
                align = 0.75
            elif sent > 0.65:
                align = 0.4
            else:
                align = 0.6

            # Falling momentum helps
            if mom < 0.4:
                align = min(1.0, align + 0.1)
            elif mom > 0.6:
                align = max(0.3, align - 0.1)

        return round(align, 3)


# Singleton for use in ML API
_fetcher_instance: Optional[LiveNewsFetcher] = None


def get_live_sentiment(instrument: str) -> Dict[str, float]:
    """
    Convenience function to get current sentiment

    Usage in ML API:
        from news_sentiment.live_rss_feed import get_live_sentiment
        sentiment = get_live_sentiment('MNQ')
    """
    global _fetcher_instance
    if _fetcher_instance is None:
        _fetcher_instance = LiveNewsFetcher()

    return _fetcher_instance.get_current_sentiment(instrument)


def get_sentiment_alignment(instrument: str, direction: str) -> float:
    """
    Convenience function to get direction-aligned sentiment score

    Usage in ML API:
        from news_sentiment.live_rss_feed import get_sentiment_alignment
        align_score = get_sentiment_alignment('MNQ', 'LONG')
    """
    global _fetcher_instance
    if _fetcher_instance is None:
        _fetcher_instance = LiveNewsFetcher()

    return _fetcher_instance.get_direction_aligned_score(instrument, direction)


if __name__ == "__main__":
    # Test live feeds
    fetcher = LiveNewsFetcher()

    for instrument in ['MGC', 'MNQ', 'MES']:
        print(f"\n{'='*50}")
        print(f"{instrument} - {INSTRUMENT_FEEDS[instrument]['name']}")
        print(f"{'='*50}")

        # Get current sentiment
        sentiment = fetcher.get_current_sentiment(instrument)

        print(f"\nCurrent Sentiment:")
        print(f"  News_Sentiment: {sentiment['News_Sentiment']:.2f}")
        print(f"  News_Volume: {sentiment['News_Volume']:.2f}")
        print(f"  Sentiment_Momentum: {sentiment['Sentiment_Momentum']:.2f}")
        print(f"  News_Volatility: {sentiment['News_Volatility']:.2f}")
        print(f"  Articles found: {sentiment['article_count']}")
        if sentiment['latest_headline']:
            print(f"  Latest: {sentiment['latest_headline'][:80]}...")

        # Test direction alignment
        long_align = fetcher.get_direction_aligned_score(instrument, 'LONG')
        short_align = fetcher.get_direction_aligned_score(instrument, 'SHORT')

        print(f"\nDirection Alignment:")
        print(f"  LONG alignment: {long_align:.2f}")
        print(f"  SHORT alignment: {short_align:.2f}")
