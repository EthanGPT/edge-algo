"""
Prepare training data for the KLBS Signal Filter RL agent.

Loads historical trades and OHLC data, merges them, and creates
train/validation/test splits using walk-forward methodology.
"""

import os
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Tuple, Dict, List, Optional
from datetime import datetime


def load_ohlc_data(data_dir: str) -> Dict[str, pd.DataFrame]:
    """
    Load OHLC data for all instruments.

    Args:
        data_dir: Directory containing *_15m.csv files

    Returns:
        Dict mapping instrument name to DataFrame
    """
    ohlc_data = {}
    data_path = Path(data_dir)

    instrument_files = {
        "MNQ": "MNQ_15m.csv",
        "MES": "MES_15m.csv",
        "MGC": "MGC_15m.csv",
        "M2K": "M2K_15m.csv",
        "ZN": "ZN_15m.csv",
        "ZB": "ZB_15m.csv",
        "6E": "6E_15m.csv",
        "6J": "6J_15m.csv",
    }

    for instrument, filename in instrument_files.items():
        filepath = data_path / filename
        if filepath.exists():
            df = pd.read_csv(filepath, parse_dates=["ts_event"])
            df = df.sort_values("ts_event").reset_index(drop=True)
            ohlc_data[instrument] = df
            print(f"Loaded {instrument}: {len(df):,} bars")
        else:
            print(f"Warning: {filepath} not found")

    return ohlc_data


def load_signal_data(outputs_dir: str) -> pd.DataFrame:
    """
    Load historical signal/trade data from backtest outputs.

    Args:
        outputs_dir: Directory containing klbs_*_trades.csv files

    Returns:
        Combined DataFrame of all signals with outcomes
    """
    outputs_path = Path(outputs_dir)
    all_signals = []

    # Look for trade files
    for filepath in outputs_path.glob("klbs_*_trades.csv"):
        if "optimized" in str(filepath) or "_be" in str(filepath):
            continue  # Skip variant files

        # Extract instrument from filename
        filename = filepath.stem
        parts = filename.split("_")
        if len(parts) >= 2:
            instrument = parts[1]
        else:
            continue

        df = pd.read_csv(filepath, parse_dates=["date"])
        df["instrument"] = instrument

        # Ensure required columns exist
        required_cols = ["date", "level", "direction", "outcome", "pnl_usd"]
        if all(col in df.columns for col in required_cols):
            all_signals.append(df)
            print(f"Loaded {instrument}: {len(df):,} signals")

    if not all_signals:
        raise ValueError(f"No signal files found in {outputs_dir}")

    # Combine all instruments
    signals_df = pd.concat(all_signals, ignore_index=True)
    signals_df = signals_df.sort_values("date").reset_index(drop=True)

    print(f"\nTotal signals: {len(signals_df):,}")
    print(f"Date range: {signals_df['date'].min()} to {signals_df['date'].max()}")
    print(f"Win rate: {(signals_df['outcome'] == 'WIN').mean():.1%}")

    return signals_df


def create_walk_forward_splits(
    signals_df: pd.DataFrame,
    train_months: int = 24,
    test_months: int = 3,
    step_months: int = 3,
) -> List[Tuple[pd.DataFrame, pd.DataFrame]]:
    """
    Create walk-forward train/test splits.

    Args:
        signals_df: All signals DataFrame
        train_months: Months of training data per window
        test_months: Months of test data per window
        step_months: Months to step forward between windows

    Returns:
        List of (train_df, test_df) tuples
    """
    signals_df = signals_df.copy()
    signals_df["date"] = pd.to_datetime(signals_df["date"])

    min_date = signals_df["date"].min()
    max_date = signals_df["date"].max()

    splits = []
    train_start = min_date

    while True:
        train_end = train_start + pd.DateOffset(months=train_months)
        test_start = train_end
        test_end = test_start + pd.DateOffset(months=test_months)

        if test_end > max_date:
            break

        train_mask = (signals_df["date"] >= train_start) & (
            signals_df["date"] < train_end
        )
        test_mask = (signals_df["date"] >= test_start) & (signals_df["date"] < test_end)

        train_df = signals_df[train_mask].reset_index(drop=True)
        test_df = signals_df[test_mask].reset_index(drop=True)

        if len(train_df) > 100 and len(test_df) > 20:
            splits.append((train_df, test_df))
            print(
                f"Split {len(splits)}: Train {train_start.date()} - {train_end.date()} "
                f"({len(train_df)} signals) | Test {test_start.date()} - {test_end.date()} "
                f"({len(test_df)} signals)"
            )

        train_start += pd.DateOffset(months=step_months)

    print(f"\nTotal walk-forward splits: {len(splits)}")
    return splits


def prepare_training_data(
    data_dir: str = "data",
    outputs_dir: str = "outputs",
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
) -> Dict[str, any]:
    """
    Prepare all data for training.

    Args:
        data_dir: Directory with OHLC CSV files
        outputs_dir: Directory with trade CSV files
        train_ratio: Ratio of data for training
        val_ratio: Ratio of data for validation

    Returns:
        Dict containing:
        - ohlc_data: Dict of instrument -> OHLC DataFrame
        - signals: All signals DataFrame
        - train_signals: Training signals
        - val_signals: Validation signals
        - test_signals: Test signals
        - walk_forward_splits: List of (train, test) splits
    """
    # Load data
    ohlc_data = load_ohlc_data(data_dir)
    signals_df = load_signal_data(outputs_dir)

    # Simple chronological split
    n = len(signals_df)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    train_signals = signals_df.iloc[:train_end].reset_index(drop=True)
    val_signals = signals_df.iloc[train_end:val_end].reset_index(drop=True)
    test_signals = signals_df.iloc[val_end:].reset_index(drop=True)

    print(f"\nChronological splits:")
    print(f"  Train: {len(train_signals):,} signals")
    print(f"  Val:   {len(val_signals):,} signals")
    print(f"  Test:  {len(test_signals):,} signals")

    # Walk-forward splits for robust evaluation
    walk_forward_splits = create_walk_forward_splits(signals_df)

    return {
        "ohlc_data": ohlc_data,
        "signals": signals_df,
        "train_signals": train_signals,
        "val_signals": val_signals,
        "test_signals": test_signals,
        "walk_forward_splits": walk_forward_splits,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Prepare training data")
    parser.add_argument("--data-dir", default="data", help="OHLC data directory")
    parser.add_argument("--outputs-dir", default="outputs", help="Trade outputs directory")
    args = parser.parse_args()

    # Change to klbs-backtest directory
    script_dir = Path(__file__).parent.parent.parent
    os.chdir(script_dir)

    data = prepare_training_data(args.data_dir, args.outputs_dir)
    print("\nData preparation complete!")
