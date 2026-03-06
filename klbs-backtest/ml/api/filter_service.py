#!/usr/bin/env python3
"""
ML Signal Filter API

Receives webhooks from TradingView, makes ML-based decisions,
and forwards approved signals to TradersPost.

Deploy on Railway/Fly.io/Render for ~$5/month.

Usage:
    uvicorn ml.api.filter_service:app --host 0.0.0.0 --port 8000
"""

import os
import json
import httpx
import pickle
import numpy as np
from datetime import datetime, date
from pathlib import Path
from typing import Dict, Optional
from collections import defaultdict

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .config import config, get_config_summary, update_config
from .database import db

# ══════════════════════════════════════════════════════════════════════════════
# APP SETUP
# ══════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="KLBS ML Signal Filter",
    description="Filters KLBS signals using ML model before forwarding to TradersPost",
    version="1.0.0"
)

# ══════════════════════════════════════════════════════════════════════════════
# STATE TRACKING
# ══════════════════════════════════════════════════════════════════════════════

class TradingState:
    """Tracks daily trading state with Supabase persistence."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.current_date: Optional[date] = None
        self.trades_today: int = 0
        self.signals_received: int = 0
        self.signals_approved: int = 0
        self.signals_rejected: int = 0
        self.last_signal_id: Optional[int] = None  # For outcome tracking

    def new_day_check(self):
        """Reset counters if it's a new day."""
        today = date.today()
        if self.current_date != today:
            self.current_date = today
            self.trades_today = 0
            self.signals_received = 0
            self.signals_approved = 0
            self.signals_rejected = 0

            # Load today's stats from Supabase
            if db.enabled:
                stats = db.get_today_stats()
                self.trades_today = stats.get("trades_today", 0)

    @property
    def consecutive_losses(self) -> int:
        """Get consecutive losses from Supabase."""
        if db.enabled:
            return db.get_consecutive_losses()
        return 0

    @property
    def last_outcomes(self) -> list:
        """Get recent outcomes from Supabase."""
        if db.enabled:
            return db.get_recent_outcomes(10)
        return []


state = TradingState()

# ══════════════════════════════════════════════════════════════════════════════
# MODEL LOADING
# ══════════════════════════════════════════════════════════════════════════════

MODEL_PATH = Path(__file__).parent.parent / "models" / "signal_filter_v2.pkl"
model = None

def load_model():
    """Load the trained ML model."""
    global model
    if MODEL_PATH.exists():
        with open(MODEL_PATH, "rb") as f:
            model = pickle.load(f)
        print(f"Model loaded from {MODEL_PATH}")
    else:
        print(f"WARNING: Model not found at {MODEL_PATH}")
        print("Run train_and_save_model() first!")


@app.on_event("startup")
async def startup():
    load_model()
    print("ML Signal Filter started")
    print(f"Config: {get_config_summary()}")


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def extract_features(signal: Dict) -> np.ndarray:
    """
    Extract features from incoming signal for ML prediction.
    Must match the features used in training!
    """
    features = []

    # 1. Level type (one-hot, 6 features)
    levels = ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]
    level = signal.get("level", "PDL")
    features.extend([1.0 if level == l else 0.0 for l in levels])

    # 2. Direction (one-hot, 2 features)
    action = signal.get("action", "buy")
    features.append(1.0 if action == "buy" else 0.0)
    features.append(1.0 if action == "sell" else 0.0)

    # 3. Session (one-hot, 2 features)
    session = signal.get("session", "NY")
    features.append(1.0 if session == "London" else 0.0)
    features.append(1.0 if session == "NY" else 0.0)

    # 4. Day of week (one-hot, 5 features)
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    try:
        signal_time = datetime.fromisoformat(signal.get("time", "").replace("Z", "+00:00"))
        day = signal_time.strftime("%A")
    except:
        day = datetime.now().strftime("%A")
    features.extend([1.0 if day == d else 0.0 for d in days])

    # 5. Hour (normalized, 1 feature)
    try:
        hour = signal_time.hour
    except:
        hour = 12
    features.append(hour / 24.0)

    # 6. Instrument (one-hot, 3 features - MES, MNQ, MGC only)
    instruments = ["MNQ", "MES", "MGC"]
    inst = signal.get("ticker", "MNQ")
    features.extend([1.0 if inst == i else 0.0 for i in instruments])

    # 7. Technical indicators (7 features)
    rsi = float(signal.get("rsi", 50))
    macd = float(signal.get("macd", 0))
    adx = float(signal.get("adx", 25))
    atr_pct = float(signal.get("atr_pct", 0.5))

    features.append(rsi / 100.0)  # RSI normalized
    features.append(1.0 if rsi > 70 else 0.0)  # RSI overbought
    features.append(1.0 if rsi < 30 else 0.0)  # RSI oversold
    features.append(1.0 if macd > 0 else 0.0)  # MACD bullish
    features.append(adx / 100.0)  # ADX normalized
    features.append(min(atr_pct / 2.0, 1.0))  # ATR% normalized
    features.append(0.5)  # Turbulence placeholder (would need historical data)

    # 8. Rolling context (5 features) - use state tracking
    recent_wr = 0.5
    if len(state.last_outcomes) > 0:
        recent_wr = sum(state.last_outcomes[-10:]) / len(state.last_outcomes[-10:])

    features.append(recent_wr)  # Recent win rate
    features.append(min(state.consecutive_losses / 5.0, 1.0))  # Consecutive losses
    features.append(0.5)  # Level win rate (placeholder)
    features.append(0.5)  # Session win rate (placeholder)
    features.append(min(state.trades_today / 10.0, 1.0))  # Trade frequency

    return np.array(features, dtype=np.float32)


# ══════════════════════════════════════════════════════════════════════════════
# SIGNAL FILTERING LOGIC
# ══════════════════════════════════════════════════════════════════════════════

def should_take_signal(signal: Dict) -> tuple[bool, str, float]:
    """
    Decide whether to take a signal.

    Returns:
        (approved, reason, confidence)
    """
    state.new_day_check()
    state.signals_received += 1

    ticker = signal.get("ticker", "")
    session = signal.get("session", "")

    # 1. Check if instrument is enabled
    if ticker not in config.enabled_instruments:
        return False, f"Instrument {ticker} not enabled", 0.0

    # 2. Check if session is enabled
    if session not in config.enabled_sessions:
        return False, f"Session {session} not enabled", 0.0

    # 3. Check daily trade limit
    if state.trades_today >= config.max_trades_per_day:
        return False, f"Daily limit reached ({config.max_trades_per_day})", 0.0

    # 4. Check consecutive losses
    if state.consecutive_losses >= config.max_consecutive_losses:
        return False, f"Consecutive losses ({state.consecutive_losses}), pausing", 0.0

    # 5. Check ATR% (volatility filter)
    atr_pct = float(signal.get("atr_pct", 0))
    if atr_pct > config.max_atr_pct:
        return False, f"ATR% too high ({atr_pct:.2f}% > {config.max_atr_pct}%)", 0.0

    # 6. Check RSI extremes
    rsi = float(signal.get("rsi", 50))
    action = signal.get("action", "buy")

    if action == "buy" and rsi > config.rsi_overbought:
        return False, f"RSI overbought ({rsi:.1f}), skip long", 0.0
    if action == "sell" and rsi < config.rsi_oversold:
        return False, f"RSI oversold ({rsi:.1f}), skip short", 0.0

    # 7. ML Model prediction
    if model is None:
        return False, "Model not loaded", 0.0

    features = extract_features(signal)
    prob = model.predict_proba(features.reshape(1, -1))[0, 1]

    if prob < config.threshold:
        return False, f"Confidence too low ({prob:.1%} < {config.threshold:.0%})", prob

    # All checks passed!
    return True, "Approved", prob


# ══════════════════════════════════════════════════════════════════════════════
# API ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

class SignalPayload(BaseModel):
    """Expected signal format from TradingView."""
    ticker: str
    action: str
    level: str
    price: float
    session: str
    rsi: float
    macd: float
    macd_signal: float
    adx: float
    atr_pct: float
    time: str
    interval: str


@app.post("/webhook")
async def receive_signal(request: Request):
    """
    Main webhook endpoint.
    Receives signals from TradingView - handles both entry signals AND outcome alerts.

    Entry signal: {"ticker": "MNQ", "action": "buy", "level": "PDH", ...}
    Outcome alert: {"type": "outcome", "ticker": "MNQ", "level": "PDH", "outcome": "WIN", ...}
    """
    try:
        payload = await request.json()
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Check if this is an outcome message (TP/SL hit)
    if payload.get("type") == "outcome":
        # Route to outcome handler
        outcome = payload.get("outcome", "").upper()
        ticker = payload.get("ticker")
        level = payload.get("level")
        pnl = payload.get("pnl")

        if outcome not in ["WIN", "LOSS", "BE"]:
            return JSONResponse({"error": "Invalid outcome"}, status_code=400)

        signal_id = db.update_outcome_by_ticker_level(ticker, level, outcome, pnl)

        consecutive = state.consecutive_losses
        print(f"Outcome received: {ticker} {level} = {outcome} | Consecutive losses: {consecutive}")

        return JSONResponse({
            "status": "outcome_recorded",
            "ticker": ticker,
            "level": level,
            "outcome": outcome,
            "signal_id": signal_id,
            "consecutive_losses": consecutive,
        })

    # Otherwise, it's an entry signal - make ML decision
    approved, reason, confidence = should_take_signal(payload)

    # Log decision
    log_entry = {
        "time": datetime.now().isoformat(),
        "ticker": payload.get("ticker"),
        "action": payload.get("action"),
        "level": payload.get("level"),
        "approved": approved,
        "reason": reason,
        "confidence": f"{confidence:.1%}" if confidence > 0 else "N/A",
        "trades_today": state.trades_today,
    }
    print(f"Signal: {json.dumps(log_entry)}")

    if approved:
        state.signals_approved += 1
        state.trades_today += 1

        # Forward to TradersPost accounts that allow this instrument
        ticker = payload.get("ticker", "")
        tp_payload = {
            "ticker": ticker,
            "action": payload.get("action"),
            "price": payload.get("price"),
        }

        # Send to each account that allows this instrument
        log_entry["accounts_sent"] = []
        async with httpx.AsyncClient() as client:
            for account in config.accounts:
                # Skip if account doesn't trade this instrument
                if ticker not in account.get("instruments", []):
                    log_entry["accounts_sent"].append({
                        "name": account.get("name"),
                        "skipped": f"{ticker} not allowed"
                    })
                    continue

                webhook_url = account.get("webhook", "")
                if not webhook_url:
                    continue

                try:
                    resp = await client.post(webhook_url, json=tp_payload, timeout=10.0)
                    log_entry["accounts_sent"].append({
                        "name": account.get("name"),
                        "status": resp.status_code
                    })
                except Exception as e:
                    log_entry["accounts_sent"].append({
                        "name": account.get("name"),
                        "error": str(e)
                    })

        sent_count = len([a for a in log_entry["accounts_sent"] if "status" in a])

        # Log to Supabase
        accounts_sent_names = [a.get("name") for a in log_entry["accounts_sent"] if "status" in a]
        signal_id = db.log_signal(payload, approved=True, reason=reason,
                                  confidence=confidence, accounts_sent=accounts_sent_names)
        state.last_signal_id = signal_id

        return JSONResponse({
            "status": "approved",
            "reason": reason,
            "confidence": f"{confidence:.1%}",
            "trades_today": state.trades_today,
            "accounts_sent": sent_count,
            "details": log_entry["accounts_sent"],
            "signal_id": signal_id,  # Use this to report outcome later
        })
    else:
        state.signals_rejected += 1

        # Log rejected signal to Supabase too
        db.log_signal(payload, approved=False, reason=reason, confidence=confidence)

        return JSONResponse({
            "status": "rejected",
            "reason": reason,
            "confidence": f"{confidence:.1%}" if confidence > 0 else "N/A",
        })


@app.post("/outcome")
async def record_outcome(request: Request):
    """
    Record trade outcome (for tracking consecutive losses).
    Call this after trade closes.

    Two formats supported:

    1. By signal_id (from webhook response):
    POST /outcome
    {
        "signal_id": 123,
        "outcome": "WIN",  // WIN, LOSS, or BE
        "pnl": 150.00
    }

    2. By ticker+level (from TradingView exit alerts):
    POST /outcome
    {
        "type": "outcome",
        "ticker": "MNQ",
        "level": "PDH",
        "outcome": "WIN",
        "entry": 22500.00,
        "exit": 22550.00,
        "pnl": 100.00,
        "time": "2025-01-15T12:30:00Z"
    }
    """
    try:
        payload = await request.json()
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    outcome = payload.get("outcome", "").upper()
    pnl = payload.get("pnl")

    if outcome not in ["WIN", "LOSS", "BE"]:
        return JSONResponse({"error": "outcome must be WIN, LOSS, or BE"}, status_code=400)

    # Determine update method: by signal_id or by ticker+level
    signal_id = payload.get("signal_id")
    ticker = payload.get("ticker")
    level = payload.get("level")

    if signal_id:
        # Update by signal_id
        db.update_outcome(signal_id, outcome, pnl)
        log_entry = {"method": "signal_id", "signal_id": signal_id}
    elif ticker and level:
        # Update by ticker+level (from TradingView exit alert)
        signal_id = db.update_outcome_by_ticker_level(ticker, level, outcome, pnl)
        log_entry = {"method": "ticker_level", "ticker": ticker, "level": level, "signal_id": signal_id}
        if not signal_id:
            return JSONResponse({
                "status": "not_found",
                "message": f"No pending signal found for {ticker} {level}",
            }, status_code=404)
    elif state.last_signal_id:
        # Fallback to last signal
        signal_id = state.last_signal_id
        db.update_outcome(signal_id, outcome, pnl)
        log_entry = {"method": "last_signal", "signal_id": signal_id}
    else:
        return JSONResponse({
            "error": "Must provide signal_id, ticker+level, or have a recent signal"
        }, status_code=400)

    # Log the outcome
    print(f"Outcome: {outcome} | {log_entry}")

    # Get updated stats
    consecutive = state.consecutive_losses
    recent_outcomes = state.last_outcomes
    recent_wr = sum(recent_outcomes) / len(recent_outcomes) if recent_outcomes else 0

    return JSONResponse({
        "status": "recorded",
        "outcome": outcome,
        "signal_id": signal_id,
        "consecutive_losses": consecutive,
        "recent_win_rate": f"{recent_wr:.1%}",
    })


@app.get("/status")
async def get_status():
    """Get current filter status."""
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
    }


@app.post("/config")
async def update_config_endpoint(request: Request):
    """
    Update config at runtime.

    Example: POST /config {"threshold": 0.65, "max_trades_per_day": 3}
    """
    try:
        payload = await request.json()
        update_config(**payload)
        return {"status": "updated", "config": get_config_summary()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/")
async def root():
    """Health check."""
    return {"status": "running", "service": "KLBS ML Signal Filter"}


# ══════════════════════════════════════════════════════════════════════════════
# RUN DIRECTLY
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
