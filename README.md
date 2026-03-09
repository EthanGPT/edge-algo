# Edge Algo

Quantitative futures trading system with ML-powered signal filtering and live learning.

## Live Site

Displays backtested and verified trading results with full transparency.

## Strategy Overview

KLBS trades key levels (PDH, PDL, PMH, PML, LPH, LPL) on CME Micro futures:
- **MNQ** — Micro Nasdaq
- **MES** — Micro S&P 500
- **MGC** — Micro Gold

### Performance (6.7 Years Backtested)
- **Net P&L:** $1.21M
- **Win Rate:** ~60%
- **Sharpe Ratio:** 4.17
- **All years profitable**

## Architecture

```
TradingView Alert
       ↓
ML Signal Filter API (Railway)
       ↓
   Approve/Reject
       ↓
TradersPost → Broker
       ↓
Outcome logged to Supabase
       ↓
ML learns from decisions
```

## Project Structure

```
edge-algo/
├── src/                        # React frontend
│   ├── components/ml/          # ML Learning dashboard
│   └── pages/BotAnalytics.tsx  # Analytics with ML tab
├── public/                     # Static assets & reports
├── klbs-backtest/              # Quantitative engine
│   ├── klbs_backtest.py        # Backtest script
│   ├── ml-api-deploy/          # ML Signal Filter API
│   │   ├── main.py             # FastAPI endpoints
│   │   ├── train_model.py      # Initial model training
│   │   ├── retrain_from_live.py # Live learning script
│   │   └── model.pkl           # Trained model
│   └── data/                   # Historical price data
├── supabase/                   # Database functions
└── .github/workflows/          # Automated retraining
```

## ML Signal Filter

The ML model filters incoming signals based on:
- Level type (PDH, PDL, PMH, PML, LPH, LPL)
- Session (London, NY)
- Technical indicators (RSI, RSI ROC, MACD, ADX, ATR%)
- Historical win rates

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | Receive TradingView signals |
| `/status` | GET | API status and config |
| `/learning-insights` | GET | ML decision analysis |
| `/retrain` | POST | Trigger model retraining |
| `/retrain-status` | GET | Check retrain progress |

### Live Learning

The model learns from its own decisions:
1. **Approved signals** — tracks actual W/L outcomes
2. **Rejected signals** — tracks hypothetical outcomes
3. **Compares** — calculates filter edge
4. **Retrains** — weekly auto-retrain via GitHub Actions

## Development

```bash
npm install
npm run dev
```

### Environment Variables

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_ML_API_URL=https://your-ml-api.railway.app
```

## Backtest

See [klbs-backtest/README.md](./klbs-backtest/README.md) for full documentation.

```bash
cd klbs-backtest
python klbs_backtest.py           # Run with fees
python klbs_backtest.py --no-fees # Run without fees
```

## ML Model Training

```bash
cd klbs-backtest

# Initial training (from backtest CSVs)
python -m ml-api-deploy.train_model

# Retrain from live data (Supabase)
python -m ml-api-deploy.retrain_from_live
```

## Deployment

**ML API (Railway):**
```bash
cd klbs-backtest/ml-api-deploy
railway up
```

**Frontend (Vercel/Netlify):**
```bash
npm run build
```

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **ML API:** Python, FastAPI, scikit-learn, GradientBoosting
- **Backtest:** Python, Pandas, Plotly
- **Data:** Databento CME Futures
- **Database:** Supabase (PostgreSQL)
- **Deployment:** Railway (API), GitHub Actions (cron)
