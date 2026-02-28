# The Key Level Breakout System (KLBS)

## Edge Trading — Full Strategy Guide

---

## Overview

The Key Level Breakout System is a liquidity-based futures strategy built on the 6 most important intraday price levels. This mechanical approach removes emotional decision-making and provides clear, repeatable entries with defined risk.

### Verified Backtest Results (Level Locks Only, Trail Only Mode)

| Metric | Value |
|--------|-------|
| **Total P&L** | $1,207,416 |
| **Return on $100K** | +1,207% |
| **Total Trades** | 15,751 |
| **Win Rate** | 60.5% |
| **Profit Factor** | 1.45 |
| **Max Drawdown** | $7,500 |
| **Years of Data** | 6.7 Years |
| **Profitable Years** | 8/8 |
| **Avg Yearly P&L** | $180,000 |
| **Sharpe Ratio** | 4.35 |

**Contract Allocation:** 4 MNQ + 4 MES + 2 MGC (Low Risk)
**Mode:** Level locks only (no session direction lock), Trail Only (no breakeven)

---

## The 6 Key Levels

These are the only levels we trade. Every level represents significant liquidity and institutional interest.

### Daily Levels
- **PDH** — Previous Day High
- **PDL** — Previous Day Low

### Pre Market Levels
- **PMH** — Pre Market High
- **PML** — Pre Market Low

### Session Levels
- **LPH** — London Pre-Market High (00:00-03:00 ET)
- **LPL** — London Pre-Market Low (00:00-03:00 ET)

---

## Trading Sessions

### London Session
- **Time:** 03:00 - 08:00 ET
- **Character:** Trend continuation, level breaks

### Dead Zone (NO TRADING)
- **Time:** 08:00 - 09:00 ET
- **Rule:** No new signals. If price retests a level during dead zone, that level is disarmed.

### New York Session
- **Time:** 09:30 - 16:00 ET
- **Character:** High volatility, trend reversals

---

## Entry Rules

### Step 1: Identify the Level
Wait for price to approach one of the 6 key levels (PDH, PDL, PMH, PML, LPH, LPL).

### Step 2: Wait for Clean Break (Arm the Level)
The level is **armed** when a full 15-minute candle closes completely beyond the level:
- For a bullish break: entire candle body and wicks above the level
- For a bearish break: entire candle body and wicks below the level

### Step 3: Enter on Retest
Once armed, wait for price to return to the **retest zone**:
- **MNQ/MES:** ±5 points from the level
- **MGC:** ±3 points from the level

Enter in the direction of the breakout when price touches the retest zone.

---

## Risk Management

### Position Sizing (Tested Parameters)
| Instrument | Contracts | Point Value |
|------------|-----------|-------------|
| MNQ | 4 | $2/pt |
| MES | 4 | $5/pt |
| MGC | 2 | $10/pt |

### Take Profit & Stop Loss (OPTIMIZED)
| Instrument | TP | SL | Trail Distance |
|------------|----|----|----------------|
| MNQ | 35 pts | 50 pts | 5 pts |
| MES | 25 pts | 25 pts | 5 pts |
| MGC | 20 pts | 25 pts | 5 pts |

### Trail Mode (No Breakeven)
Once TP is hit:
- **Immediately start trailing** by 5 points from the highest/lowest point reached
- Do NOT move stop to breakeven first — trail directly
- Let winners run until trailed out

**Why no breakeven?** Backtesting showed Trail Only mode outperforms BE+Trail by +30%. Breakeven stop-outs often exit winning trades prematurely.

---

## Critical Rules

### Rule 1: Level Locking (One Trade Per Level Per Day)

**This is the most important risk management rule.**

Once a level fires a signal (regardless of outcome), that level is **locked** for the remainder of the trading day.

**Example:**
- PDH is broken and armed at 10:00 AM
- Price retests and you enter long at 10:30 AM
- Trade stops out for a loss at 11:00 AM
- PDH is now LOCKED — no more trades on PDH today, even if it arms again

**Why this matters:**
- Prevents revenge trading on the same level
- Avoids overtrading during choppy conditions
- Ensures each level only gets one clean shot

### Rule 2: Dead Zone Disarms Levels

If price enters a level's retest zone during the dead zone (08:00-09:00 ET), that level is disarmed and cannot fire until it's broken and armed again.

---

## Instrument Performance (6.7 Years)

### MNQ (Micro Nasdaq)
| Metric | Value |
|--------|-------|
| TP / SL | 35 pts / 50 pts |
| Total Trades | 6,957 |
| Win Rate | 63.9% |
| Total P&L | $630,130 |
| Profit Factor | 1.65 |

### MES (Micro S&P 500)
| Metric | Value |
|--------|-------|
| TP / SL | 25 pts / 25 pts |
| Total Trades | 6,169 |
| Win Rate | 56.8% |
| Total P&L | $430,200 |
| Profit Factor | 1.35 |

### MGC (Micro Gold)
| Metric | Value |
|--------|-------|
| TP / SL | 20 pts / 25 pts |
| Total Trades | 2,625 |
| Win Rate | 60.2% |
| Total P&L | $147,086 |
| Profit Factor | 1.32 |

---

## Year-by-Year Performance (Combined)

| Year | Trades | P&L | Win Rate |
|------|--------|-----|----------|
| 2019 | 972 | $38,374 | 58.7% |
| 2020 | 2,311 | $171,415 | 60.5% |
| 2021 | 2,304 | $156,743 | 61.4% |
| 2022 | 2,464 | $251,484 | 62.1% |
| 2023 | 2,314 | $136,968 | 59.5% |
| 2024 | 2,452 | $198,485 | 60.6% |
| 2025 | 2,522 | $216,717 | 60.1% |
| 2026 | 412 | $37,230 | 57.8% |

**Every single year profitable (8/8).**

---

## Level Performance (Combined)

| Level | Trades | Win Rate | P&L |
|-------|--------|----------|-----|
| **PML** | 4,072 | 64.0% | $406,319 |
| **PMH** | 4,055 | 60.9% | $312,579 |
| LPL | 2,897 | 59.5% | $179,310 |
| LPH | 2,973 | 57.5% | $168,561 |
| PDL | 931 | 57.7% | $72,565 |
| PDH | 823 | 58.4% | $68,082 |

**Key insight:** PML (Previous Month Low) is the top performer with 64% win rate and $406K profit.

---

## Session Performance (Combined)

| Session | Trades | Win Rate | P&L |
|---------|--------|----------|-----|
| London | 13,264 | 60.6% | $907,090 |
| NY | 2,487 | 59.8% | $300,326 |

London dominates with 84% of trades and $907K profit. Both sessions maintain ~60% win rate.

---

## Direction Performance (Combined)

| Direction | Trades | Win Rate | P&L |
|-----------|--------|----------|-----|
| LONG | 6,987 | 58.7% | $591,043 |
| SHORT | 7,228 | 55.2% | $485,639 |

Slight long bias in the data, but both directions profitable.

---

## The TradingView Indicator

Your Edge membership includes the Key Level Breakout Indicator for TradingView, which:

1. **Auto-plots all 6 levels** — PDH, PDL, PMH, PML, LPH, LPL
2. **Shows retest zones** — Visual bands around each level
3. **Highlights armed levels** — Color-coded when broken
4. **Session shading** — London and NY sessions marked
5. **Dead zone alerts** — Warning during 08:00-09:00

---

## Execution Checklist

Before every trade, confirm:

- [ ] Price has cleanly broken the level (full 15m candle through)
- [ ] Level is not already locked for today
- [ ] Currently in a trading session (not dead zone)
- [ ] Price has returned to the retest zone
- [ ] Risk is sized correctly for your account

---

## Common Mistakes to Avoid

1. **Trading during dead zone** — No signals 08:00-09:00 ET
2. **Not waiting for clean break** — Candle must close fully through
3. **Re-entering locked levels** — One trade per level per day
4. **Moving stops** — Let the system work; don't interfere
5. **Overleveraging** — Stick to tested contract sizes
6. **Using breakeven stops** — Trail directly from TP, skip breakeven

---

## Disclaimer

These results are from backtested data using historical CME futures prices (Databento). Past performance does not guarantee future results. Trading futures involves substantial risk of loss. Only trade with capital you can afford to lose.

---

**Questions? Join the Discord or book a 1-on-1 session.**

*Edge Trading — edgetrading.io*
