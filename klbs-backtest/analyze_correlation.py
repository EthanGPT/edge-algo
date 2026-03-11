#!/usr/bin/env python3
"""
Analyze correlation between full-size futures (ES/NQ/GC) and micros (MES/MNQ/MGC).
If highly correlated, we can use full-size data to extend micro training history.
"""

import pandas as pd
import numpy as np
from pathlib import Path

DATA_DIR = Path(__file__).parent / 'data'

# Pairs to compare
PAIRS = [
    ('ES', 'MES'),
    ('NQ', 'MNQ'),
    ('GC', 'MGC'),
]

def load_data(symbol):
    """Load 15m data for a symbol."""
    path = DATA_DIR / f'{symbol}_15m.csv'
    if not path.exists():
        return None
    df = pd.read_csv(path, parse_dates=['ts_event'])
    df = df.set_index('ts_event')
    return df

def analyze_pair(full_sym, micro_sym):
    """Analyze correlation between full-size and micro futures."""
    print(f"\n{'='*60}")
    print(f"Comparing {full_sym} (full-size) vs {micro_sym} (micro)")
    print('='*60)

    full_df = load_data(full_sym)
    micro_df = load_data(micro_sym)

    if full_df is None:
        print(f"  No data for {full_sym}")
        return None
    if micro_df is None:
        print(f"  No data for {micro_sym}")
        return None

    print(f"\n{full_sym}: {len(full_df):,} bars ({full_df.index.min().date()} to {full_df.index.max().date()})")
    print(f"{micro_sym}: {len(micro_df):,} bars ({micro_df.index.min().date()} to {micro_df.index.max().date()})")

    # Find overlapping period
    overlap_start = max(full_df.index.min(), micro_df.index.min())
    overlap_end = min(full_df.index.max(), micro_df.index.max())

    full_overlap = full_df[overlap_start:overlap_end]
    micro_overlap = micro_df[overlap_start:overlap_end]

    # Align on exact timestamps
    common_idx = full_overlap.index.intersection(micro_overlap.index)
    full_aligned = full_overlap.loc[common_idx]
    micro_aligned = micro_overlap.loc[common_idx]

    print(f"\nOverlapping period: {overlap_start.date()} to {overlap_end.date()}")
    print(f"Common bars: {len(common_idx):,}")

    # Calculate returns
    full_returns = full_aligned['close'].pct_change().dropna()
    micro_returns = micro_aligned['close'].pct_change().dropna()

    # Align returns
    common_return_idx = full_returns.index.intersection(micro_returns.index)
    full_returns = full_returns.loc[common_return_idx]
    micro_returns = micro_returns.loc[common_return_idx]

    # Correlation metrics
    correlation = full_returns.corr(micro_returns)

    # Price ratio analysis
    price_ratio = full_aligned['close'] / micro_aligned['close']

    print(f"\n--- CORRELATION ANALYSIS ---")
    print(f"Return correlation: {correlation:.4f}")
    print(f"Price ratio (full/micro): {price_ratio.mean():.4f} (std: {price_ratio.std():.4f})")

    # Direction agreement
    full_direction = np.sign(full_returns)
    micro_direction = np.sign(micro_returns)
    direction_agreement = (full_direction == micro_direction).mean()

    print(f"Direction agreement: {direction_agreement:.2%}")

    # Move magnitude comparison
    print(f"\n--- MOVE MAGNITUDE ---")
    print(f"{full_sym} avg abs return: {full_returns.abs().mean()*100:.4f}%")
    print(f"{micro_sym} avg abs return: {micro_returns.abs().mean()*100:.4f}%")

    # High/Low/Close comparison
    print(f"\n--- OHLC CORRELATION ---")
    for col in ['open', 'high', 'low', 'close']:
        corr = full_aligned[col].corr(micro_aligned[col])
        print(f"  {col}: {corr:.6f}")

    return {
        'full': full_sym,
        'micro': micro_sym,
        'return_corr': correlation,
        'direction_agreement': direction_agreement,
        'extra_bars': len(full_df) - len(micro_df),
        'full_start': full_df.index.min(),
        'micro_start': micro_df.index.min(),
    }

def main():
    print("="*60)
    print("FULL-SIZE vs MICRO FUTURES CORRELATION ANALYSIS")
    print("="*60)

    results = []
    for full_sym, micro_sym in PAIRS:
        result = analyze_pair(full_sym, micro_sym)
        if result:
            results.append(result)

    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    print("\n| Pair | Return Corr | Direction Match | Extra Bars (Full) |")
    print("|------|-------------|-----------------|-------------------|")
    for r in results:
        print(f"| {r['full']}/{r['micro']} | {r['return_corr']:.4f} | {r['direction_agreement']:.2%} | +{r['extra_bars']:,} |")

    print("\n--- RECOMMENDATION ---")
    high_corr = all(r['return_corr'] > 0.95 for r in results)
    if high_corr:
        print("ALL pairs have >95% correlation!")
        print("Safe to use full-size data to extend training history.")
        print("\nExtra data available:")
        for r in results:
            extra_years = (r['micro_start'] - r['full_start']).days / 365
            print(f"  {r['full']}: +{extra_years:.1f} years of data before {r['micro_start'].date()}")
    else:
        print("WARNING: Some pairs have lower correlation.")
        print("Review carefully before combining data.")

if __name__ == '__main__':
    main()
