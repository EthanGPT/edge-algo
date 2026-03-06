"""
Supabase Database Integration

Stores all signal decisions and trade outcomes for:
- Tracking consecutive losses
- Performance analytics
- Audit trail
"""

import os
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    print("WARNING: supabase-py not installed. Run: pip install supabase")


@dataclass
class SignalRecord:
    """A signal decision record."""
    id: Optional[int] = None
    timestamp: Optional[datetime] = None
    ticker: str = ""
    action: str = ""
    level: str = ""
    session: str = ""
    price: float = 0.0
    rsi: float = 50.0
    macd: float = 0.0
    adx: float = 25.0
    atr_pct: float = 0.5
    confidence: float = 0.0
    approved: bool = False
    reason: str = ""
    accounts_sent: List[str] = None
    # Outcome tracking
    outcome: Optional[str] = None  # WIN, LOSS, BE
    pnl: Optional[float] = None


class SupabaseDB:
    """Supabase database client for ML filter."""

    def __init__(self):
        self.client: Optional[Client] = None
        self.enabled = False
        self._connect()

    def _connect(self):
        """Connect to Supabase."""
        if not SUPABASE_AVAILABLE:
            print("Supabase not available - running in memory-only mode")
            return

        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_KEY", "")

        if not url or not key:
            print("SUPABASE_URL or SUPABASE_KEY not set - running in memory-only mode")
            return

        try:
            self.client = create_client(url, key)
            self.enabled = True
            print("Connected to Supabase")
        except Exception as e:
            print(f"Failed to connect to Supabase: {e}")

    # ══════════════════════════════════════════════════════════════════════════
    # SIGNAL LOGGING
    # ══════════════════════════════════════════════════════════════════════════

    def log_signal(self, signal: Dict, approved: bool, reason: str,
                   confidence: float, accounts_sent: List[str] = None) -> Optional[int]:
        """
        Log a signal decision to the database.
        Returns the record ID for later outcome updates.
        """
        if not self.enabled:
            return None

        try:
            record = {
                "timestamp": datetime.utcnow().isoformat(),
                "ticker": signal.get("ticker", ""),
                "action": signal.get("action", ""),
                "level": signal.get("level", ""),
                "session": signal.get("session", ""),
                "price": float(signal.get("price", 0)),
                "rsi": float(signal.get("rsi", 50)),
                "macd": float(signal.get("macd", 0)),
                "adx": float(signal.get("adx", 25)),
                "atr_pct": float(signal.get("atr_pct", 0.5)),
                "confidence": confidence,
                "approved": approved,
                "reason": reason,
                "accounts_sent": accounts_sent or [],
            }

            result = self.client.table("ml_signals").insert(record).execute()

            if result.data:
                return result.data[0].get("id")
            return None

        except Exception as e:
            print(f"Error logging signal: {e}")
            return None

    def update_outcome(self, signal_id: int, outcome: str, pnl: float = None):
        """Update a signal record with the trade outcome."""
        if not self.enabled or not signal_id:
            return

        try:
            update = {"outcome": outcome}
            if pnl is not None:
                update["pnl"] = pnl

            self.client.table("ml_signals").update(update).eq("id", signal_id).execute()

        except Exception as e:
            print(f"Error updating outcome: {e}")

    def update_outcome_by_ticker_level(self, ticker: str, level: str, outcome: str, pnl: float = None) -> Optional[int]:
        """
        Find the most recent approved signal for ticker+level and update its outcome.
        Returns the signal_id if found and updated, None otherwise.
        """
        if not self.enabled:
            return None

        try:
            # Find the most recent approved signal for this ticker+level that hasn't been resolved
            result = self.client.table("ml_signals")\
                .select("id")\
                .eq("ticker", ticker)\
                .eq("level", level)\
                .eq("approved", True)\
                .is_("outcome", "null")\
                .order("timestamp", desc=True)\
                .limit(1)\
                .execute()

            if not result.data:
                print(f"No pending signal found for {ticker} {level}")
                return None

            signal_id = result.data[0]["id"]

            # Update the outcome
            update = {"outcome": outcome}
            if pnl is not None:
                update["pnl"] = pnl

            self.client.table("ml_signals").update(update).eq("id", signal_id).execute()
            print(f"Updated outcome for signal {signal_id}: {ticker} {level} = {outcome}")
            return signal_id

        except Exception as e:
            print(f"Error updating outcome by ticker/level: {e}")
            return None

    # ══════════════════════════════════════════════════════════════════════════
    # STATISTICS & STATE
    # ══════════════════════════════════════════════════════════════════════════

    def get_today_stats(self) -> Dict:
        """Get today's trading statistics."""
        if not self.enabled:
            return {"trades_today": 0, "wins": 0, "losses": 0}

        try:
            today = date.today().isoformat()

            result = self.client.table("ml_signals")\
                .select("*")\
                .gte("timestamp", today)\
                .eq("approved", True)\
                .execute()

            signals = result.data or []
            wins = len([s for s in signals if s.get("outcome") == "WIN"])
            losses = len([s for s in signals if s.get("outcome") == "LOSS"])

            return {
                "trades_today": len(signals),
                "wins": wins,
                "losses": losses,
                "win_rate": wins / len(signals) if signals else 0,
            }

        except Exception as e:
            print(f"Error getting today stats: {e}")
            return {"trades_today": 0, "wins": 0, "losses": 0}

    def get_consecutive_losses(self) -> int:
        """Get current consecutive loss streak."""
        if not self.enabled:
            return 0

        try:
            # Get recent approved signals with outcomes
            result = self.client.table("ml_signals")\
                .select("outcome")\
                .eq("approved", True)\
                .not_.is_("outcome", "null")\
                .order("timestamp", desc=True)\
                .limit(20)\
                .execute()

            signals = result.data or []

            consecutive = 0
            for s in signals:
                if s.get("outcome") == "LOSS":
                    consecutive += 1
                else:
                    break

            return consecutive

        except Exception as e:
            print(f"Error getting consecutive losses: {e}")
            return 0

    def get_recent_outcomes(self, limit: int = 10) -> List[int]:
        """Get recent outcomes as list of 1 (win) or 0 (loss)."""
        if not self.enabled:
            return []

        try:
            result = self.client.table("ml_signals")\
                .select("outcome")\
                .eq("approved", True)\
                .not_.is_("outcome", "null")\
                .order("timestamp", desc=True)\
                .limit(limit)\
                .execute()

            signals = result.data or []
            return [1 if s.get("outcome") == "WIN" else 0 for s in signals]

        except Exception as e:
            print(f"Error getting recent outcomes: {e}")
            return []

    def get_level_win_rate(self, level: str, limit: int = 20) -> float:
        """Get win rate for a specific level type."""
        if not self.enabled:
            return 0.5

        try:
            result = self.client.table("ml_signals")\
                .select("outcome")\
                .eq("level", level)\
                .eq("approved", True)\
                .not_.is_("outcome", "null")\
                .order("timestamp", desc=True)\
                .limit(limit)\
                .execute()

            signals = result.data or []
            if not signals:
                return 0.5

            wins = len([s for s in signals if s.get("outcome") == "WIN"])
            return wins / len(signals)

        except Exception as e:
            print(f"Error getting level win rate: {e}")
            return 0.5

    def get_session_win_rate(self, session: str, limit: int = 20) -> float:
        """Get win rate for a specific session."""
        if not self.enabled:
            return 0.5

        try:
            result = self.client.table("ml_signals")\
                .select("outcome")\
                .eq("session", session)\
                .eq("approved", True)\
                .not_.is_("outcome", "null")\
                .order("timestamp", desc=True)\
                .limit(limit)\
                .execute()

            signals = result.data or []
            if not signals:
                return 0.5

            wins = len([s for s in signals if s.get("outcome") == "WIN"])
            return wins / len(signals)

        except Exception as e:
            print(f"Error getting session win rate: {e}")
            return 0.5


# Global database instance
db = SupabaseDB()


# ══════════════════════════════════════════════════════════════════════════════
# SUPABASE TABLE SCHEMA (run this in Supabase SQL editor)
# ══════════════════════════════════════════════════════════════════════════════

SCHEMA_SQL = """
-- ML Signal Filter - Signals Table
CREATE TABLE IF NOT EXISTS ml_signals (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),

    -- Signal data
    ticker VARCHAR(10) NOT NULL,
    action VARCHAR(10) NOT NULL,  -- buy/sell
    level VARCHAR(10),            -- PDH, PDL, PMH, PML, LPH, LPL
    session VARCHAR(20),          -- London, NY
    price DECIMAL(12, 4),

    -- Indicators
    rsi DECIMAL(6, 2),
    macd DECIMAL(10, 6),
    adx DECIMAL(6, 2),
    atr_pct DECIMAL(6, 3),

    -- ML decision
    confidence DECIMAL(5, 4),
    approved BOOLEAN NOT NULL,
    reason TEXT,
    accounts_sent TEXT[],

    -- Outcome (filled in later)
    outcome VARCHAR(10),  -- WIN, LOSS, BE
    pnl DECIMAL(12, 2)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ml_signals_timestamp ON ml_signals(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ml_signals_approved ON ml_signals(approved);
CREATE INDEX IF NOT EXISTS idx_ml_signals_outcome ON ml_signals(outcome);
CREATE INDEX IF NOT EXISTS idx_ml_signals_ticker ON ml_signals(ticker);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE ml_signals ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "Allow all for authenticated" ON ml_signals
    FOR ALL USING (true);
"""

def print_schema():
    """Print the SQL schema for Supabase setup."""
    print("\n" + "=" * 70)
    print("SUPABASE SCHEMA - Run this in your Supabase SQL Editor")
    print("=" * 70)
    print(SCHEMA_SQL)
    print("=" * 70 + "\n")


if __name__ == "__main__":
    print_schema()
