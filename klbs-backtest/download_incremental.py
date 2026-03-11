#!/usr/bin/env python3
"""
Incremental Databento downloader.
- Downloads MORE historical data (going back further)
- Downloads recent data we're missing
- Merges with existing files
"""

import os
import databento as db
import pandas as pd
from pathlib import Path

API_KEY = 'db-AYgF94q9UsTdJVUpfmAXyLRNA6C9j'
DATA_DIR = Path(__file__).parent / 'data'

# Extended history - go back as far as possible!
INSTRUMENTS = {
    # Full-size (can go back to 2010+)
    'ES': {'symbol': 'ES.c.0', 'start': '2010-01-01'},  # E-mini S&P - decades of data
    'NQ': {'symbol': 'NQ.c.0', 'start': '2010-01-01'},  # E-mini NASDAQ
    'GC': {'symbol': 'GC.c.0', 'start': '2010-01-01'},  # Gold
    # Micros (limited to launch dates)
    'MES': {'symbol': 'MES.c.0', 'start': '2019-05-01'},
    'MNQ': {'symbol': 'MNQ.c.0', 'start': '2019-05-01'},
    'MGC': {'symbol': 'MGC.c.0', 'start': '2021-10-01'},
}

END_DATE = '2026-03-10'

def get_existing_range(symbol):
    """Get date range of existing data."""
    path = DATA_DIR / f'{symbol}_15m.csv'
    if not path.exists():
        return None, None

    df = pd.read_csv(path, parse_dates=['ts_event'])
    return df['ts_event'].min(), df['ts_event'].max()

def download_range(client, symbol, continuous_symbol, start, end):
    """Download data for a date range."""
    print(f"    Fetching {start} to {end}...", end=' ', flush=True)

    try:
        data = client.timeseries.get_range(
            dataset='GLBX.MDP3',
            symbols=[continuous_symbol],
            stype_in='continuous',
            schema='ohlcv-1m',
            start=start,
            end=end,
        )
        df = data.to_df()

        if len(df) == 0:
            print("no data")
            return None

        print(f"{len(df):,} 1m bars")

        # Resample to 15-minute
        df = df.reset_index()
        df['ts_event'] = pd.to_datetime(df['ts_event'])
        df = df.set_index('ts_event')

        resampled = df.resample('15min').agg({
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }).dropna()

        resampled = resampled.reset_index()
        print(f"    Resampled to {len(resampled):,} 15m bars")

        return resampled

    except Exception as e:
        print(f"error: {str(e)[:80]}")
        return None

def process_instrument(client, symbol, config):
    """Download missing data for an instrument."""
    print(f"\n{'='*60}")
    print(f"{symbol}")
    print('='*60)

    existing_start, existing_end = get_existing_range(symbol)
    target_start = config['start']
    target_end = END_DATE

    if existing_start:
        print(f"  Existing: {existing_start.date()} to {existing_end.date()}")
    else:
        print(f"  No existing data")

    print(f"  Target:   {target_start} to {target_end}")

    chunks = []
    existing_path = DATA_DIR / f'{symbol}_15m.csv'

    # Load existing data
    if existing_path.exists():
        existing_df = pd.read_csv(existing_path, parse_dates=['ts_event'])
        chunks.append(existing_df)
        print(f"  Loaded {len(existing_df):,} existing bars")

    # Download OLDER data (before existing)
    if existing_start:
        target_start_ts = pd.Timestamp(target_start, tz='UTC')
        if target_start_ts < existing_start:
            print(f"\n  Downloading OLDER data...")
            older_df = download_range(
                client, symbol, config['symbol'],
                target_start,
                existing_start.strftime('%Y-%m-%d')
            )
            if older_df is not None and len(older_df) > 0:
                chunks.insert(0, older_df)  # Prepend older data

    # Download NEWER data (after existing)
    if existing_end:
        target_end_ts = pd.Timestamp(target_end, tz='UTC')
        if existing_end < target_end_ts:
            # Start from day after existing end
            newer_start = (existing_end + pd.Timedelta(days=1)).strftime('%Y-%m-%d')
            print(f"\n  Downloading NEWER data...")
            newer_df = download_range(
                client, symbol, config['symbol'],
                newer_start,
                target_end
            )
            if newer_df is not None and len(newer_df) > 0:
                chunks.append(newer_df)

    # If no existing data, download everything
    if not existing_start:
        print(f"\n  Downloading ALL data...")
        all_df = download_range(
            client, symbol, config['symbol'],
            target_start,
            target_end
        )
        if all_df is not None:
            chunks = [all_df]

    # Merge and save
    if len(chunks) > 1 or (len(chunks) == 1 and not existing_path.exists()):
        print(f"\n  Merging {len(chunks)} chunks...")
        combined = pd.concat(chunks, ignore_index=True)
        combined['ts_event'] = pd.to_datetime(combined['ts_event'], utc=True)
        combined = combined.drop_duplicates(subset=['ts_event']).sort_values('ts_event')
        combined = combined.reset_index(drop=True)

        # Save
        combined.to_csv(existing_path, index=False)
        print(f"  SAVED: {len(combined):,} total bars")
        print(f"  Range: {combined['ts_event'].min().date()} to {combined['ts_event'].max().date()}")
        return len(combined)
    else:
        print(f"  No new data to download")
        return 0

def main():
    client = db.Historical(API_KEY)

    print("="*60)
    print("DATABENTO INCREMENTAL DOWNLOAD")
    print("="*60)
    print(f"Target end date: {END_DATE}")
    print(f"Going back to 2010 for full-size contracts!")

    total_new = 0
    for symbol, config in INSTRUMENTS.items():
        new_bars = process_instrument(client, symbol, config)
        total_new += new_bars

    print(f"\n{'='*60}")
    print(f"DONE - Added data across instruments")
    print("="*60)

    # Now regenerate combined files
    print("\nRegenerating combined files...")
    os.system('python3 combine_data.py')

if __name__ == '__main__':
    main()
