# Edge Algo Algorithm

Quantitative futures trading system with verified backtested results.

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

## Project Structure

```
edge-algo/
├── src/                    # React frontend
├── public/                 # Static assets & reports
├── klbs-backtest/          # Quantitative backtest engine
│   ├── klbs_backtest.py    # Main backtest script
│   ├── data/               # Historical price data (Databento)
│   └── README.md           # Backtest documentation
└── supabase/               # Database functions
```

## Development

```bash
npm install
npm run dev
```

## Backtest

See [klbs-backtest/README.md](./klbs-backtest/README.md) for full documentation.

```bash
cd klbs-backtest
python klbs_backtest.py           # Run with fees
python klbs_backtest.py --no-fees # Run without fees
```

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, shadcn/ui
- **Backtest:** Python, Pandas, Plotly
- **Data:** Databento CME Futures
- **Database:** Supabase
