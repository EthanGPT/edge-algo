#!/usr/bin/env python3
"""
Download MAXIMUM historical data from Databento for ES/NQ/GC.
Try progressively earlier dates to find how far back we can go.
"""

import os
import databento as db
import pandas as pd
from pathlib import Path

API_KEY = 'db-AYgF94q9UsTdJVUpfmAXyLRNA6C9j'
DATA_DIR = Path(__file__).parent / 'data'

# Full-size contracts - we want as much as possible
INSTRUMENTS = {
    'ES': 'ES.c.0',
    'NQ': 'NQ.c.0',
    'GC': 'GC.c.0',
}

# Try these start dates (earliest first)
START_DATES_TO_TRY = [
    '2012-01-01',
    '2013-01-01',
    '2014-01-01',
    '2015-01-01',
    '2016-01-01',
]

END_DATE = '2026-02-28'  # Latest available

def download_and_resample(client, symbol, continuous_symbol, start, end):
    """Download 1m data and resample to 15m."""
    print(f"  Trying {start}...", end=' ', flush=True)

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

        print(f"SUCCESS! {len(df):,} 1m bars")

        # Resample to 15m
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
        return resampled

    except Exception as e:
        err = str(e)
        if 'data_start_before_available_start' in err:
            print("too early")
        else:
            print(f"error: {err[:50]}")
        return None

def process_instrument(client, symbol, continuous_symbol):
    """Download maximum history for an instrument."""
    print(f"\n{'='*60}")
    print(f"{symbol} - Finding earliest available data")
    print('='*60)

    # Check existing data
    existing_path = DATA_DIR / f'{symbol}_15m.csv'
    if existing_path.exists():
        existing = pd.read_csv(existing_path, parse_dates=['ts_event'])
        print(f"  Current: {len(existing):,} bars ({existing['ts_event'].min().date()} to {existing['ts_event'].max().date()})")
        existing_start = existing['ts_event'].min()
    else:
        existing = None
        existing_start = None

    # Try progressively earlier dates
    new_data = None
    for start_date in START_DATES_TO_TRY:
        if existing_start and pd.Timestamp(start_date, tz='UTC') >= existing_start:
            print(f"  Skipping {start_date} - already have data from {existing_start.date()}")
            continue

        result = download_and_resample(client, symbol, continuous_symbol, start_date, END_DATE)
        if result is not None:
            new_data = result
            break

    if new_data is None:
        print(f"  No earlier data available")
        return 0

    # Compare with existing
    print(f"\n  New data: {len(new_data):,} bars ({new_data['ts_event'].min().date()} to {new_data['ts_event'].max().date()})")

    if existing is not None:
        extra_bars = len(new_data) - len(existing)
        if extra_bars > 0:
            print(f"  +{extra_bars:,} extra bars!")
            # Save the new (larger) dataset
            new_data.to_csv(existing_path, index=False)
            print(f"  SAVED!")
            return extra_bars
        else:
            print(f"  No extra bars (existing is same or larger)")
            return 0
    else:
        new_data.to_csv(existing_path, index=False)
        print(f"  SAVED {len(new_data):,} bars")
        return len(new_data)

def main():
    client = db.Historical(API_KEY)

    print("="*60)
    print("MAXIMUM HISTORY DOWNLOAD - ES/NQ/GC")
    print("="*60)
    print("Finding how far back Databento has data...")

    total_extra = 0
    for symbol, continuous in INSTRUMENTS.items():
        extra = process_instrument(client, symbol, continuous)
        total_extra += extra

    print(f"\n{'='*60}")
    if total_extra > 0:
        print(f"ADDED {total_extra:,} extra bars total!")
        print("Regenerating combined files...")
        os.system('python3 combine_data.py')
    else:
        print("Already have maximum available history")
    print("="*60)

if __name__ == '__main__':
    main()
