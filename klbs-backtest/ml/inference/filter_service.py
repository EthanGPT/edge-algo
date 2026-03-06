"""
Live Signal Filter Service.

FastAPI service that sits between TradingView webhooks and TradersPost.
Receives KLBS signals, scores them with the RL model, and forwards
high-confidence signals to TradersPost for execution.
"""

import os
import sys
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any
from dataclasses import dataclass, asdict

import numpy as np
import pandas as pd
import httpx

# Add parent for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from ml.environments import KLBSSignalFilterEnv
from ml.features import MarketFeatureExtractor, TimeFeatureEncoder, MockSentimentProvider

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class SignalInput:
    """Incoming signal from TradingView."""
    ticker: str
    action: str  # "buy" or "sell"
    price: float
    time: str
    interval: str
    level: Optional[str] = None  # PDH, PDL, PMH, PML, LPH, LPL


@dataclass
class FilterResult:
    """Result of signal filtering."""
    signal: SignalInput
    confidence: float
    action: str  # "TAKE" or "SKIP"
    reason: str
    timestamp: str


class SignalFilterService:
    """
    Service for filtering KLBS signals using trained RL model.

    Flow:
    1. Receive webhook from TradingView (KLBS signal)
    2. Build feature vector from market data + sentiment
    3. Score signal with RL model
    4. If confidence > threshold, forward to TradersPost
    5. Log all decisions for analysis
    """

    # Map TradingView actions to internal representation
    ACTION_MAP = {"buy": "LONG", "sell": "SHORT"}

    # Instrument to level mapping based on action
    # Highs (PDH, PMH, LPH) -> SHORT
    # Lows (PDL, PML, LPL) -> LONG
    LEVEL_DIRECTION = {
        "PDH": "SHORT", "PMH": "SHORT", "LPH": "SHORT",
        "PDL": "LONG", "PML": "LONG", "LPL": "LONG",
    }

    def __init__(
        self,
        model_path: Optional[str] = None,
        confidence_threshold: float = 0.6,
        traderspost_webhook_url: Optional[str] = None,
        ohlc_data_dir: str = "data",
        dry_run: bool = True,
    ):
        """
        Args:
            model_path: Path to trained model checkpoint
            confidence_threshold: Minimum confidence to forward signal
            traderspost_webhook_url: TradersPost webhook URL
            ohlc_data_dir: Directory with OHLC data for feature extraction
            dry_run: If True, don't actually forward signals
        """
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.traderspost_url = traderspost_webhook_url
        self.dry_run = dry_run

        # Feature extractors
        self.market_extractor = MarketFeatureExtractor(lookback_bars=10)
        self.time_encoder = TimeFeatureEncoder()
        self.sentiment_provider = MockSentimentProvider()

        # Load OHLC data
        self.ohlc_data = self._load_ohlc_data(ohlc_data_dir)

        # Load model
        self.model = self._load_model(model_path)

        # Decision log
        self.decisions: list[FilterResult] = []

        logger.info(f"SignalFilterService initialized")
        logger.info(f"  Model: {model_path or 'None (random baseline)'}")
        logger.info(f"  Threshold: {confidence_threshold}")
        logger.info(f"  Dry run: {dry_run}")

    def _load_ohlc_data(self, data_dir: str) -> Dict[str, pd.DataFrame]:
        """Load OHLC data for all instruments."""
        ohlc_data = {}
        data_path = Path(data_dir)

        if not data_path.exists():
            logger.warning(f"OHLC data directory not found: {data_dir}")
            return ohlc_data

        for filepath in data_path.glob("*_15m.csv"):
            instrument = filepath.stem.split("_")[0]
            try:
                df = pd.read_csv(filepath, parse_dates=["ts_event"])
                df = df.sort_values("ts_event").reset_index(drop=True)
                ohlc_data[instrument] = df
                logger.info(f"Loaded {instrument}: {len(df):,} bars")
            except Exception as e:
                logger.error(f"Failed to load {filepath}: {e}")

        return ohlc_data

    def _load_model(self, model_path: Optional[str]) -> Optional[Any]:
        """Load trained RL model."""
        if model_path is None:
            logger.warning("No model path provided, using random baseline")
            return None

        try:
            import ray
            from ray.rllib.algorithms.ppo import PPO

            ray.init(ignore_reinit_error=True)
            model = PPO.from_checkpoint(model_path)
            logger.info(f"Loaded model from {model_path}")
            return model

        except ImportError:
            logger.warning("Ray RLlib not available, using random baseline")
            return None
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return None

    def process_signal(self, signal_json: Dict[str, Any]) -> FilterResult:
        """
        Process incoming signal and decide whether to forward.

        Args:
            signal_json: JSON payload from TradingView webhook

        Returns:
            FilterResult with decision
        """
        # Parse signal
        signal = SignalInput(
            ticker=signal_json.get("ticker", ""),
            action=signal_json.get("action", ""),
            price=float(signal_json.get("price", 0)),
            time=signal_json.get("time", ""),
            interval=signal_json.get("interval", "15"),
            level=signal_json.get("level"),  # May be None
        )

        logger.info(f"Processing signal: {signal.ticker} {signal.action} @ {signal.price}")

        # Build observation
        obs = self._build_observation(signal)

        # Get model prediction
        if self.model is not None:
            action = self.model.compute_single_action(obs)
            # For continuous action space
            if isinstance(action, np.ndarray):
                confidence = float(action[0])
            else:
                confidence = 1.0 if action == 1 else 0.0
        else:
            # Random baseline for testing
            confidence = np.random.uniform(0.3, 0.8)

        # Make decision
        take_signal = confidence >= self.confidence_threshold

        result = FilterResult(
            signal=signal,
            confidence=confidence,
            action="TAKE" if take_signal else "SKIP",
            reason=self._get_reason(confidence, take_signal),
            timestamp=datetime.utcnow().isoformat(),
        )

        # Log decision
        self.decisions.append(result)
        logger.info(
            f"Decision: {result.action} (confidence={confidence:.2f}, "
            f"threshold={self.confidence_threshold})"
        )

        # Forward if taking signal
        if take_signal and not self.dry_run:
            self._forward_to_traderspost(signal_json)

        return result

    def _build_observation(self, signal: SignalInput) -> np.ndarray:
        """Build feature vector for model input."""
        features = []

        # Determine direction and level
        direction = self.ACTION_MAP.get(signal.action.lower(), "LONG")
        level = signal.level or self._infer_level(direction)

        # Level one-hot (6 levels)
        levels = ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]
        level_idx = levels.index(level) if level in levels else 0
        level_onehot = np.zeros(6, dtype=np.float32)
        level_onehot[level_idx] = 1.0
        features.append(level_onehot)

        # Direction one-hot (2)
        dir_onehot = np.array([1.0, 0.0] if direction == "LONG" else [0.0, 1.0], dtype=np.float32)
        features.append(dir_onehot)

        # Instrument one-hot (8)
        instruments = ["MNQ", "MES", "MGC", "M2K", "ZN", "ZB", "6E", "6J"]
        inst_idx = instruments.index(signal.ticker) if signal.ticker in instruments else 0
        inst_onehot = np.zeros(8, dtype=np.float32)
        inst_onehot[inst_idx] = 1.0
        features.append(inst_onehot)

        # Session one-hot (2)
        try:
            signal_time = pd.Timestamp(signal.time)
            hour = signal_time.hour
        except:
            hour = 12

        # London: 3-8, NY: 9:30-16
        if 3 <= hour < 8:
            session_onehot = np.array([1.0, 0.0], dtype=np.float32)
        else:
            session_onehot = np.array([0.0, 1.0], dtype=np.float32)
        features.append(session_onehot)

        # Day of week one-hot (5)
        try:
            day_idx = signal_time.dayofweek
        except:
            day_idx = 0
        day_onehot = np.zeros(5, dtype=np.float32)
        day_onehot[min(day_idx, 4)] = 1.0
        features.append(day_onehot)

        # Time features (3)
        time_signal = {"date": signal.time, "hour": hour}
        time_feats = self.time_encoder.encode(time_signal)
        features.append(time_feats)

        # Market features
        if signal.ticker in self.ohlc_data:
            try:
                signal_time = pd.Timestamp(signal.time)
                market_feats = self.market_extractor.extract(
                    self.ohlc_data[signal.ticker],
                    signal_time,
                    signal.price
                )
            except Exception as e:
                logger.warning(f"Market feature extraction failed: {e}")
                market_feats = np.zeros(5 + 10 * 5, dtype=np.float32)
        else:
            market_feats = np.zeros(5 + 10 * 5, dtype=np.float32)
        features.append(market_feats)

        # Recent performance features (3)
        perf_feats = np.array([0.5, 0.0, 0.0], dtype=np.float32)  # Neutral
        features.append(perf_feats)

        # Sentiment features (4)
        try:
            signal_time = pd.Timestamp(signal.time)
            sent_feats = self.sentiment_provider.get_features(signal.ticker, signal_time)
        except:
            sent_feats = np.zeros(4, dtype=np.float32)
        features.append(sent_feats)

        return np.concatenate(features).astype(np.float32)

    def _infer_level(self, direction: str) -> str:
        """Infer most likely level based on direction."""
        # Default to most common levels
        if direction == "LONG":
            return "PDL"
        else:
            return "PDH"

    def _get_reason(self, confidence: float, take: bool) -> str:
        """Generate human-readable reason for decision."""
        if take:
            if confidence >= 0.8:
                return "High confidence signal"
            elif confidence >= 0.6:
                return "Moderate confidence, above threshold"
            else:
                return "Marginal signal"
        else:
            if confidence < 0.3:
                return "Low confidence, poor setup"
            elif confidence < 0.5:
                return "Below threshold, weak signal"
            else:
                return "Near threshold, skipping for safety"

    def _forward_to_traderspost(self, signal_json: Dict[str, Any]):
        """Forward signal to TradersPost webhook."""
        if not self.traderspost_url:
            logger.warning("No TradersPost URL configured")
            return

        try:
            response = httpx.post(
                self.traderspost_url,
                json=signal_json,
                timeout=10.0,
            )
            logger.info(f"Forwarded to TradersPost: {response.status_code}")
        except Exception as e:
            logger.error(f"Failed to forward signal: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """Get filtering statistics."""
        if not self.decisions:
            return {"total": 0}

        total = len(self.decisions)
        taken = sum(1 for d in self.decisions if d.action == "TAKE")
        skipped = total - taken

        confidences = [d.confidence for d in self.decisions]

        return {
            "total": total,
            "taken": taken,
            "skipped": skipped,
            "take_rate": taken / total if total > 0 else 0,
            "avg_confidence": np.mean(confidences),
            "min_confidence": np.min(confidences),
            "max_confidence": np.max(confidences),
        }


# FastAPI Application
def create_app(
    model_path: Optional[str] = None,
    confidence_threshold: float = 0.6,
    traderspost_url: Optional[str] = None,
    dry_run: bool = True,
):
    """Create FastAPI application."""
    try:
        from fastapi import FastAPI, HTTPException
        from pydantic import BaseModel
    except ImportError:
        raise ImportError("FastAPI required. Install with: pip install fastapi uvicorn")

    app = FastAPI(
        title="KLBS Signal Filter",
        description="RL-based signal filtering for KLBS trading system",
        version="1.0.0",
    )

    # Initialize service
    service = SignalFilterService(
        model_path=model_path,
        confidence_threshold=confidence_threshold,
        traderspost_webhook_url=traderspost_url,
        dry_run=dry_run,
    )

    class WebhookPayload(BaseModel):
        ticker: str
        action: str
        price: str | float
        time: str
        interval: str = "15"
        level: Optional[str] = None

    @app.post("/webhook")
    async def receive_webhook(payload: WebhookPayload):
        """Receive signal from TradingView."""
        try:
            result = service.process_signal(payload.model_dump())
            return {
                "status": "processed",
                "action": result.action,
                "confidence": result.confidence,
                "reason": result.reason,
            }
        except Exception as e:
            logger.error(f"Error processing webhook: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/stats")
    async def get_stats():
        """Get filtering statistics."""
        return service.get_stats()

    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy", "model_loaded": service.model is not None}

    @app.get("/decisions")
    async def get_decisions(limit: int = 50):
        """Get recent decisions."""
        decisions = service.decisions[-limit:]
        return [asdict(d) for d in decisions]

    return app


def run_server(
    host: str = "0.0.0.0",
    port: int = 8000,
    model_path: Optional[str] = None,
    confidence_threshold: float = 0.6,
    traderspost_url: Optional[str] = None,
    dry_run: bool = True,
):
    """Run the FastAPI server."""
    try:
        import uvicorn
    except ImportError:
        raise ImportError("Uvicorn required. Install with: pip install uvicorn")

    app = create_app(
        model_path=model_path,
        confidence_threshold=confidence_threshold,
        traderspost_url=traderspost_url,
        dry_run=dry_run,
    )

    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="KLBS Signal Filter Service")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind")
    parser.add_argument("--model", help="Path to model checkpoint")
    parser.add_argument("--threshold", type=float, default=0.6, help="Confidence threshold")
    parser.add_argument("--traderspost-url", help="TradersPost webhook URL")
    parser.add_argument("--live", action="store_true", help="Enable live forwarding")
    args = parser.parse_args()

    run_server(
        host=args.host,
        port=args.port,
        model_path=args.model,
        confidence_threshold=args.threshold,
        traderspost_url=args.traderspost_url,
        dry_run=not args.live,
    )
