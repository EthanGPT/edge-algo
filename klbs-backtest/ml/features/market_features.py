"""
Market feature extraction from OHLC data.

Extracts technical features like ATR, trend strength, volume ratios,
and normalized price action for the RL observation space.
"""

import numpy as np
import pandas as pd
from typing import Optional


class MarketFeatureExtractor:
    """Extract market structure features from OHLC data."""

    def __init__(self, lookback_bars: int = 10, atr_period: int = 14):
        """
        Args:
            lookback_bars: Number of bars to include in observation
            atr_period: Period for ATR calculation
        """
        self.lookback_bars = lookback_bars
        self.atr_period = atr_period

    def extract(
        self,
        ohlc_df: pd.DataFrame,
        signal_time: pd.Timestamp,
        level_price: Optional[float] = None,
    ) -> np.ndarray:
        """
        Extract market features at signal time.

        Args:
            ohlc_df: DataFrame with columns [ts_event, open, high, low, close, volume]
            signal_time: Timestamp of the signal
            level_price: Price of the key level (for distance calculation)

        Returns:
            Feature array containing:
            - ATR (normalized)
            - ATR ratio (current vs 20-bar average)
            - Trend strength (-1 to 1)
            - Distance from level (in ATR units)
            - Volume ratio (current vs 20-bar average)
            - Normalized OHLC for lookback bars (4 * lookback_bars)
            - Bar ranges for lookback bars (lookback_bars)
        """
        # Ensure datetime index
        if "ts_event" in ohlc_df.columns:
            df = ohlc_df.set_index("ts_event").sort_index()
        else:
            df = ohlc_df.sort_index()

        # Find bars up to signal time
        mask = df.index <= signal_time
        df_prior = df[mask]

        if len(df_prior) < self.lookback_bars + self.atr_period:
            # Not enough data, return zeros
            n_features = 5 + self.lookback_bars * 5
            return np.zeros(n_features, dtype=np.float32)

        # Get last N bars for lookback
        recent = df_prior.iloc[-self.lookback_bars :]

        # Calculate ATR
        atr = self._calculate_atr(df_prior, self.atr_period)
        atr_20 = self._calculate_rolling_atr(df_prior, 20)
        atr_ratio = atr / (atr_20 + 1e-8) if atr_20 > 0 else 1.0

        # Calculate trend strength using linear regression slope
        trend_strength = self._calculate_trend_strength(df_prior, 20)

        # Distance from level (in ATR units)
        current_price = df_prior["close"].iloc[-1]
        if level_price is not None and atr > 0:
            distance_from_level = (current_price - level_price) / atr
        else:
            distance_from_level = 0.0

        # Volume ratio
        current_volume = df_prior["volume"].iloc[-1]
        avg_volume = df_prior["volume"].iloc[-20:].mean()
        volume_ratio = current_volume / (avg_volume + 1e-8) if avg_volume > 0 else 1.0

        # Normalize ATR by typical value (instrument-specific would be better)
        atr_normalized = np.clip(atr / (current_price * 0.01 + 1e-8), 0, 5)

        # Scalar features
        scalar_features = np.array(
            [
                atr_normalized,
                np.clip(atr_ratio, 0, 3),
                np.clip(trend_strength, -1, 1),
                np.clip(distance_from_level, -5, 5),
                np.clip(volume_ratio, 0, 5),
            ],
            dtype=np.float32,
        )

        # Normalized OHLC for lookback bars
        # Normalize relative to the most recent close
        ref_price = recent["close"].iloc[-1]
        ohlc_norm = []
        for _, bar in recent.iterrows():
            ohlc_norm.extend(
                [
                    (bar["open"] - ref_price) / (atr + 1e-8),
                    (bar["high"] - ref_price) / (atr + 1e-8),
                    (bar["low"] - ref_price) / (atr + 1e-8),
                    (bar["close"] - ref_price) / (atr + 1e-8),
                ]
            )
        ohlc_features = np.clip(np.array(ohlc_norm, dtype=np.float32), -10, 10)

        # Bar ranges (high - low) normalized by ATR
        ranges = (recent["high"] - recent["low"]).values / (atr + 1e-8)
        range_features = np.clip(ranges, 0, 5).astype(np.float32)

        return np.concatenate([scalar_features, ohlc_features, range_features])

    def _calculate_atr(self, df: pd.DataFrame, period: int) -> float:
        """Calculate Average True Range."""
        if len(df) < period + 1:
            return 0.0

        high = df["high"].values
        low = df["low"].values
        close = df["close"].values

        # True Range components
        tr1 = high[1:] - low[1:]
        tr2 = np.abs(high[1:] - close[:-1])
        tr3 = np.abs(low[1:] - close[:-1])

        tr = np.maximum(tr1, np.maximum(tr2, tr3))

        # Simple moving average of TR
        if len(tr) >= period:
            return np.mean(tr[-period:])
        return np.mean(tr) if len(tr) > 0 else 0.0

    def _calculate_rolling_atr(self, df: pd.DataFrame, period: int) -> float:
        """Calculate rolling average ATR over longer period."""
        if len(df) < period * 2:
            return self._calculate_atr(df, period)

        # Get ATR values over the period
        atr_values = []
        for i in range(period):
            end_idx = len(df) - i
            start_idx = max(0, end_idx - period)
            subset = df.iloc[start_idx:end_idx]
            atr_values.append(self._calculate_atr(subset, min(period, len(subset) - 1)))

        return np.mean(atr_values) if atr_values else 0.0

    def _calculate_trend_strength(self, df: pd.DataFrame, period: int) -> float:
        """
        Calculate trend strength using linear regression slope.

        Returns value between -1 (strong downtrend) and 1 (strong uptrend).
        """
        if len(df) < period:
            return 0.0

        closes = df["close"].iloc[-period:].values
        x = np.arange(period)

        # Linear regression slope
        x_mean = x.mean()
        y_mean = closes.mean()
        slope = np.sum((x - x_mean) * (closes - y_mean)) / (
            np.sum((x - x_mean) ** 2) + 1e-8
        )

        # Normalize by price range
        price_range = closes.max() - closes.min()
        if price_range > 0:
            normalized_slope = slope * period / price_range
        else:
            normalized_slope = 0.0

        return np.clip(normalized_slope, -1, 1)
