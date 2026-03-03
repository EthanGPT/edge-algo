# Edge Algo — AI Native Hedge Fund Roadmap

## Phase 1: Foundation (Current)
- [x] KLBS backtest engine with verified results
- [x] Fee-inclusive P&L calculations
- [x] Performance analytics (by level, session, day, month)
- [x] Web dashboard for results tracking
- [ ] Live paper trading validation

## Phase 2: Execution Infrastructure
- [ ] Real-time data feeds (Databento, Polygon, or direct CME)
- [ ] Broker integration (Interactive Brokers / TradeStation API)
- [ ] Order execution engine with retry logic
- [ ] Position management system
- [ ] Risk limits and circuit breakers

## Phase 3: Sentiment Integration
- [ ] News sentiment pipeline (financial news, social media)
- [ ] ML sentiment scoring model
- [ ] Sentiment-based signal filtering
- [ ] Regime detection (trending vs ranging markets)
- [ ] Dynamic position sizing based on conviction

## Phase 4: Automation & Monitoring
- [ ] Fully automated trade execution
- [ ] Real-time P&L dashboard
- [ ] Alerting system (Telegram/Discord/SMS)
- [ ] Trade journaling automation
- [ ] Performance attribution analytics

## Phase 5: Scale
- [ ] Multi-instrument expansion (CL, GC, ES, NQ full size)
- [ ] Capital allocation optimization
- [ ] Investor reporting infrastructure
- [ ] Compliance & audit trails
- [ ] Fund structure (if applicable)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Data | Databento, Polygon.io |
| Backtest | Python, Pandas, NumPy |
| ML/Sentiment | Python, PyTorch/sklearn |
| Execution | Python, IBKR API |
| Frontend | React, TypeScript, Tailwind |
| Database | Supabase (PostgreSQL) |
| Infra | AWS/GCP, Docker |

---

## Key Metrics Target

| Metric | Backtest | Live Target |
|--------|----------|-------------|
| Win Rate | 60.5% | 55%+ |
| Sharpe | 4.97 | 2.5+ |
| Max DD | $6.1K | <$15K |
| Annual Return | $167K | $100K+ |

*Conservative live targets account for slippage, execution variance, and regime changes.*

---

## Team

- **Trading & Strategy**: Market structure, KLBS edge, execution rules
- **ML & Engineering**: Sentiment analysis, infrastructure, automation


