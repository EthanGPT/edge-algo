#!/usr/bin/env python3
"""
Databento data downloader for NQ, ES, GC futures.
Downloads 1-minute OHLCV data and resamples to 15-minute.
Uses continuous front-month contracts.
"""

import os
import databento as db
import pandas as pd
from datetime import datetime

API_KEY = os.environ.get('DATABENTO_API_KEY', 'db-8teqxTgFY3swN3VXiBjTyaqJLWk4K')

# Instruments to download (continuous front-month)
INSTRUMENTS = {
    'NQ': 'NQ.c.0',  # E-mini NASDAQ 100
    'ES': 'ES.c.0',  # E-mini S&P 500
    'GC': 'GC.c.0',  # Gold Futures
}

def download_continuous(client, symbol, continuous_symbol, output_dir, start_date='2017-01-01', end_date='2026-03-01'):
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

    print("="*50)
    print("DATABENTO FUTURES DOWNLOADER")
    print("="*50)
    print(f"Instruments: {', '.join(INSTRUMENTS.keys())}")
    print(f"Date range: 2017-01-01 to 2026-03-01")
    print(f"Output: {output_dir}")

    success = 0
    for sym, continuous_sym in INSTRUMENTS.items():
        if download_continuous(client, sym, continuous_sym, output_dir):
            success += 1

    print(f"\n{'='*50}")
    print(f"COMPLETE: {success}/{len(INSTRUMENTS)} instruments downloaded")
    print("="*50)

if __name__ == '__main__':
    main()
