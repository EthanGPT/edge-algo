"""
Time-based feature encoding for trading signals.

Encodes session time, day of week, and other temporal features
using cyclical encoding for continuous features.
"""

import numpy as np
import pandas as pd
from typing import Union


class TimeFeatureEncoder:
    """Encode time-related features for trading signals."""

    # Session definitions (NY timezone)
    SESSIONS = {
        "LPM": (0, 3),  # London Pre-Market: 00:00-03:00
        "London": (3, 8),  # London: 03:00-08:00
        "Dead": (8, 9.5),  # Dead zone: 08:00-09:30
        "NY": (9.5, 16),  # New York: 09:30-16:00
    }

    def encode(self, signal: Union[pd.Series, dict]) -> np.ndarray:
        """
        Encode time features from a signal.

        Args:
            signal: Signal data with 'date', 'hour', or timestamp info

        Returns:
            Feature array containing:
            - Hour (sin, cos encoding) [2]
            - Minutes into session (normalized) [1]
        """
        # Extract datetime
        if isinstance(signal, pd.Series):
            date_val = signal.get("date")
            hour = signal.get("hour")
        else:
            date_val = signal.get("date")
            hour = signal.get("hour")

        # Parse datetime if needed
        if date_val is not None:
            if isinstance(date_val, str):
                dt = pd.Timestamp(date_val)
            else:
                dt = date_val

            if hour is None:
                hour = dt.hour + dt.minute / 60.0
        else:
            hour = hour if hour is not None else 12.0

        # Hour encoding (cyclical)
        hour_sin = np.sin(2 * np.pi * hour / 24.0)
        hour_cos = np.cos(2 * np.pi * hour / 24.0)

        # Minutes into current session
        session = self._get_session(hour)
        if session and session in self.SESSIONS:
            start, end = self.SESSIONS[session]
            session_duration = end - start
            minutes_in = (hour - start) * 60
            minutes_normalized = minutes_in / (session_duration * 60)
        else:
            minutes_normalized = 0.5

        return np.array(
            [hour_sin, hour_cos, np.clip(minutes_normalized, 0, 1)], dtype=np.float32
        )

    def _get_session(self, hour: float) -> str:
        """Determine which session the hour falls into."""
        for session, (start, end) in self.SESSIONS.items():
            if start <= hour < end:
                return session
        return "Off"

    def encode_day_of_week(self, day: Union[str, int]) -> np.ndarray:
        """
        Encode day of week as cyclical features.

        Args:
            day: Day name or index (0=Monday, 4=Friday)

        Returns:
            Cyclical encoding [sin, cos]
        """
        day_map = {
            "Monday": 0,
            "Tuesday": 1,
            "Wednesday": 2,
            "Thursday": 3,
            "Friday": 4,
        }

        if isinstance(day, str):
            day_idx = day_map.get(day, 0)
        else:
            day_idx = int(day)

        day_sin = np.sin(2 * np.pi * day_idx / 5.0)
        day_cos = np.cos(2 * np.pi * day_idx / 5.0)

        return np.array([day_sin, day_cos], dtype=np.float32)
