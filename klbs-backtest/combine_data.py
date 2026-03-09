#!/usr/bin/env python3
"""
Combine full-size futures data (ES/NQ/GC) with micros (MES/MNQ/MGC).
Uses full-size data before micros existed to extend training history.

Strategy:
- ES data (2017-2019) + MES data (2019-present) -> MES_combined
- NQ data (2017-2019) + MNQ data (2019-present) -> MNQ_combined
- GC data (2017-2020) + MGC data (2020-present) -> MGC_combined
"""

import pandas as pd
from pathlib import Path

DATA_DIR = Path(__file__).parent / 'data'

# Pairs and their cutoff dates (when micros launched)
PAIRS = [
    ('ES', 'MES', '2019-06-01'),   # MES launched May 2019
    ('NQ', 'MNQ', '2019-06-01'),   # MNQ launched May 2019
    ('GC', 'MGC', '2020-01-01'),   # MGC launched Oct 2021, but using 2020 for safety
]

def combine_pair(full_sym, micro_sym, cutoff_date, output_suffix='combined'):
    """Combine full-size and micro data."""
    print(f"\n{'='*60}")
    print(f"Combining {full_sym} + {micro_sym}")
    print('='*60)

    # Load data
    full_path = DATA_DIR / f'{full_sym}_15m.csv'
    micro_path = DATA_DIR / f'{micro_sym}_15m.csv'

    if not full_path.exists():
        print(f"  ERROR: {full_path} not found")
        return None
    if not micro_path.exists():
        print(f"  ERROR: {micro_path} not found")
        return None

    full_df = pd.read_csv(full_path, parse_dates=['ts_event'])
    micro_df = pd.read_csv(micro_path, parse_dates=['ts_event'])

    print(f"\n{full_sym}: {len(full_df):,} bars ({full_df['ts_event'].min().date()} to {full_df['ts_event'].max().date()})")
    print(f"{micro_sym}: {len(micro_df):,} bars ({micro_df['ts_event'].min().date()} to {micro_df['ts_event'].max().date()})")

    # Split full-size at cutoff (use only pre-cutoff)
    cutoff = pd.Timestamp(cutoff_date, tz='UTC')
    full_pre = full_df[full_df['ts_event'] < cutoff].copy()
    micro_post = micro_df.copy()  # Use all micro data

    print(f"\nUsing {full_sym} data before {cutoff_date}: {len(full_pre):,} bars")
    print(f"Using {micro_sym} data (all): {len(micro_post):,} bars")

    # Combine
    combined = pd.concat([full_pre, micro_post], ignore_index=True)
    combined = combined.sort_values('ts_event').reset_index(drop=True)

    # Remove any duplicates (shouldn't be many)
    before_dedup = len(combined)
    combined = combined.drop_duplicates(subset=['ts_event'], keep='last')
    after_dedup = len(combined)
    if before_dedup != after_dedup:
        print(f"Removed {before_dedup - after_dedup} duplicate timestamps")

    print(f"\nCombined: {len(combined):,} bars")
    print(f"Date range: {combined['ts_event'].min().date()} to {combined['ts_event'].max().date()}")

    # Save
    output_path = DATA_DIR / f'{micro_sym}_{output_suffix}_15m.csv'
    combined.to_csv(output_path, index=False)
    print(f"Saved to: {output_path}")

    # Calculate extra data added
    extra_bars = len(full_pre)
    extra_years = (cutoff - full_df['ts_event'].min()).days / 365
    print(f"\n+{extra_bars:,} extra bars (+{extra_years:.1f} years of history)")

    return combined

def main():
    print("="*60)
    print("COMBINING FULL-SIZE + MICRO FUTURES DATA")
    print("="*60)
    print("\nThis extends micro futures training history using full-size data.")
    print("Full-size and micros track the same underlying, so returns are identical.")

    results = []
    for full_sym, micro_sym, cutoff in PAIRS:
        result = combine_pair(full_sym, micro_sym, cutoff)
        if result is not None:
            results.append((micro_sym, len(result)))

    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print("\n| Instrument | Combined Bars |")
    print("|------------|---------------|")
    for sym, bars in results:
        print(f"| {sym}_combined | {bars:,} |")

    print("\n--- NEXT STEPS ---")
    print("1. Update backtest.py to use *_combined_15m.csv files")
    print("2. Retrain ML model with extended history")
    print("3. More data = better model generalization")

if __name__ == '__main__':
    main()
