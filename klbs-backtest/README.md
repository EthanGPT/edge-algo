# KLBS Backtest

Key Level Breakout System — quantitative backtesting engine for CME Micro futures.

## Quick Start

```bash
python klbs_backtest.py           # Run with fees (~$1.50/contract)
python klbs_backtest.py --no-fees # Run without fees
python klbs_backtest.py --optimize # Full TP/SL/Trail optimization
python klbs_backtest.py --oos     # Out-of-sample forward test
```

## Strategy Parameters (Optimized)

| Instrument | TP (pts) | SL (pts) | Trail | Retest Zone | Point Value | Contracts |
|------------|----------|----------|-------|-------------|-------------|-----------|
| MNQ        | 35       | 50       | 5     | ±5 pts      | $2.00       | 4         |
| MES        | 25       | 25       | 5     | ±5 pts      | $5.00       | 4         |
| MGC        | 20       | 25       | 5     | ±3 pts      | $10.00      | 2         |

## Fees & Commissions

Default `INCLUDE_FEES = True` in config. Standard CME Micro rates:
- Commission: $0.52/side
- Exchange: $0.22/side
- NFA: $0.01/side
- **Round-trip: ~$1.50/contract**

Toggle with `--no-fees` flag or set `INCLUDE_FEES = False` in code.

## Strategy Logic

### Levels
- **PDH/PDL** — Previous Day High/Low
- **PMH/PML** — Pre-Market High/Low (04:30-09:30 ET)
- **LPH/LPL** — London Pre-Market High/Low (00:00-03:00 ET)

### Sessions
- **London:** 03:00-08:00 ET
- **New York:** 09:30-16:00 ET
- **Dead Zone:** 08:00-09:30 ET (retests disarm levels)

### Entry Rules
1. **Arm:** Previous candle fully through level (during session)
2. **Fire:** Price retests level within retest zone
3. **Lock:** Level locks after firing (one signal per level per day)
4. **No session direction lock** — can fire both long and short in same session

### Exit Rules
1. Initial SL at entry ± sl_pts
2. Trail activates when price reaches TP level
3. Trail follows best price by trail distance until stopped

## Data

6.7 years of Databento CME futures (15-min bars):
- `data/MNQ_15m.csv` — Micro Nasdaq
- `data/MES_15m.csv` — Micro S&P 500
- `data/MGC_15m.csv` — Micro Gold

## Outputs

- `outputs/klbs_{SYMBOL}_trades.csv` — Trade log with P&L
- `public/klbs_backtest_report.html` — Visual performance report

### Trade Log Columns
```
date, level, direction, entry, tp, sl, session, outcome,
exit_price, pnl_pts, pnl_usd_gross, fees_usd, pnl_usd,
bars_held, max_favorable_excursion, max_adverse_excursion
```

## Results Summary

- **Net P&L:** $1.21M (with fees)
- **Win Rate:** ~60%
- **Sharpe:** 4.17
- **Profit Factor:** 1.8+
- **Trades:** ~15,700
- **Data:** 6.7 years (all years profitable)

## File Structure

```
klbs-backtest/
├── klbs_backtest.py    # Main backtest engine
├── data/               # Historical price data
│   ├── MNQ_15m.csv
│   ├── MES_15m.csv
│   └── MGC_15m.csv
├── outputs/            # Trade CSVs
└── README.md
```
