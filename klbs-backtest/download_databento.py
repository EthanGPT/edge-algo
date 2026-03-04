#!/usr/bin/env python3
"""
Databento data downloader for bonds and currencies.
Downloads 1-minute OHLCV data and resamples to 15-minute.
"""

import os
import databento as db
import pandas as pd
from datetime import datetime

API_KEY = os.environ.get('DATABENTO_API_KEY', 'db-5rbDjDvUgVvvjRW3LTReMae3CmKGD')

# Quarterly months: H=Mar, M=Jun, U=Sep, Z=Dec
MONTHS = ['H', 'M', 'U', 'Z']
YEARS = ['9', '0', '1', '2', '3', '4']  # 2019-2024

INSTRUMENTS = {
    'ZN': '10-Year Treasury',
    'ZB': '30-Year Treasury',
    '6E': 'Euro FX',
    '6J': 'Japanese Yen',
}

def download_and_stitch(client, symbol, output_dir):
    """Download all contracts for a symbol and stitch into continuous data."""
    print(f"\n{'='*50}")
    print(f"Downloading {symbol} ({INSTRUMENTS[symbol]})")
    print('='*50)

    all_data = []

    for y in YEARS:
        for m in MONTHS:
            contract = f'{symbol}{m}{y}'
            try:
                print(f"  Fetching {contract}...", end=' ')
                data = client.timeseries.get_range(
                    dataset='GLBX.MDP3',
                    symbols=[contract],
                    stype_in='raw_symbol',
                    schema='ohlcv-1m',
                    start='2019-01-01',
                    end='2024-08-31',
                )
                df = data.to_df()
                if len(df) > 0:
                    df['contract'] = contract
                    all_data.append(df)
                    print(f"{len(df):,} bars")
                else:
                    print("no data")
            except Exception as e:
                print(f"error: {str(e)[:50]}")

    if not all_data:
        print(f"  No data found for {symbol}")
        return False

    # Combine all contracts (ts_event is the index)
    print(f"\n  Combining {len(all_data)} contracts...")
    combined = pd.concat(all_data)
    combined = combined.sort_index()

    # Remove duplicates (overlapping contract periods) - keep first occurrence
    combined = combined[~combined.index.duplicated(keep='first')]

    print(f"  Total 1-min bars: {len(combined):,}")

    # Resample to 15-minute (index is already ts_event)
    print("  Resampling to 15-minute bars...")
    resampled = combined.resample('15min').agg({
        'open': 'first',
        'high': 'max',
        'low': 'min',
        'close': 'last',
        'volume': 'sum'
    }).dropna()

    print(f"  Total 15-min bars: {len(resampled):,}")

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
    print(f"Date range: 2019-01-01 to 2024-08-31")
    print(f"Output: {output_dir}")

    success = 0
    for sym in INSTRUMENTS:
        if download_and_stitch(client, sym, output_dir):
            success += 1

    print(f"\n{'='*50}")
    print(f"COMPLETE: {success}/{len(INSTRUMENTS)} instruments downloaded")
    print("="*50)

if __name__ == '__main__':
    main()
