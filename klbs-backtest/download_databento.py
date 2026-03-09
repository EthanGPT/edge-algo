#!/usr/bin/env python3
"""
Databento data downloader for futures.
Downloads 1-minute OHLCV data and resamples to 15-minute.
Uses continuous front-month contracts.

Instruments:
- MES/MNQ: Launched May 2019
- MGC: Launched October 2021
- ES/NQ/GC: Available from 2017+
"""

import os
import databento as db
import pandas as pd
from datetime import datetime

API_KEY = os.environ.get('DATABENTO_API_KEY')
if not API_KEY:
    raise ValueError("Set DATABENTO_API_KEY environment variable")

# Instruments to download (continuous front-month)
# Micros for trading, full-size for extended history if needed
INSTRUMENTS = {
    # Micros (what we trade)
    'MES': 'MES.c.0',  # Micro E-mini S&P 500 (May 2019+)
    'MNQ': 'MNQ.c.0',  # Micro E-mini NASDAQ 100 (May 2019+)
    'MGC': 'MGC.c.0',  # Micro Gold (Oct 2021+)
    # Full-size (for extended history/backup)
    'ES': 'ES.c.0',   # E-mini S&P 500
    'NQ': 'NQ.c.0',   # E-mini NASDAQ 100
    'GC': 'GC.c.0',   # Gold Futures
}

# Date ranges by instrument (micros have limited history)
INSTRUMENT_START_DATES = {
    'MES': '2019-05-01',
    'MNQ': '2019-05-01',
    'MGC': '2021-10-01',
    'ES': '2017-01-01',
    'NQ': '2017-01-01',
    'GC': '2017-01-01',
}

def download_continuous(client, symbol, continuous_symbol, output_dir, start_date=None, end_date='2026-03-10'):
    """Download continuous contract data."""
    print(f"\n{'='*50}")
    print(f"Downloading {symbol} ({continuous_symbol})")
    print(f"Date range: {start_date} to {end_date}")
    print('='*50)

    try:
        print(f"  Fetching data...", end=' ', flush=True)
        data = client.timeseries.get_range(
            dataset='GLBX.MDP3',
            symbols=[continuous_symbol],
            stype_in='continuous',
            schema='ohlcv-1m',
            start=start_date,
            end=end_date,
        )
        df = data.to_df()

        if len(df) == 0:
            print("no data")
            return False

        print(f"{len(df):,} bars")

    except Exception as e:
        print(f"error: {str(e)[:80]}")
        return False

    # Resample to 15-minute
    print("  Resampling to 15-minute bars...", end=' ', flush=True)
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

    print(f"{len(resampled):,} bars")

    # Reset index and format
    resampled = resampled.reset_index()
    resampled = resampled[['ts_event', 'open', 'high', 'low', 'close', 'volume']]

    # Save to CSV
    output_path = os.path.join(output_dir, f'{symbol}_15m.csv')
    resampled.to_csv(output_path, index=False)

    print(f"  Saved to {output_path}")
    print(f"  Date range: {resampled['ts_event'].min()} to {resampled['ts_event'].max()}")

    return True

def main():
    client = db.Historical(API_KEY)
    output_dir = os.path.dirname(os.path.abspath(__file__)) + '/data'
    end_date = '2026-03-10'

    print("="*50)
    print("DATABENTO FUTURES DOWNLOADER")
    print("="*50)
    print(f"Instruments: {', '.join(INSTRUMENTS.keys())}")
    print(f"Output: {output_dir}")

    success = 0
    for sym, continuous_sym in INSTRUMENTS.items():
        start_date = INSTRUMENT_START_DATES.get(sym, '2017-01-01')
        if download_continuous(client, sym, continuous_sym, output_dir, start_date=start_date, end_date=end_date):
            success += 1

    print(f"\n{'='*50}")
    print(f"COMPLETE: {success}/{len(INSTRUMENTS)} instruments downloaded")
    print("="*50)

if __name__ == '__main__':
    main()
