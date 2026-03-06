# KLBS Signal Filter - RL Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LIVE TRADING FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TradingView (Pine)    Python Signal Filter       TradersPost               │
│  ┌───────────────┐     ┌───────────────────┐     ┌──────────────┐          │
│  │ KLBS Signal   │────▶│ RL Confidence     │────▶│ Execute if   │          │
│  │ PDL LONG      │     │ Score: 0.78       │     │ score > 0.6  │          │
│  │ MNQ @ 21450   │     │                   │     │              │          │
│  └───────────────┘     │ Features:         │     └──────────────┘          │
│                        │ - Market context  │                                │
│                        │ - Sentiment: +0.3 │                                │
│                        │ - Volatility: med │                                │
│                        └───────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture Components

### 1. Observation Space (Features)

```python
observation = {
    # Signal Context (from KLBS)
    "level_type": one_hot(["PDH", "PDL", "PMH", "PML", "LPH", "LPL"]),  # 6
    "direction": one_hot(["LONG", "SHORT"]),                            # 2
    "instrument": one_hot(["MNQ", "MES", "MGC", "ZN", "ZB", "6E", "6J"]),# 7
    "session": one_hot(["London", "NY"]),                               # 2

    # Time Features
    "hour": normalized(0-23),                                           # 1
    "day_of_week": one_hot(["Mon", "Tue", "Wed", "Thu", "Fri"]),        # 5
    "minutes_into_session": normalized(0-360),                          # 1

    # Market Structure (lookback window)
    "atr_14": normalized,                                               # 1
    "atr_ratio": current_atr / avg_atr_20,                             # 1
    "trend_strength": normalized(-1 to 1),                              # 1
    "distance_from_level": (price - level) / atr,                       # 1
    "volume_ratio": current_vol / avg_vol_20,                          # 1

    # Price Action (last 10 bars)
    "ohlc_normalized": 10 bars * 4 values,                             # 40
    "bar_ranges": 10 bars normalized,                                   # 10

    # Recent Performance
    "last_5_signals_winrate": 0-1,                                      # 1
    "last_5_signals_avg_pnl": normalized,                               # 1
    "consecutive_losses": 0-10 capped,                                  # 1

    # Sentiment Features (NEWS SERVICE)
    "sentiment_score": -1 to 1,                                         # 1
    "sentiment_magnitude": 0 to 1,                                      # 1
    "news_volume_24h": normalized,                                      # 1
    "economic_calendar_weight": 0 to 1,                                 # 1
}
# Total: ~85 features
```

### 2. Action Space

Simple binary for signal filtering:

```python
action_space = Discrete(2)
# 0 = SKIP signal (don't trade)
# 1 = TAKE signal (execute trade)
```

Or continuous confidence:

```python
action_space = Box(low=0, high=1, shape=(1,))
# 0.0-0.3 = Strong skip
# 0.3-0.6 = Weak/uncertain
# 0.6-1.0 = Take signal
```

### 3. Reward Scheme

```python
class SignalFilterReward(RewardScheme):
    """
    Reward based on signal outcome with penalty for missed opportunities.
    """

    def calculate_reward(self, action, signal_outcome):
        # signal_outcome from historical data: WIN (+pnl), LOSS (-pnl), BE (0)

        if action == TAKE:
            if signal_outcome == WIN:
                return +1.0 * pnl_normalized  # Reward taking winners
            elif signal_outcome == LOSS:
                return -1.0 * abs(pnl_normalized)  # Penalize taking losers
            else:  # BE
                return -0.1  # Small penalty for breakeven (opportunity cost)

        else:  # SKIP
            if signal_outcome == WIN:
                return -0.3 * pnl_normalized  # Penalty for missing winners
            elif signal_outcome == LOSS:
                return +0.5  # Reward for avoiding losers
            else:
                return 0.0  # Neutral for skipping BE
```

### 4. Environment Structure

```python
class KLBSSignalFilterEnv(TradingEnvironment):
    """
    Episode = one trading day or N signals
    Step = one KLBS signal decision
    """

    def __init__(self, historical_signals_df, sentiment_service):
        self.signals = historical_signals_df
        self.sentiment = sentiment_service
        self.current_idx = 0

    def reset(self):
        self.current_idx = 0
        return self._get_observation(self.current_idx)

    def step(self, action):
        signal = self.signals.iloc[self.current_idx]

        # Get actual outcome from historical data
        outcome = signal['outcome']  # WIN, LOSS, BE
        pnl = signal['pnl_usd']

        # Calculate reward
        reward = self.reward_scheme.calculate(action, outcome, pnl)

        # Move to next signal
        self.current_idx += 1
        done = self.current_idx >= len(self.signals)

        obs = self._get_observation(self.current_idx) if not done else None

        return obs, reward, done, {"signal": signal, "action": action}
```

## Training Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRAINING DATA FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Historical Trades          Feature Engineering                  │
│  ┌──────────────┐           ┌──────────────────┐                │
│  │klbs_MNQ.csv  │──────────▶│ Market Features  │                │
│  │klbs_MES.csv  │           │ Time Features    │                │
│  │klbs_MGC.csv  │           │ Performance      │                │
│  └──────────────┘           └────────┬─────────┘                │
│                                      │                           │
│  Sentiment Data                      │                           │
│  ┌──────────────┐                    ▼                          │
│  │ News API     │──────────▶┌──────────────────┐                │
│  │ Economic Cal │           │ Combined Feature │                │
│  └──────────────┘           │ Vector (85 dim)  │                │
│                             └────────┬─────────┘                │
│                                      │                           │
│                                      ▼                           │
│                           ┌──────────────────┐                  │
│                           │  PPO/DQN Agent   │                  │
│                           │  (Ray RLlib)     │                  │
│                           └────────┬─────────┘                  │
│                                    │                             │
│                                    ▼                             │
│                           ┌──────────────────┐                  │
│                           │ Trained Policy   │                  │
│                           │ signal_filter.pt │                  │
│                           └──────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

## Walk-Forward Validation

```
2019 ──────────────────────────────────────────────────────▶ 2024

│◀──── Train ────▶│◀─ Test ─▶│
     2019-2020       2021 Q1

              │◀──── Train ────▶│◀─ Test ─▶│
                   2019-2021       2021 Q2

                        │◀──── Train ────▶│◀─ Test ─▶│
                             2019-2021       2021 Q3

... rolling forward through 2024
```

## Live Inference Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LIVE INFERENCE SERVICE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Webhook In          FastAPI Service           Webhook Out       │
│  ┌──────────┐       ┌───────────────┐        ┌──────────┐       │
│  │TradingView│──────▶│ /filter_signal │───────▶│TradersPost│     │
│  │ KLBS JSON │       │               │        │ (if pass) │      │
│  └──────────┘       │ 1. Parse      │        └──────────┘       │
│                     │ 2. Get market │                            │
│                     │ 3. Get sentiment                           │
│                     │ 4. Build obs  │                            │
│                     │ 5. RL predict │                            │
│                     │ 6. Forward/drop                            │
│                     └───────────────┘                            │
│                            │                                     │
│                     ┌──────▼──────┐                             │
│                     │ confidence  │                              │
│                     │ > 0.6 ?     │                              │
│                     └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

## Sentiment Service Integration

```python
class SentimentService:
    """
    Aggregates sentiment from multiple sources.
    """

    def __init__(self, news_api_key, economic_calendar_url):
        self.news_client = NewsAPIClient(news_api_key)
        self.econ_calendar = EconomicCalendar(economic_calendar_url)

    def get_sentiment(self, instrument: str, timestamp: datetime) -> dict:
        # Map instrument to relevant keywords
        keywords = {
            "MNQ": ["nasdaq", "tech stocks", "QQQ"],
            "MES": ["S&P 500", "SPY", "stock market"],
            "MGC": ["gold", "precious metals", "XAUUSD"],
            "ZN": ["treasury", "bonds", "interest rates", "fed"],
            "6E": ["euro", "EUR/USD", "ECB"],
        }

        # Get news sentiment
        news = self.news_client.get_articles(
            keywords=keywords[instrument],
            from_time=timestamp - timedelta(hours=24),
            to_time=timestamp
        )

        sentiment_score = self._analyze_sentiment(news)

        # Get economic calendar weight
        events = self.econ_calendar.get_events(
            date=timestamp.date(),
            currencies=self._get_currencies(instrument)
        )
        econ_weight = self._calculate_event_impact(events)

        return {
            "sentiment_score": sentiment_score,      # -1 to 1
            "sentiment_magnitude": abs(sentiment_score),
            "news_volume": len(news),
            "economic_weight": econ_weight           # 0 to 1
        }
```

## File Structure

```
klbs-backtest/ml/
├── ARCHITECTURE.md              # This file
├── environments/
│   ├── __init__.py
│   └── signal_filter_env.py     # TensorTrade environment
├── features/
│   ├── __init__.py
│   ├── market_features.py       # OHLC, ATR, volume features
│   ├── time_features.py         # Session, day, hour encoding
│   └── sentiment_features.py    # News/economic calendar
├── rewards/
│   ├── __init__.py
│   └── signal_reward.py         # Custom reward scheme
├── training/
│   ├── __init__.py
│   ├── train.py                 # Main training script
│   ├── walk_forward.py          # Walk-forward validation
│   └── hyperopt.py              # Optuna optimization
├── inference/
│   ├── __init__.py
│   └── filter_service.py        # FastAPI live service
├── data/
│   └── prepare_training_data.py # Feature engineering
└── configs/
    └── config.yaml              # Hyperparameters
```

## Key Metrics to Track

1. **Filter Effectiveness**
   - % of losing signals correctly skipped
   - % of winning signals correctly taken
   - False positive rate (skipped winners)
   - False negative rate (took losers)

2. **Portfolio Impact**
   - Net P&L with filter vs without
   - Sharpe ratio improvement
   - Max drawdown reduction
   - Win rate after filtering

3. **Model Quality**
   - OOS vs IS performance gap
   - Stability across walk-forward windows
   - Confidence calibration (predicted vs actual)

## Next Steps

1. [ ] Implement `signal_filter_env.py` with TensorTrade
2. [ ] Build feature engineering pipeline
3. [ ] Create sentiment service stub (mock for training)
4. [ ] Train initial PPO agent on 2019-2022 data
5. [ ] Validate on 2023-2024 OOS
6. [ ] Build FastAPI inference service
7. [ ] Integrate with existing webhook flow
