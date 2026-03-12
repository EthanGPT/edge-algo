#!/usr/bin/env python3
"""
KLBS ML Signal Filter API - Standalone Deployment Version

Receives webhooks from TradingView, makes ML-based decisions,
and forwards approved signals to TradersPost.

Deploy: Railway, Fly.io, or Render (~$5/month)
"""

import os
import json
import httpx
import pickle
import numpy as np
from datetime import datetime, date
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass, field

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION - THE BRAIN
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class FilterConfig:
    """All trading parameters controlled here."""

    # ML threshold - only take signals above this confidence
    # Using 50% to maximize volume - dynamic sizing handles edge on 60%+/70%+
    threshold: float = 0.50

    # Trade limits
    max_trades_per_day: int = 999  # Unlimited - prop firm handles daily limits
    max_consecutive_losses: int = 3

    # Instruments & sessions
    enabled_instruments: List[str] = field(default_factory=lambda: ["MES", "MNQ", "MGC"])
    enabled_sessions: List[str] = field(default_factory=lambda: ["London", "NY"])

    # Market filters
    max_atr_pct: float = 1.5
    rsi_overbought: float = 65.0  # Changed from 75 - tighter filter improves results
    rsi_oversold: float = 35.0   # Changed from 25 - tighter filter improves results

    # Position sizing thresholds (backtest: 80% WR at 65%+, 93% WR at 70%+)
    position_sizing_enabled: bool = True
    confidence_2x: float = 0.65  # 2 contracts at 65%+ confidence
    confidence_3x: float = 0.70  # 3 contracts at 70%+ confidence

    # TradersPost accounts with position limits
    accounts: List[Dict] = field(default_factory=lambda: [
        {
            "name": "Test v1",
            "webhook": os.getenv("TRADERSPOST_WEBHOOK_1", ""),
            "instruments": ["MES", "MNQ", "MGC"],
            "max_contracts": {"MES": 3, "MNQ": 3, "MGC": 2},  # MGC capped at 2 always
            "funded": False,
        },
        {
            "name": "Ethan - Apex",
            "webhook": os.getenv("TRADERSPOST_WEBHOOK_2", ""),
            "instruments": ["MES", "MNQ"],  # No MGC on Apex
            "max_contracts": {"MES": 3, "MNQ": 3},
            "funded": True,
        },
        {
            "name": "Ethan - Lucid",
            "webhook": os.getenv("TRADERSPOST_WEBHOOK_3", ""),
            "instruments": ["MES", "MNQ", "MGC"],
            "max_contracts": {"MES": 3, "MNQ": 3, "MGC": 2},  # MGC capped at 2 for 25K
            "funded": True,
        },
    ])

config = FilterConfig()

def get_config_summary() -> Dict:
    return {
        "threshold": config.threshold,
        "max_trades_per_day": config.max_trades_per_day,
        "max_consecutive_losses": config.max_consecutive_losses,
        "enabled_instruments": config.enabled_instruments,
        "enabled_sessions": config.enabled_sessions,
        "rsi_thresholds": f"{config.rsi_overbought}/{config.rsi_oversold}",
        "position_sizing": {
            "enabled": config.position_sizing_enabled,
            "2x_at": f"{config.confidence_2x:.0%}",
            "3x_at": f"{config.confidence_3x:.0%}",
        },
        "accounts": [
            {
                "name": a["name"],
                "instruments": a["instruments"],
                "max_contracts": a.get("max_contracts", {}),
                "webhook_configured": bool(a.get("webhook", "")),
            }
            for a in config.accounts
        ],
    }

def update_config(**kwargs):
    for key, value in kwargs.items():
        if hasattr(config, key):
            setattr(config, key, value)

# ══════════════════════════════════════════════════════════════════════════════
# SUPABASE DATABASE
# ══════════════════════════════════════════════════════════════════════════════

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    print("WARNING: supabase-py not installed")

class SupabaseDB:
    def __init__(self):
        self.client: Optional[Client] = None
        self.enabled = False
        self._connect()

    def _connect(self):
        if not SUPABASE_AVAILABLE:
            return
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_KEY", "")
        if not url or not key:
            print("SUPABASE_URL or SUPABASE_KEY not set")
            return
        try:
            self.client = create_client(url, key)
            self.enabled = True
            print("Connected to Supabase")
        except Exception as e:
            print(f"Supabase connection failed: {e}")

    def log_signal(self, signal: Dict, approved: bool, reason: str,
                   confidence: float, accounts_sent: List[str] = None) -> Optional[int]:
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
                "tp_price": float(signal.get("tp", 0)) if signal.get("tp") else None,
                "sl_price": float(signal.get("sl", 0)) if signal.get("sl") else None,
                "rsi": float(signal.get("rsi", 50)),
                "rsi_roc": float(signal.get("rsi_roc", 0)),
                "macd": float(signal.get("macd", 0)),
                "macd_hist": float(signal.get("macd_hist", 0)),
                "plus_di": float(signal.get("plus_di", 25)),
                "minus_di": float(signal.get("minus_di", 25)),
                "adx": float(signal.get("adx", 25)),
                "atr_pct": float(signal.get("atr_pct", 0.5)),
                "confidence": confidence,
                "approved": approved,
                "reason": reason,
                "accounts_sent": accounts_sent or [],
            }
            result = self.client.table("ml_signals").insert(record).execute()
            return result.data[0].get("id") if result.data else None
        except Exception as e:
            print(f"Error logging signal: {e}")
            return None

    def update_outcome(self, signal_id: int, outcome: str, pnl: float = None):
        if not self.enabled or not signal_id:
            return
        try:
            update = {"outcome": outcome}
            if pnl is not None:
                update["pnl"] = pnl
            self.client.table("ml_signals").update(update).eq("id", signal_id).execute()
        except Exception as e:
            print(f"Error updating outcome: {e}")

    def update_outcome_by_ticker_level(self, ticker: str, level: str,
                                        outcome: str, pnl: float = None,
                                        approved_only: bool = True) -> Optional[int]:
        """Update outcome for a signal. Set approved_only=False to update rejected signals too."""
        if not self.enabled:
            return None
        try:
            query = self.client.table("ml_signals")\
                .select("id, approved")\
                .eq("ticker", ticker)\
                .eq("level", level)\
                .is_("outcome", "null")\
                .order("timestamp", desc=True)\
                .limit(1)

            if approved_only:
                query = query.eq("approved", True)

            result = query.execute()
            if not result.data:
                print(f"No pending signal for {ticker} {level}")
                return None

            signal_id = result.data[0]["id"]
            was_approved = result.data[0]["approved"]

            update = {"outcome": outcome}
            if pnl is not None:
                update["pnl"] = pnl
            # Mark hypothetical outcomes for rejected signals
            if not was_approved:
                update["hypothetical"] = True

            self.client.table("ml_signals").update(update).eq("id", signal_id).execute()
            status = "LIVE" if was_approved else "HYPOTHETICAL"
            print(f"Updated ({status}): {ticker} {level} = {outcome}")
            return signal_id
        except Exception as e:
            print(f"Error: {e}")
            return None

    def get_today_stats(self) -> Dict:
        if not self.enabled:
            return {"trades_today": 0}
        try:
            today = date.today().isoformat()
            result = self.client.table("ml_signals")\
                .select("*")\
                .gte("timestamp", today)\
                .eq("approved", True)\
                .execute()
            return {"trades_today": len(result.data or [])}
        except:
            return {"trades_today": 0}

    def get_consecutive_losses(self) -> int:
        if not self.enabled:
            return 0
        try:
            result = self.client.table("ml_signals")\
                .select("outcome")\
                .eq("approved", True)\
                .not_.is_("outcome", "null")\
                .order("timestamp", desc=True)\
                .limit(20)\
                .execute()
            consecutive = 0
            for s in (result.data or []):
                if s.get("outcome") == "LOSS":
                    consecutive += 1
                else:
                    break
            return consecutive
        except:
            return 0

    def get_recent_outcomes(self, limit: int = 10) -> List[int]:
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
            return [1 if s.get("outcome") == "WIN" else 0 for s in (result.data or [])]
        except:
            return []

db = SupabaseDB()

# ══════════════════════════════════════════════════════════════════════════════
# TRADING STATE
# ══════════════════════════════════════════════════════════════════════════════

class TradingState:
    def __init__(self):
        self.reset()

    def reset(self):
        self.current_date: Optional[date] = None
        self.trades_today: int = 0
        self.signals_received: int = 0
        self.signals_approved: int = 0
        self.signals_rejected: int = 0
        self.last_signal_id: Optional[int] = None

    def new_day_check(self):
        today = date.today()
        if self.current_date != today:
            self.current_date = today
            self.trades_today = 0
            self.signals_received = 0
            self.signals_approved = 0
            self.signals_rejected = 0
            if db.enabled:
                stats = db.get_today_stats()
                self.trades_today = stats.get("trades_today", 0)

    @property
    def consecutive_losses(self) -> int:
        return db.get_consecutive_losses() if db.enabled else 0

    @property
    def last_outcomes(self) -> list:
        return db.get_recent_outcomes(10) if db.enabled else []

state = TradingState()

# ══════════════════════════════════════════════════════════════════════════════
# HISTORICAL WIN RATES (from 15,736 signals across 6+ years of backtests)
# ══════════════════════════════════════════════════════════════════════════════

LEVEL_WIN_RATES = {
    "PDH": 0.516,
    "PDL": 0.526,
    "PMH": 0.566,
    "PML": 0.601,
    "LPH": 0.544,
    "LPL": 0.561,
}

SESSION_WIN_RATES = {
    "London": 0.569,
    "NY": 0.544,
}

# ══════════════════════════════════════════════════════════════════════════════
# ML MODEL
# ══════════════════════════════════════════════════════════════════════════════

MODEL_PATH = Path(__file__).parent / "model.pkl"
model = None

def load_model():
    global model
    if MODEL_PATH.exists():
        with open(MODEL_PATH, "rb") as f:
            model = pickle.load(f)
        print(f"Model loaded: {MODEL_PATH}")
        print(f"Expected features: {model.n_features_in_}")
    else:
        print(f"WARNING: Model not found at {MODEL_PATH}")


def extract_features(signal: Dict) -> np.ndarray:
    """
    Extract 30 features matching training script v5.

    Features (30 total) - v5 with analysis-driven improvements:
    - Level one-hot (6): PDH, PDL, PMH, PML, LPH, LPL
    - Direction one-hot (2): LONG, SHORT
    - Session one-hot (2): London, NY
    - Day of week one-hot (5): Mon-Fri
    - Hour normalized (1)
    - Hour_Score (1): Boost 9am, penalize 11am/13pm/15pm (NEW)
    - Instrument one-hot (3): MES, MNQ, MGC
    - RSI_Score (1): Direction-aware from backtest data
    - RSI_Momentum (1): RSI ROC aligned with direction
    - MACD_Score (1): Direction-aware MACD alignment
    - MACD_Hist (1): Momentum direction from histogram
    - DI_Align (1): +DI/-DI alignment (STRENGTHENED 1.0/0.3)
    - ATR_Score (1): Direction-aware ATR (NEW)
    - Setup_Score (1): Penalize bad combos (NEW)
    - Historical level WR (1)
    - Historical session WR (1)
    """
    features = []

    # 1. Level one-hot (6 features)
    levels = ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]
    level = signal.get("level", "PDL")
    features.extend([1.0 if level == l else 0.0 for l in levels])

    # 2. Direction one-hot (2 features)
    action = signal.get("action", "buy")
    is_long = action == "buy"
    features.append(1.0 if is_long else 0.0)
    features.append(1.0 if not is_long else 0.0)

    # 3. Session one-hot (2 features)
    session = signal.get("session", "NY")
    features.append(1.0 if session == "London" else 0.0)
    features.append(1.0 if session == "NY" else 0.0)

    # 4. Day of week one-hot (5 features)
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    try:
        signal_time = datetime.fromisoformat(signal.get("time", "").replace("Z", "+00:00"))
        day = signal_time.strftime("%A")
    except:
        day = datetime.now().strftime("%A")
    features.extend([1.0 if day == d else 0.0 for d in days])

    # 5. Hour normalized (1 feature)
    try:
        hour = signal_time.hour
    except:
        hour = 12
    features.append(hour / 24.0)

    # 5b. Hour_Score (1 feature) - Boost/penalize specific hours
    if hour == 9:
        hour_score = 1.0   # Best NY hour - 56.8% WR
    elif hour in [7, 8]:
        hour_score = 0.8   # Good London hours
    elif hour in [10, 12]:
        hour_score = 0.7   # OK hours
    elif hour in [11, 13, 14, 15]:
        hour_score = 0.3   # Bad hours - 52.7-54.5% WR
    else:
        hour_score = 0.5   # Neutral
    features.append(hour_score)

    # 6. Instrument one-hot (3 features)
    instruments = ["MES", "MNQ", "MGC"]
    inst = signal.get("ticker", "MNQ")
    features.extend([1.0 if inst == i else 0.0 for i in instruments])

    # 7. Technical indicators - DATA-DRIVEN SCORES ONLY
    rsi = float(signal.get("rsi", 50))
    rsi_roc = float(signal.get("rsi_roc", 0))
    macd = float(signal.get("macd", 0))
    macd_hist = float(signal.get("macd_hist", 0))
    plus_di = float(signal.get("plus_di", 25))
    minus_di = float(signal.get("minus_di", 25))
    atr_pct = float(signal.get("atr_pct", 0.5))

    # RSI_SCORE (1 feature) - Direction-aware from 25k signal analysis
    # LONG: RSI 55-65 = best (60-62% WR), <30 = worst (50.6% WR)
    # SHORT: RSI <35 = best (59-60% WR), >70 = worst (51.2% WR)
    if is_long:
        if rsi < 30:
            rsi_score = 0.3   # 50.6% WR
        elif rsi < 40:
            rsi_score = 0.6   # 53-57% WR
        elif rsi < 50:
            rsi_score = 0.7   # 56-59% WR
        elif rsi < 55:
            rsi_score = 0.9   # 60.4% WR
        elif rsi < 65:
            rsi_score = 1.0   # 59-62% WR (BEST)
        else:
            rsi_score = 0.9   # 60% WR
    else:  # SHORT
        if rsi < 35:
            rsi_score = 1.0   # 59-60% WR (BEST)
        elif rsi < 50:
            rsi_score = 0.8   # 56-58% WR
        elif rsi < 60:
            rsi_score = 0.6   # 54-55% WR
        elif rsi < 70:
            rsi_score = 0.4   # 52% WR
        else:
            rsi_score = 0.3   # 51.2% WR
    features.append(rsi_score)

    # RSI_MOMENTUM (1 feature) - RSI ROC aligned with direction
    # LONG + rising = 61.8% WR, falling = 54.9% WR (6.9% edge)
    # SHORT + falling = 58.7% WR, rising = 52.8% WR (5.9% edge)
    if is_long:
        rsi_momentum = 1.0 if rsi_roc >= 0 else 0.7
    else:
        rsi_momentum = 0.9 if rsi_roc <= 0 else 0.6
    features.append(rsi_momentum)

    # MACD_SCORE (1 feature) - Direction-aware MACD alignment
    # LONG + bullish = 59.0% WR, bearish = 55.2% WR
    # SHORT + bearish = 56.7% WR, bullish = 53.4% WR
    if is_long:
        macd_score = 0.9 if macd > 0 else 0.7
    else:
        macd_score = 0.8 if macd <= 0 else 0.6
    features.append(macd_score)

    # MACD_HIST (1 feature) - Momentum direction
    # LONG + positive = 59.1% WR, negative = 55.9% WR
    # SHORT + negative = 56.6% WR, positive = 53.4% WR
    if is_long:
        macd_hist_score = 0.9 if macd_hist > 0 else 0.75
    else:
        macd_hist_score = 0.8 if macd_hist <= 0 else 0.6
    features.append(macd_hist_score)

    # DI_ALIGN (1 feature) - Directional movement alignment
    # LONG + aligned = 59.7% WR, not = 55.5% WR (4.2% edge)
    # SHORT + aligned = 56.8% WR, not = 53.3% WR (3.5% edge)
    if is_long:
        di_align = 0.9 if plus_di > minus_di else 0.7
    else:
        di_align = 0.8 if minus_di > plus_di else 0.6
    features.append(di_align)

    # ATR_SCORE (1 feature) - Direction-aware ATR
    # LONG: Low 57.2%, Med 56.5%, High 56.0% (all similar)
    # SHORT: Low 54.4%, Med 56.4%, High 61.4% (high vol BEST!)
    if is_long:
        if atr_pct < 0.25:
            atr_score = 0.8   # 57.2% WR
        elif atr_pct < 0.5:
            atr_score = 0.75  # 56.5% WR
        else:
            atr_score = 0.7   # 56.0% WR
    else:  # SHORT - high vol is best!
        if atr_pct < 0.25:
            atr_score = 0.6   # 54.4% WR
        elif atr_pct < 0.5:
            atr_score = 0.8   # 56.4% WR
        else:
            atr_score = 1.0   # 61.4% WR (BEST!)
    features.append(atr_score)

    # SETUP_SCORE (1 feature) - Penalize worst combos (NEW)
    direction = "LONG" if is_long else "SHORT"
    setup_key = f"{level}_{direction}_{session}"
    BAD_SETUPS = {
        "PDL_LONG_London": 0.2,   # 47.6% WR - worst!
        "PDH_SHORT_London": 0.2,  # 47.7% WR - avoid!
        "PDH_SHORT_NY": 0.5,      # 52.8% WR
        "LPH_SHORT_London": 0.6,  # 53.5% WR
    }
    GOOD_SETUPS = {
        "PML_LONG_London": 1.0,   # 58.8% WR - best!
        "PDL_LONG_NY": 0.95,      # 56.9% WR
        "LPL_LONG_London": 0.9,   # 56.0% WR
        "PMH_SHORT_London": 0.9,  # 56.0% WR
    }
    if setup_key in BAD_SETUPS:
        setup_score = BAD_SETUPS[setup_key]
    elif setup_key in GOOD_SETUPS:
        setup_score = GOOD_SETUPS[setup_key]
    else:
        setup_score = 0.7  # Neutral
    features.append(setup_score)

    # 8. Historical win rates (2 features)
    features.append(LEVEL_WIN_RATES.get(level, 0.55))
    features.append(SESSION_WIN_RATES.get(session, 0.55))

    return np.array(features, dtype=np.float32)

# ══════════════════════════════════════════════════════════════════════════════
# SIGNAL FILTERING
# ══════════════════════════════════════════════════════════════════════════════

def should_take_signal(signal: Dict) -> tuple:
    state.new_day_check()
    state.signals_received += 1

    ticker = signal.get("ticker", "")
    session = signal.get("session", "")

    if ticker not in config.enabled_instruments:
        return False, f"Instrument {ticker} not enabled", 0.0

    if session not in config.enabled_sessions:
        return False, f"Session {session} not enabled", 0.0

    if state.trades_today >= config.max_trades_per_day:
        return False, f"Daily limit ({config.max_trades_per_day})", 0.0

    if state.consecutive_losses >= config.max_consecutive_losses:
        return False, f"Consecutive losses ({state.consecutive_losses})", 0.0

    atr_pct = float(signal.get("atr_pct", 0))
    if atr_pct > config.max_atr_pct:
        return False, f"ATR% too high ({atr_pct:.2f}%)", 0.0

    rsi = float(signal.get("rsi", 50))
    action = signal.get("action", "buy")

    if action == "buy" and rsi > config.rsi_overbought:
        return False, f"RSI overbought ({rsi:.1f})", 0.0
    if action == "sell" and rsi < config.rsi_oversold:
        return False, f"RSI oversold ({rsi:.1f})", 0.0

    if model is None:
        return False, "Model not loaded", 0.0

    features = extract_features(signal)
    prob = model.predict_proba(features.reshape(1, -1))[0, 1]

    if prob < config.threshold:
        return False, f"Confidence too low ({prob:.1%})", prob

    return True, "Approved", prob


def get_position_size(confidence: float, ticker: str, account: Dict) -> int:
    """
    Calculate position size based on ML confidence.

    Backtest results (65/35 RSI):
      55-65% confidence: 58.6% WR → 1 contract
      65-70% confidence: 80.2% WR → 2 contracts
      70%+ confidence:   93.1% WR → 3 contracts
    """
    if not config.position_sizing_enabled:
        return 1

    # Base position from confidence
    if confidence >= config.confidence_3x:
        base_contracts = 3
    elif confidence >= config.confidence_2x:
        base_contracts = 2
    else:
        base_contracts = 1

    # Apply account-specific limits
    max_contracts = account.get("max_contracts", {}).get(ticker, 3)
    final_contracts = min(base_contracts, max_contracts)

    return final_contracts


# ══════════════════════════════════════════════════════════════════════════════
# FASTAPI APP
# ══════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="KLBS ML Signal Filter",
    description="Filters KLBS signals using ML before forwarding to TradersPost",
    version="1.0.0"
)

# CORS - allow frontend to call API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (you can restrict to your domain later)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    load_model()
    print("ML Signal Filter started")
    print(f"Config: {get_config_summary()}")

@app.get("/")
async def root():
    return {"status": "running", "service": "KLBS ML Signal Filter"}

@app.get("/status")
async def get_status():
    state.new_day_check()
    return {
        "date": str(state.current_date),
        "trades_today": state.trades_today,
        "signals_received": state.signals_received,
        "signals_approved": state.signals_approved,
        "signals_rejected": state.signals_rejected,
        "consecutive_losses": state.consecutive_losses,
        "config": get_config_summary(),
        "model_loaded": model is not None,
        "db_connected": db.enabled,
    }

@app.post("/webhook")
async def receive_signal(request: Request):
    """Main webhook - handles entry signals AND outcome alerts."""
    try:
        payload = await request.json()
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Check if outcome message
    if payload.get("type") == "outcome":
        outcome = payload.get("outcome", "").upper()
        ticker = payload.get("ticker")
        level = payload.get("level")
        pnl = payload.get("pnl")

        if outcome not in ["WIN", "LOSS", "BE"]:
            return JSONResponse({"error": "Invalid outcome"}, status_code=400)

        # First try to match approved signals (real trades)
        signal_id = db.update_outcome_by_ticker_level(
            ticker, level, outcome, pnl, approved_only=True
        )

        if signal_id:
            outcome_type = "LIVE"
        else:
            # No approved match - try rejected signals (hypothetical tracking)
            signal_id = db.update_outcome_by_ticker_level(
                ticker, level, outcome, pnl, approved_only=False
            )
            outcome_type = "HYPOTHETICAL" if signal_id else "NO_MATCH"

        consecutive = state.consecutive_losses
        print(f"OUTCOME ({outcome_type}): {ticker} {level} = {outcome} | Streak: {consecutive}")

        return JSONResponse({
            "status": "outcome_recorded",
            "type": outcome_type.lower(),
            "ticker": ticker,
            "level": level,
            "outcome": outcome,
            "consecutive_losses": consecutive,
        })

    # Entry signal - ML decision
    approved, reason, confidence = should_take_signal(payload)

    log_entry = {
        "time": datetime.now().isoformat(),
        "ticker": payload.get("ticker"),
        "action": payload.get("action"),
        "level": payload.get("level"),
        "approved": approved,
        "reason": reason,
        "confidence": f"{confidence:.1%}" if confidence > 0 else "N/A",
    }
    print(f"SIGNAL: {json.dumps(log_entry)}")

    if approved:
        state.signals_approved += 1
        state.trades_today += 1

        ticker = payload.get("ticker", "")

        accounts_sent = []
        async with httpx.AsyncClient() as client:
            for account in config.accounts:
                if ticker not in account.get("instruments", []):
                    continue
                webhook_url = account.get("webhook", "")
                if not webhook_url:
                    continue

                # Calculate position size for this account
                quantity = get_position_size(confidence, ticker, account)

                # TradersPost payload with signal override for quantity
                tp_payload = {
                    "ticker": ticker,
                    "action": payload.get("action"),
                    "price": payload.get("price"),
                    "quantityType": "fixed_quantity",
                    "quantity": quantity,
                }

                try:
                    resp = await client.post(webhook_url, json=tp_payload, timeout=10.0)
                    accounts_sent.append(f"{account.get('name')}({quantity}x)")
                    print(f"  → {account.get('name')}: {resp.status_code} | {quantity} contracts")
                except Exception as e:
                    print(f"  → {account.get('name')}: ERROR {e}")

        signal_id = db.log_signal(payload, True, reason, confidence, accounts_sent)
        state.last_signal_id = signal_id

        return JSONResponse({
            "status": "approved",
            "reason": reason,
            "confidence": f"{confidence:.1%}",
            "trades_today": state.trades_today,
            "accounts_sent": accounts_sent,
        })
    else:
        state.signals_rejected += 1
        db.log_signal(payload, False, reason, confidence)
        return JSONResponse({
            "status": "rejected",
            "reason": reason,
        })

@app.post("/config")
async def update_config_endpoint(request: Request):
    try:
        payload = await request.json()
        update_config(**payload)
        return {"status": "updated", "config": get_config_summary()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/filter-validation")
async def filter_validation():
    """Compare outcomes of approved vs rejected signals to validate the filter is working."""
    if not db.enabled:
        return {"error": "Database not connected"}

    try:
        # Get approved signals with outcomes
        approved = db.client.table("ml_signals")\
            .select("outcome, pnl")\
            .eq("approved", True)\
            .not_.is_("outcome", "null")\
            .execute()

        # Get rejected signals with hypothetical outcomes
        rejected = db.client.table("ml_signals")\
            .select("outcome, pnl")\
            .eq("approved", False)\
            .not_.is_("outcome", "null")\
            .execute()

        def calc_stats(data):
            if not data:
                return {"count": 0, "wins": 0, "win_rate": 0, "pnl": 0}
            wins = sum(1 for r in data if r.get("outcome") == "WIN")
            total_pnl = sum(r.get("pnl", 0) or 0 for r in data)
            return {
                "count": len(data),
                "wins": wins,
                "win_rate": f"{wins/len(data)*100:.1f}%" if data else "0%",
                "pnl": total_pnl
            }

        approved_stats = calc_stats(approved.data or [])
        rejected_stats = calc_stats(rejected.data or [])

        # Calculate filter effectiveness
        approved_wr = approved_stats["wins"] / approved_stats["count"] if approved_stats["count"] > 0 else 0
        rejected_wr = rejected_stats["wins"] / rejected_stats["count"] if rejected_stats["count"] > 0 else 0
        edge = approved_wr - rejected_wr

        return {
            "approved_trades": approved_stats,
            "rejected_trades_hypothetical": rejected_stats,
            "filter_edge": f"{edge*100:.1f}%" if rejected_stats["count"] > 0 else "Need more rejected outcomes",
            "verdict": "Filter is working" if edge > 0.05 else "Need more data" if rejected_stats["count"] < 20 else "Filter may need tuning"
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/learning-insights")
async def learning_insights():
    """
    Detailed ML learning insights - what's working, what's not, where to improve.
    Use this to understand how the model is performing on live data.
    """
    if not db.enabled:
        return {"error": "Database not connected"}

    try:
        # Get ALL signals with outcomes
        result = db.client.table("ml_signals")\
            .select("*")\
            .not_.is_("outcome", "null")\
            .execute()

        if not result.data:
            return {"error": "No signals with outcomes yet"}

        signals = result.data
        approved = [s for s in signals if s.get("approved")]
        rejected = [s for s in signals if not s.get("approved")]

        def win_rate(data):
            if not data:
                return 0
            return sum(1 for s in data if s.get("outcome") == "WIN") / len(data)

        # Overall stats
        approved_wr = win_rate(approved)
        rejected_wr = win_rate(rejected)

        # Breakdowns
        levels = ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]
        sessions = ["London", "NY"]
        instruments = ["MES", "MNQ", "MGC"]

        level_stats = {}
        for level in levels:
            level_signals = [s for s in signals if s.get("level") == level]
            if len(level_signals) >= 2:
                level_stats[level] = {
                    "count": len(level_signals),
                    "win_rate": f"{win_rate(level_signals)*100:.1f}%"
                }

        session_stats = {}
        for session in sessions:
            sess_signals = [s for s in signals if s.get("session") == session]
            if len(sess_signals) >= 2:
                session_stats[session] = {
                    "count": len(sess_signals),
                    "win_rate": f"{win_rate(sess_signals)*100:.1f}%"
                }

        instrument_stats = {}
        for inst in instruments:
            inst_signals = [s for s in signals if s.get("ticker") == inst]
            if len(inst_signals) >= 2:
                instrument_stats[inst] = {
                    "count": len(inst_signals),
                    "win_rate": f"{win_rate(inst_signals)*100:.1f}%"
                }

        # Find mistakes
        missed_wins = [s for s in rejected if s.get("outcome") == "WIN"]
        bad_approvals = [s for s in approved if s.get("outcome") == "LOSS"]

        mistakes = {
            "missed_wins": [
                {
                    "ticker": s.get("ticker"),
                    "level": s.get("level"),
                    "session": s.get("session"),
                    "confidence": f"{s.get('confidence', 0)*100:.1f}%",
                    "rsi": s.get("rsi"),
                }
                for s in missed_wins[:5]  # Last 5
            ],
            "bad_approvals": [
                {
                    "ticker": s.get("ticker"),
                    "level": s.get("level"),
                    "session": s.get("session"),
                    "confidence": f"{s.get('confidence', 0)*100:.1f}%",
                    "rsi": s.get("rsi"),
                }
                for s in bad_approvals[:5]  # Last 5
            ],
        }

        # Recommendations
        recommendations = []
        if len(rejected) > 5 and rejected_wr > 0.5:
            recommendations.append("Model is rejecting too many winners - consider lowering threshold")
        if len(approved) > 5 and approved_wr < 0.5:
            recommendations.append("Approved signals losing - consider raising threshold or adding filters")

        return {
            "total_signals_with_outcomes": len(signals),
            "approved": {
                "count": len(approved),
                "win_rate": f"{approved_wr*100:.1f}%",
                "wins": sum(1 for s in approved if s.get("outcome") == "WIN"),
                "losses": sum(1 for s in approved if s.get("outcome") == "LOSS"),
            },
            "rejected": {
                "count": len(rejected),
                "win_rate": f"{rejected_wr*100:.1f}%",
                "note": "Lower is better - means we're right to reject",
            },
            "filter_edge": f"{(approved_wr - rejected_wr)*100:.1f}%",
            "by_level": level_stats,
            "by_session": session_stats,
            "by_instrument": instrument_stats,
            "recent_mistakes": mistakes,
            "recommendations": recommendations,
        }

    except Exception as e:
        return {"error": str(e)}


# ══════════════════════════════════════════════════════════════════════════════
# RETRAINING
# ══════════════════════════════════════════════════════════════════════════════

import threading
import subprocess

retrain_status = {
    "running": False,
    "last_run": None,
    "last_result": None,
    "last_error": None,
}

def run_retrain():
    """Run retraining in background thread."""
    global retrain_status, model
    retrain_status["running"] = True
    retrain_status["last_error"] = None

    try:
        # Run the retrain script
        result = subprocess.run(
            ["python", "-m", "ml-api-deploy.retrain_from_live"],
            cwd=Path(__file__).parent.parent,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
        )

        if result.returncode == 0:
            retrain_status["last_result"] = "success"
            # Reload the model
            load_model()
            print("Model reloaded after retraining")
        else:
            retrain_status["last_result"] = "failed"
            retrain_status["last_error"] = result.stderr[-500:] if result.stderr else "Unknown error"

    except subprocess.TimeoutExpired:
        retrain_status["last_result"] = "timeout"
        retrain_status["last_error"] = "Retraining took too long (>5 min)"
    except Exception as e:
        retrain_status["last_result"] = "error"
        retrain_status["last_error"] = str(e)
    finally:
        retrain_status["running"] = False
        retrain_status["last_run"] = datetime.utcnow().isoformat()


@app.post("/retrain")
async def trigger_retrain(request: Request):
    """
    Trigger model retraining from live Supabase data.

    This runs in the background and reloads the model when complete.
    Check /retrain-status for progress.

    Security: Requires RETRAIN_SECRET header to prevent abuse.
    """
    # Simple auth check
    secret = os.getenv("RETRAIN_SECRET", "")
    if secret:
        provided = request.headers.get("X-Retrain-Secret", "")
        if provided != secret:
            raise HTTPException(status_code=403, detail="Invalid retrain secret")

    if retrain_status["running"]:
        return JSONResponse({
            "status": "already_running",
            "message": "Retraining is already in progress",
        })

    # Start retraining in background
    thread = threading.Thread(target=run_retrain, daemon=True)
    thread.start()

    return JSONResponse({
        "status": "started",
        "message": "Retraining started in background. Check /retrain-status for progress.",
    })


@app.get("/retrain-status")
async def get_retrain_status():
    """Check the status of the last retraining job."""
    return {
        "running": retrain_status["running"],
        "last_run": retrain_status["last_run"],
        "last_result": retrain_status["last_result"],
        "last_error": retrain_status["last_error"],
        "model_loaded": model is not None,
    }


# ══════════════════════════════════════════════════════════════════════════════
# RUN
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
