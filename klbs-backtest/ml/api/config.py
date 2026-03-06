"""
ML Signal Filter - Centralized Configuration

All trading parameters are controlled here. Adjust these to tune the filter.
No code changes needed - just modify values here.
"""

from dataclasses import dataclass, field
from typing import Dict, List
import os

@dataclass
class FilterConfig:
    """
    ML Filter Configuration - THE BRAIN

    Adjust these parameters to control trading behavior.
    """

    # ══════════════════════════════════════════════════════════════════════════
    # ML MODEL SETTINGS
    # ══════════════════════════════════════════════════════════════════════════

    # Confidence threshold - only take signals above this probability
    # Higher = fewer trades but higher win rate
    # Recommended: 0.55-0.65 for funded evals
    threshold: float = 0.60

    # ══════════════════════════════════════════════════════════════════════════
    # TRADE LIMITS
    # ══════════════════════════════════════════════════════════════════════════

    # Maximum trades per day (across all instruments)
    max_trades_per_day: int = 4

    # Maximum consecutive losses before pausing
    # After this many losses in a row, skip signals for rest of day
    max_consecutive_losses: int = 3

    # ══════════════════════════════════════════════════════════════════════════
    # INSTRUMENT SETTINGS
    # ══════════════════════════════════════════════════════════════════════════

    # Which instruments are enabled for trading
    enabled_instruments: List[str] = field(default_factory=lambda: ["MES", "MNQ", "MGC"])

    # ══════════════════════════════════════════════════════════════════════════
    # MARKET FILTERS
    # ══════════════════════════════════════════════════════════════════════════

    # Skip signals when ATR% is above this (high volatility = danger)
    max_atr_pct: float = 1.5

    # RSI extremes - skip overbought/oversold
    rsi_overbought: float = 75.0
    rsi_oversold: float = 25.0

    # Minimum ADX for trend strength (0 = disabled)
    min_adx: float = 0.0

    # ══════════════════════════════════════════════════════════════════════════
    # SESSION FILTERS
    # ══════════════════════════════════════════════════════════════════════════

    # Which sessions to trade
    enabled_sessions: List[str] = field(default_factory=lambda: ["London", "NY"])

    # ══════════════════════════════════════════════════════════════════════════
    # TRADERSPOST ACCOUNTS - Multiple accounts with different instrument access
    # ══════════════════════════════════════════════════════════════════════════

    # Each account has a webhook URL and list of allowed instruments
    # Approved signals are sent to ALL accounts that allow that instrument
    accounts: List[Dict] = field(default_factory=lambda: [
        {
            "name": "Test v1",  # All 3 instruments
            "webhook": os.getenv("TRADERSPOST_WEBHOOK_1", ""),
            "instruments": ["MES", "MNQ", "MGC"],
        },
        {
            "name": "Ethan PA 1",  # Personal prop - no MGC
            "webhook": os.getenv("TRADERSPOST_WEBHOOK_2", ""),
            "instruments": ["MES", "MNQ"],
        },
        # Add more accounts as needed
    ])

    # ══════════════════════════════════════════════════════════════════════════
    # LOGGING
    # ══════════════════════════════════════════════════════════════════════════

    # Log all decisions to Supabase (for tracking)
    log_to_supabase: bool = True

    # Supabase connection
    supabase_url: str = field(
        default_factory=lambda: os.getenv("SUPABASE_URL", "")
    )
    supabase_key: str = field(
        default_factory=lambda: os.getenv("SUPABASE_KEY", "")
    )


# Global config instance - import this in other modules
config = FilterConfig()


def update_config(**kwargs):
    """
    Update config values at runtime.

    Example:
        update_config(threshold=0.65, max_trades_per_day=3)
    """
    global config
    for key, value in kwargs.items():
        if hasattr(config, key):
            setattr(config, key, value)
        else:
            raise ValueError(f"Unknown config key: {key}")


def get_config_summary() -> Dict:
    """Get current config as a dictionary."""
    return {
        "threshold": config.threshold,
        "max_trades_per_day": config.max_trades_per_day,
        "max_consecutive_losses": config.max_consecutive_losses,
        "enabled_instruments": config.enabled_instruments,
        "max_atr_pct": config.max_atr_pct,
        "rsi_overbought": config.rsi_overbought,
        "rsi_oversold": config.rsi_oversold,
        "min_adx": config.min_adx,
        "enabled_sessions": config.enabled_sessions,
    }
