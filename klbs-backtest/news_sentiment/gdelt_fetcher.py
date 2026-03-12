"""
GDELT Historical News Sentiment Fetcher
Fetches historical news sentiment data for MGC, MNQ, MES backtesting
Uses GDELT 2.0 GKG (Global Knowledge Graph) - FREE

GDELT Tone Scale:
- Positive values = positive sentiment (0 to +10)
- Negative values = negative sentiment (-10 to 0)
- Magnitude indicates intensity
"""

import requests
import pandas as pd
from datetime import datetime, timedelta
import time
import os
from pathlib import Path

# Instrument-specific search themes
INSTRUMENT_THEMES = {
    'MGC': {
        'keywords': [
            'gold prices', 'gold futures', 'gold market', 'precious metals',
            'federal reserve gold', 'gold demand', 'gold supply', 'gold mining',
            'inflation gold', 'dollar gold', 'central bank gold'
        ],
        'gdelt_themes': [
            'ECON_GOLD', 'ECON_PRECIOUS_METALS', 'ECON_INFLATION',
            'TAX_FNCACT_GOLD', 'CRISISLEX_C07_SAFETY'
        ]
    },
    'MNQ': {
        'keywords': [
            'nasdaq', 'tech stocks', 'technology sector', 'apple stock',
            'microsoft stock', 'nvidia', 'semiconductor', 'tech earnings',
            'big tech', 'growth stocks', 'tech rally', 'tech selloff'
        ],
        'gdelt_themes': [
            'ECON_STOCKMARKET', 'TECH', 'ECON_EARNINGSREPORT',
            'TAX_FNCACT_TECH', 'ECON_INTEREST_RATE'
        ]
    },
    'MES': {
        'keywords': [
            'S&P 500', 'stock market', 'wall street', 'equity market',
            'dow jones', 'market rally', 'market selloff', 'fed rate',
            'earnings season', 'market volatility', 'bull market', 'bear market'
        ],
        'gdelt_themes': [
            'ECON_STOCKMARKET', 'ECON_INTEREST_RATE', 'ECON_EARNINGSREPORT',
            'ECON_BANKRUPTCY', 'CRISISLEX_CRISISLEXREC'
        ]
    }
}


class GDELTFetcher:
    """
    Fetches historical news sentiment from GDELT 2.0

    GDELT provides:
    - Tone: Average sentiment (-100 to +100, typically -10 to +10)
    - Volume: Article count (proxy for market attention)
    - Themes: Categorized topics
    """

    BASE_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

    def __init__(self, output_dir: str = None):
        self.output_dir = output_dir or Path(__file__).parent / "data"
        os.makedirs(self.output_dir, exist_ok=True)

    def fetch_sentiment(
        self,
        instrument: str,
        start_date: str,
        end_date: str,
        timespan: str = "1h"  # 15min, 1h, 4h, 1d
    ) -> pd.DataFrame:
        """
        Fetch sentiment data for an instrument over a date range.

        Args:
            instrument: MGC, MNQ, or MES
            start_date: YYYY-MM-DD format
            end_date: YYYY-MM-DD format
            timespan: Aggregation period

        Returns:
            DataFrame with timestamp, sentiment, volume columns
        """
        if instrument not in INSTRUMENT_THEMES:
            raise ValueError(f"Unknown instrument: {instrument}")

        themes = INSTRUMENT_THEMES[instrument]
        all_results = []

        # GDELT API has daily limits, chunk by month
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")

        current = start
        while current < end:
            chunk_end = min(current + timedelta(days=30), end)

            print(f"Fetching {instrument} news: {current.date()} to {chunk_end.date()}")

            # Query by keywords
            for keyword in themes['keywords'][:5]:  # Top 5 keywords
                try:
                    result = self._query_gdelt(
                        keyword,
                        current.strftime("%Y%m%d%H%M%S"),
                        chunk_end.strftime("%Y%m%d%H%M%S")
                    )
                    if result:
                        all_results.extend(result)
                    time.sleep(0.5)  # Rate limiting
                except Exception as e:
                    print(f"Error fetching {keyword}: {e}")
                    continue

            current = chunk_end

        if not all_results:
            print(f"No results found for {instrument}")
            return pd.DataFrame()

        # Process and aggregate results
        df = self._process_results(all_results, timespan)
        df['instrument'] = instrument

        return df

    def _query_gdelt(
        self,
        query: str,
        start_datetime: str,
        end_datetime: str
    ) -> list:
        """
        Query GDELT DOC 2.0 API

        Returns list of articles with tone scores
        """
        params = {
            'query': f'"{query}" sourcelang:eng',
            'mode': 'timelinetone',  # Timeline with tone/sentiment
            'startdatetime': start_datetime,
            'enddatetime': end_datetime,
            'format': 'json',
            'maxrecords': 250
        }

        try:
            response = requests.get(self.BASE_URL, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            if 'timeline' in data:
                return data['timeline']
            return []

        except requests.exceptions.RequestException as e:
            print(f"GDELT API error: {e}")
            return []
        except ValueError:
            # JSON decode error - sometimes returns HTML errors
            return []

    def _process_results(self, results: list, timespan: str) -> pd.DataFrame:
        """
        Process raw GDELT results into aggregated sentiment DataFrame
        """
        records = []

        for item in results:
            if 'data' not in item:
                continue

            for entry in item['data']:
                try:
                    # GDELT timeline format: [date, value]
                    date_str = entry.get('date', entry.get('x', ''))
                    tone = entry.get('value', entry.get('y', 0))

                    if date_str:
                        records.append({
                            'timestamp': pd.to_datetime(date_str),
                            'tone': float(tone),
                            'volume': 1  # Count articles
                        })
                except (ValueError, TypeError):
                    continue

        if not records:
            return pd.DataFrame()

        df = pd.DataFrame(records)

        # Aggregate by timespan
        freq_map = {'15min': '15T', '1h': 'H', '4h': '4H', '1d': 'D'}
        freq = freq_map.get(timespan, 'H')

        df = df.set_index('timestamp').resample(freq).agg({
            'tone': 'mean',      # Average sentiment
            'volume': 'sum'      # Article count
        }).reset_index()

        df = df.dropna()
        df = df.rename(columns={'tone': 'sentiment'})

        return df

    def fetch_all_instruments(
        self,
        start_date: str,
        end_date: str,
        save: bool = True
    ) -> dict:
        """
        Fetch sentiment for all instruments and optionally save to CSV
        """
        results = {}

        for instrument in ['MGC', 'MNQ', 'MES']:
            print(f"\n{'='*50}")
            print(f"Fetching {instrument} sentiment data...")
            print(f"{'='*50}")

            df = self.fetch_sentiment(instrument, start_date, end_date)

            if not df.empty:
                results[instrument] = df

                if save:
                    output_path = self.output_dir / f"{instrument}_sentiment.csv"
                    df.to_csv(output_path, index=False)
                    print(f"Saved to {output_path}")
                    print(f"Records: {len(df)}, Date range: {df['timestamp'].min()} to {df['timestamp'].max()}")
            else:
                print(f"No data for {instrument}")

        return results


class AlternativeSentimentFetcher:
    """
    Alternative: Use free financial news APIs when GDELT is insufficient

    Options:
    1. Alpha Vantage News (free tier: 25 requests/day)
    2. Finnhub News (free tier: 60 calls/min)
    3. NewsAPI (free tier: 100 requests/day, 1 month history)
    """

    def __init__(self, api_key: str = None):
        self.api_key = api_key

    def fetch_alpha_vantage_sentiment(
        self,
        tickers: list,
        time_from: str = None
    ) -> pd.DataFrame:
        """
        Alpha Vantage News Sentiment API

        Free tier: 25 requests/day
        Has built-in sentiment scores!
        """
        if not self.api_key:
            print("Alpha Vantage API key required")
            return pd.DataFrame()

        url = "https://www.alphavantage.co/query"
        params = {
            'function': 'NEWS_SENTIMENT',
            'tickers': ','.join(tickers),
            'apikey': self.api_key,
            'limit': 1000
        }

        if time_from:
            params['time_from'] = time_from

        try:
            response = requests.get(url, params=params)
            data = response.json()

            if 'feed' not in data:
                print(f"No news data: {data.get('Note', data.get('Error Message', 'Unknown error'))}")
                return pd.DataFrame()

            records = []
            for article in data['feed']:
                records.append({
                    'timestamp': pd.to_datetime(article['time_published']),
                    'title': article['title'],
                    'sentiment': float(article.get('overall_sentiment_score', 0)),
                    'sentiment_label': article.get('overall_sentiment_label', 'Neutral'),
                    'relevance': float(article.get('relevance_score', 0))
                })

            return pd.DataFrame(records)

        except Exception as e:
            print(f"Alpha Vantage error: {e}")
            return pd.DataFrame()


def create_synthetic_historical_sentiment(
    trade_data_path: str,
    output_path: str
) -> pd.DataFrame:
    """
    FALLBACK: Create synthetic historical sentiment based on market moves

    This uses price action as a proxy for sentiment when actual news data
    is unavailable. Not ideal but allows backtesting the integration.

    Logic:
    - Large up moves (>1%) -> Positive sentiment
    - Large down moves (>1%) -> Negative sentiment
    - Volatility -> Higher news volume
    """
    print("Creating synthetic sentiment from price action...")

    # Load OHLC data
    df = pd.read_csv(trade_data_path, parse_dates=['ts_event'])
    df = df.set_index('ts_event')

    # Calculate returns
    df['returns'] = df['close'].pct_change()
    df['volatility'] = df['returns'].rolling(4).std()  # 1-hour vol on 15min bars

    # Synthetic sentiment: scaled returns
    df['sentiment'] = (df['returns'] * 100).clip(-5, 5)  # Cap at +/- 5

    # Synthetic volume: based on volatility
    df['volume'] = (df['volatility'] * 1000).fillna(1).clip(1, 100)

    # Smooth with rolling average (news persists)
    df['sentiment'] = df['sentiment'].rolling(4, min_periods=1).mean()

    result = df[['sentiment', 'volume']].reset_index()
    result = result.rename(columns={'ts_event': 'timestamp'})

    result.to_csv(output_path, index=False)
    print(f"Saved synthetic sentiment to {output_path}")

    return result


if __name__ == "__main__":
    # Example usage
    fetcher = GDELTFetcher()

    # Fetch historical data for backtesting
    # Match your backtest period
    results = fetcher.fetch_all_instruments(
        start_date="2023-01-01",
        end_date="2024-12-31",
        save=True
    )

    for instrument, df in results.items():
        print(f"\n{instrument} Summary:")
        print(f"  Records: {len(df)}")
        print(f"  Sentiment range: {df['sentiment'].min():.2f} to {df['sentiment'].max():.2f}")
        print(f"  Mean sentiment: {df['sentiment'].mean():.2f}")
