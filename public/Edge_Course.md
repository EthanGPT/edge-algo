# The Key Level Breakout System (KLBS)

## Edge Trading — Full Strategy Guide

---

## Overview

The Key Level Breakout System is a liquidity-based futures strategy built on the 6 most important intraday price levels. This mechanical approach removes emotional decision-making and provides clear, repeatable entries with defined risk.

### Verified Backtest Results (OPTIMIZED)

| Metric | Value |
|--------|-------|
| **Total P&L** | $1,076,682 |
| **Return on $100K** | +1,077% |
| **Total Trades** | 14,215 |
| **Win Rate** | 59.6% |
| **Profit Factor** | 1.40 |
| **Max Drawdown** | $7,444 |
| **Years of Data** | 6.7 Years |
| **Profitable Years** | 7/7 |
| **Avg Yearly P&L** | $161,000 |

**Contract Allocation:** 4 MNQ + 4 MES + 2 MGC (Low Risk)

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
| Total Trades | 6,296 |
| Win Rate | 62.2% |
| Total P&L | $555,978 |
| Profit Factor | 1.58 |
| Max Drawdown | $7,444 |

### MES (Micro S&P 500)
| Metric | Value |
|--------|-------|
| TP / SL | 25 pts / 25 pts |
| Total Trades | 5,602 |
| Win Rate | 56.5% |
| Total P&L | $383,150 |
| Profit Factor | 1.31 |
| Max Drawdown | $6,490 |

### MGC (Micro Gold)
| Metric | Value |
|--------|-------|
| TP / SL | 20 pts / 25 pts |
| Total Trades | 2,317 |
| Win Rate | 60.3% |
| Total P&L | $137,554 |
| Profit Factor | 1.30 |
| Max Drawdown | $6,442 |

---

## Year-by-Year Performance (Combined)

| Year | Trades | P&L | Notes |
|------|--------|-----|-------|
| 2019 | 899 | $38,587 | Partial year (June-Dec) |
| 2020 | 2,096 | $152,164 | COVID volatility |
| 2021 | 2,068 | $123,130 | Post-COVID normalization |
| 2022 | 2,214 | $215,914 | Bear market, high volatility |
| 2023 | 2,093 | $128,087 | Recovery year |
| 2024 | 2,190 | $184,739 | Election year |
| 2025 | 2,283 | $201,331 | Current year (partial) |
| 2026 | 372 | $32,730 | Jan-Feb only |

**Every single year profitable.**

---

## Level Performance (Combined)

| Level | Trades | Win Rate | P&L |
|-------|--------|----------|-----|
| **PMH** | 3,520 | 55.8% | $251,732 |
| **PML** | 3,296 | 58.8% | $282,012 |
| LPH | 2,881 | 53.6% | $157,406 |
| LPL | 2,748 | 56.9% | $175,682 |
| PDH | 782 | 52.9% | $82,503 |
| PDL | 901 | 53.8% | $127,347 |

**Key insight:** PM (Pre Market) levels are the highest performers with the best win rates.

---

## Session Performance (Combined)

| Session | Trades | Win Rate | P&L |
|---------|--------|----------|-----|
| London | 9,423 | 59.2% | $626,314 |
| NY | 4,792 | 55.8% | $450,368 |

Both sessions are profitable. London has more trades, NY has higher P&L per trade.

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
