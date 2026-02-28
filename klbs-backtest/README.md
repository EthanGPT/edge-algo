# KLBS Backtest & Webhook System

## Overview
Key Level Breakout System (KLBS) - backtesting engine and webhook integration for automated execution.

## Files

### Core Scripts
- **`klbs_backtest.py`** - Full historical backtesting engine
  - Processes 6.7 years of Databento CME data
  - Generates trade CSVs and HTML reports
  - Run: `python klbs_backtest.py`

- **`klbs_webhook.py`** - TradersPost webhook integration
  - Real-time signal processing for live/sim trading
  - Parses Pine Script alerts or processes bars directly
  - Run: `python klbs_webhook.py --symbol MNQ --test`

### Data
- `data/MNQ_15m.csv` - Micro Nasdaq 15-min bars
- `data/MES_15m.csv` - Micro S&P 500 15-min bars
- `data/MGC_15m.csv` - Micro Gold 15-min bars

### Outputs
- `outputs/klbs_*_trades_no_be.csv` - Trail Only mode trade logs (CURRENT)
- `outputs/klbs_*_trades_be.csv` - BE+Trail mode trade logs (legacy)
- `outputs/klbs_backtest_report.html` - Visual performance report

## Strategy Parameters

| Instrument | TP (pts) | SL (pts) | Retest Zone | Contracts |
|------------|----------|----------|-------------|-----------|
| MNQ        | 35       | 50       | 5 pts       | 4         |
| MES        | 25       | 25       | 5 pts       | 4         |
| MGC        | 20       | 25       | 3 pts       | 2         |

**Mode:** Trail Only (no breakeven) - triggers 5pt trailing stop at TP

## Key Logic
1. **Levels:** PDH, PDL, PMH, PML, LPH, LPL
2. **Sessions:** London 03:00-08:00 ET, NY 09:30-16:00 ET
3. **Dead Zone:** 08:00-09:30 ET (disarms levels)
4. **Arm:** Previous candle fully through level
5. **Fire:** Price retests level within retest zone
6. **Locks:** Level locks after firing (one signal per level per day)
7. **NO session direction lock** - can fire both long and short in same session

## TradersPost Integration

### Pine Script Alert Format
```
KLBS MNQ LONG PDH 18500.00 TP:18535.00 SL:18450.00
```

### Webhook Payload (sent to TradersPost)
```json
{
  "ticker": "MNQ1!",
  "action": "buy",
  "sentiment": "bullish",
  "price": 18500.00,
  "quantity": 4,
  "takeProfit": 18535.00,
  "stopLoss": 18450.00
}
```

### Environment Setup
```bash
export TRADERSPOST_WEBHOOK_URL="https://traderspost.io/trading/webhook/YOUR_ID"
python klbs_webhook.py --symbol MNQ --live
```

## Results Summary (Trail Only Mode)
- **Total P&L:** $1.21M
- **Win Rate:** 60.5%
- **Sharpe:** 4.17
- **Trades:** 15,751
- **Years:** 6.7 (all profitable)
