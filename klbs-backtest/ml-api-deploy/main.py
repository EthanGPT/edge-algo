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
    confidence_2x: float = 0.60  # 2 contracts at 60%+ confidence
    confidence_3x: float = 0.70  # 3 contracts at 70%+ confidence

    # TradersPost accounts with position limits
    accounts: List[Dict] = field(default_factory=lambda: [
        {
            "name": "Test v1",
            "webhook": os.getenv("TRADERSPOST_WEBHOOK_1", ""),
            "instruments": ["MES", "MNQ", "MGC"],
            "max_contracts": {"MES": 3, "MNQ": 3, "MGC": 3},  # No limits on test
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
                "macd": float(signal.get("macd", 0)),
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
    Extract 29 features matching the training script exactly.

    Features (29 total):
    - Level one-hot (6): PDH, PDL, PMH, PML, LPH, LPL
    - Direction one-hot (2): LONG, SHORT
    - Session one-hot (2): London, NY
    - Day of week one-hot (5): Mon-Fri
    - Hour normalized (1)
    - Instrument one-hot (3): MES, MNQ, MGC
    - RSI normalized (1)
    - RSI ROC normalized (1)
    - RSI balanced zone flag (1): 35-65
    - Momentum aligned flag (1): KEY insight
    - MACD bullish (1)
    - ADX normalized (1)
    - ADX strong trend flag (1): >25
    - ATR% normalized (1)
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

    # 6. Instrument one-hot (3 features) - MES/MNQ/MGC only
    instruments = ["MES", "MNQ", "MGC"]
    inst = signal.get("ticker", "MNQ")
    features.extend([1.0 if inst == i else 0.0 for i in instruments])

    # 7. Technical indicators
    rsi = float(signal.get("rsi", 50))
    rsi_roc = float(signal.get("rsi_roc", 0))
    macd = float(signal.get("macd", 0))
    adx = float(signal.get("adx", 25))
    atr_pct = float(signal.get("atr_pct", 0.5))

    # RSI normalized (1 feature)
    features.append(rsi / 100.0)

    # RSI ROC normalized (1 feature)
    features.append(np.clip(rsi_roc / 20.0, -1.0, 1.0))

    # RSI balanced zone (1 feature) - 35-65 is optimal
    features.append(1.0 if 35 <= rsi <= 65 else 0.0)

    # MOMENTUM ALIGNED (1 feature) - KEY INSIGHT FROM ANALYSIS
    # LONGs want RSI not falling hard, SHORTs want RSI not rising hard
    if is_long:
        momentum_aligned = 1.0 if rsi_roc >= -5 else 0.0
    else:
        momentum_aligned = 1.0 if rsi_roc <= 5 else 0.0
    features.append(momentum_aligned)

    # MACD bullish (1 feature)
    features.append(1.0 if macd > 0 else 0.0)

    # ADX normalized (1 feature)
    features.append(adx / 100.0)

    # ADX strong trend (1 feature)
    features.append(1.0 if adx > 25 else 0.0)

    # ATR% normalized (1 feature)
    features.append(min(atr_pct / 2.0, 1.0))

    # 8. Historical win rates (2 features) - REAL DATA from 9+ years
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

# ══════════════════════════════════════════════════════════════════════════════
# RUN
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
