"""
KLBS Signal Filter Environment for Reinforcement Learning.

This environment presents KLBS signals one at a time, and the agent
decides whether to TAKE or SKIP each signal. Rewards are based on
the actual historical outcome of each signal.
"""

import gymnasium as gym
import numpy as np
import pandas as pd
from gymnasium import spaces
from typing import Optional, Tuple, Dict, Any

from ..features.market_features import MarketFeatureExtractor
from ..features.time_features import TimeFeatureEncoder
from ..features.sentiment_features import SentimentFeatureProvider


class KLBSSignalFilterEnv(gym.Env):
    """
    Gymnasium environment for KLBS signal filtering.

    Observation: Feature vector combining market context, time features,
                 recent performance, and sentiment scores.
    Action: Binary (0=SKIP, 1=TAKE) or continuous confidence score.
    Reward: Based on actual trade outcome from historical data.
    """

    metadata = {"render_modes": ["human"]}

    # Level and direction mappings
    LEVELS = ["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]
    DIRECTIONS = ["LONG", "SHORT"]
    INSTRUMENTS = ["MNQ", "MES", "MGC", "M2K", "ZN", "ZB", "6E", "6J"]
    SESSIONS = ["London", "NY"]
    DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

    def __init__(
        self,
        signals_df: pd.DataFrame,
        ohlc_data: Dict[str, pd.DataFrame],
        sentiment_provider: Optional[SentimentFeatureProvider] = None,
        lookback_bars: int = 10,
        reward_scheme: str = "asymmetric",
        continuous_action: bool = False,
        normalize_pnl: bool = True,
    ):
        """
        Args:
            signals_df: DataFrame with columns [date, level, direction, instrument,
                        session, outcome, pnl_usd, pnl_pts, entry, tp, sl, ...]
            ohlc_data: Dict mapping instrument -> DataFrame with OHLC data
            sentiment_provider: Optional sentiment feature provider
            lookback_bars: Number of bars to include in observation
            reward_scheme: 'asymmetric' (penalize missed wins less) or 'symmetric'
            continuous_action: If True, action is confidence [0,1] instead of binary
            normalize_pnl: If True, normalize PnL values for reward calculation
        """
        super().__init__()

        self.signals_df = signals_df.reset_index(drop=True)
        self.ohlc_data = ohlc_data
        self.sentiment_provider = sentiment_provider
        self.lookback_bars = lookback_bars
        self.reward_scheme = reward_scheme
        self.continuous_action = continuous_action
        self.normalize_pnl = normalize_pnl

        # Feature extractors
        self.market_extractor = MarketFeatureExtractor(lookback_bars=lookback_bars)
        self.time_encoder = TimeFeatureEncoder()

        # Calculate normalization stats
        if normalize_pnl:
            self.pnl_std = self.signals_df["pnl_usd"].std()
            self.pnl_mean = self.signals_df["pnl_usd"].mean()
        else:
            self.pnl_std = 1.0
            self.pnl_mean = 0.0

        # Define observation space
        self.obs_dim = self._calculate_obs_dim()
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(self.obs_dim,), dtype=np.float32
        )

        # Define action space
        if continuous_action:
            self.action_space = spaces.Box(low=0, high=1, shape=(1,), dtype=np.float32)
        else:
            self.action_space = spaces.Discrete(2)  # 0=SKIP, 1=TAKE

        # Episode state
        self.current_idx = 0
        self.episode_signals_taken = 0
        self.episode_pnl = 0.0
        self.recent_outcomes = []  # Track last N outcomes for features

    def _calculate_obs_dim(self) -> int:
        """Calculate total observation dimension."""
        dim = 0
        dim += len(self.LEVELS)  # Level one-hot
        dim += len(self.DIRECTIONS)  # Direction one-hot
        dim += len(self.INSTRUMENTS)  # Instrument one-hot
        dim += len(self.SESSIONS)  # Session one-hot
        dim += len(self.DAYS)  # Day of week one-hot
        dim += 2  # Hour (sin, cos encoding)
        dim += 1  # Minutes into session (normalized)
        dim += 5  # Market features (ATR, trend, volume, etc.)
        dim += self.lookback_bars * 4  # OHLC normalized
        dim += self.lookback_bars  # Bar ranges
        dim += 3  # Recent performance (win rate, avg pnl, consecutive losses)
        dim += 4  # Sentiment features
        return dim

    def reset(
        self, seed: Optional[int] = None, options: Optional[dict] = None
    ) -> Tuple[np.ndarray, dict]:
        """Reset environment to start of episode."""
        super().reset(seed=seed)

        if options and "start_idx" in options:
            self.current_idx = options["start_idx"]
        else:
            self.current_idx = 0

        self.episode_signals_taken = 0
        self.episode_pnl = 0.0
        self.recent_outcomes = []

        obs = self._get_observation()
        info = {"signal_idx": self.current_idx}

        return obs, info

    def step(self, action: Any) -> Tuple[np.ndarray, float, bool, bool, dict]:
        """
        Take action on current signal.

        Args:
            action: 0 (SKIP) or 1 (TAKE), or continuous [0,1] confidence

        Returns:
            observation, reward, terminated, truncated, info
        """
        signal = self.signals_df.iloc[self.current_idx]

        # Convert continuous action to decision if needed
        if self.continuous_action:
            confidence = float(action[0])
            take_signal = confidence >= 0.5
        else:
            take_signal = bool(action)
            confidence = 1.0 if take_signal else 0.0

        # Get actual outcome
        outcome = signal["outcome"]  # WIN, LOSS, BE
        pnl = signal["pnl_usd"]
        pnl_normalized = (pnl - self.pnl_mean) / (self.pnl_std + 1e-8)

        # Calculate reward
        reward = self._calculate_reward(take_signal, outcome, pnl_normalized)

        # Update episode stats
        if take_signal:
            self.episode_signals_taken += 1
            self.episode_pnl += pnl
            self.recent_outcomes.append(outcome)
        else:
            self.recent_outcomes.append(None)  # Skipped

        # Keep only last 10 outcomes
        if len(self.recent_outcomes) > 10:
            self.recent_outcomes.pop(0)

        # Move to next signal
        self.current_idx += 1
        terminated = self.current_idx >= len(self.signals_df)
        truncated = False

        # Get next observation
        if not terminated:
            obs = self._get_observation()
        else:
            obs = np.zeros(self.obs_dim, dtype=np.float32)

        info = {
            "signal": {
                "level": signal["level"],
                "direction": signal["direction"],
                "instrument": signal.get("instrument", "MNQ"),
                "outcome": outcome,
                "pnl_usd": pnl,
            },
            "action_taken": take_signal,
            "confidence": confidence,
            "episode_pnl": self.episode_pnl,
            "signals_taken": self.episode_signals_taken,
        }

        return obs, reward, terminated, truncated, info

    def _calculate_reward(
        self, take_signal: bool, outcome: str, pnl_normalized: float
    ) -> float:
        """
        Calculate reward based on action and outcome.

        Asymmetric scheme: penalize missed winners less than taking losers.
        This encourages the agent to be selective but not overly conservative.
        """
        if self.reward_scheme == "asymmetric":
            if take_signal:
                if outcome == "WIN":
                    return 1.0 + 0.5 * max(0, pnl_normalized)
                elif outcome == "LOSS":
                    return -1.0 + 0.5 * min(0, pnl_normalized)
                else:  # BE
                    return -0.1  # Small penalty for opportunity cost

            else:  # SKIP
                if outcome == "WIN":
                    return -0.3 * max(0, pnl_normalized)  # Mild penalty
                elif outcome == "LOSS":
                    return 0.5  # Reward for avoiding loss
                else:  # BE
                    return 0.0

        else:  # symmetric
            if take_signal:
                return pnl_normalized
            else:
                return -0.1 * pnl_normalized  # Opportunity cost

    def _get_observation(self) -> np.ndarray:
        """Build observation vector for current signal."""
        signal = self.signals_df.iloc[self.current_idx]
        features = []

        # 1. Level one-hot
        level_idx = (
            self.LEVELS.index(signal["level"]) if signal["level"] in self.LEVELS else 0
        )
        level_onehot = np.zeros(len(self.LEVELS), dtype=np.float32)
        level_onehot[level_idx] = 1.0
        features.append(level_onehot)

        # 2. Direction one-hot
        dir_idx = (
            self.DIRECTIONS.index(signal["direction"])
            if signal["direction"] in self.DIRECTIONS
            else 0
        )
        dir_onehot = np.zeros(len(self.DIRECTIONS), dtype=np.float32)
        dir_onehot[dir_idx] = 1.0
        features.append(dir_onehot)

        # 3. Instrument one-hot
        inst = signal.get("instrument", "MNQ")
        inst_idx = self.INSTRUMENTS.index(inst) if inst in self.INSTRUMENTS else 0
        inst_onehot = np.zeros(len(self.INSTRUMENTS), dtype=np.float32)
        inst_onehot[inst_idx] = 1.0
        features.append(inst_onehot)

        # 4. Session one-hot
        sess = signal.get("session", "NY")
        sess_idx = self.SESSIONS.index(sess) if sess in self.SESSIONS else 0
        sess_onehot = np.zeros(len(self.SESSIONS), dtype=np.float32)
        sess_onehot[sess_idx] = 1.0
        features.append(sess_onehot)

        # 5. Day of week one-hot
        day = signal.get("day_of_week", "Monday")
        day_idx = self.DAYS.index(day) if day in self.DAYS else 0
        day_onehot = np.zeros(len(self.DAYS), dtype=np.float32)
        day_onehot[day_idx] = 1.0
        features.append(day_onehot)

        # 6. Time features
        time_feats = self.time_encoder.encode(signal)
        features.append(time_feats)

        # 7. Market features (ATR, trend, volume, distance from level)
        instrument = signal.get("instrument", "MNQ")
        signal_time = pd.Timestamp(signal["date"])
        if instrument in self.ohlc_data:
            market_feats = self.market_extractor.extract(
                self.ohlc_data[instrument], signal_time, signal.get("level_price")
            )
        else:
            market_feats = np.zeros(5 + self.lookback_bars * 5, dtype=np.float32)
        features.append(market_feats)

        # 8. Recent performance features
        perf_feats = self._get_recent_performance()
        features.append(perf_feats)

        # 9. Sentiment features
        if self.sentiment_provider is not None:
            sent_feats = self.sentiment_provider.get_features(instrument, signal_time)
        else:
            sent_feats = np.zeros(4, dtype=np.float32)
        features.append(sent_feats)

        return np.concatenate(features).astype(np.float32)

    def _get_recent_performance(self) -> np.ndarray:
        """Calculate recent trading performance features."""
        if not self.recent_outcomes:
            return np.array([0.5, 0.0, 0.0], dtype=np.float32)

        # Win rate of recent signals we took
        taken = [o for o in self.recent_outcomes if o is not None]
        if taken:
            wins = sum(1 for o in taken if o == "WIN")
            win_rate = wins / len(taken)
        else:
            win_rate = 0.5

        # Average PnL (use last N from signals_df)
        start_idx = max(0, self.current_idx - 10)
        recent_pnl = self.signals_df.iloc[start_idx : self.current_idx]["pnl_usd"]
        avg_pnl = recent_pnl.mean() if len(recent_pnl) > 0 else 0.0
        avg_pnl_norm = avg_pnl / (self.pnl_std + 1e-8)

        # Consecutive losses
        consec_losses = 0
        for o in reversed(taken):
            if o == "LOSS":
                consec_losses += 1
            else:
                break
        consec_losses_norm = min(consec_losses / 5.0, 1.0)

        return np.array([win_rate, avg_pnl_norm, consec_losses_norm], dtype=np.float32)

    def render(self, mode: str = "human"):
        """Render current state."""
        if mode == "human":
            signal = self.signals_df.iloc[self.current_idx]
            print(f"Signal {self.current_idx}: {signal['level']} {signal['direction']}")
            print(f"  Outcome: {signal['outcome']}, PnL: ${signal['pnl_usd']:.2f}")
            print(f"  Episode PnL: ${self.episode_pnl:.2f}")
