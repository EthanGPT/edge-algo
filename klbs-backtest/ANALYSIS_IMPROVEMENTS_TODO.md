# ML Model Improvement Analysis - March 2026

## Current Model Performance (v4 Clean)
- 26 features, data-driven scores only
- 70% threshold: **67.7% WR** (+11.8% lift)
- Baseline: 56.5% WR

---

## Key Findings

### 1. Hour of Day - Clear Pattern
| Hour | Session | Win Rate | Action |
|------|---------|----------|--------|
| **09:00** | NY Open | **58.0%** | BOOST |
| 10:00 | NY | 57.5% | BOOST |
| **11:00** | NY | **49.9%** | PENALIZE |
| 15:00 | NY | 51.2% | PENALIZE |
| 07-08 | London | 56.6% | Neutral |

**TODO:** Add hour_score feature (9-10am = 1.0, 11am/3pm = 0.3)

---

### 2. DI Alignment - 5% Edge Not Being Used!
| Alignment | Win Rate | Edge |
|-----------|----------|------|
| DI Aligned | 59.7% | +5.0% |
| DI Not Aligned | 54.7% | baseline |
| LONG aligned | 61.8% | +6.1% |
| SHORT aligned | 57.8% | +4.2% |

**TODO:** Strengthen DI weight from 1.0/0.5 to 1.0/0.3

---

### 3. Best & Worst Setups
**BEST (boost):**
- PML LONG London: 60.7%
- LPH SHORT NY: 57.0%
- PMH SHORT London: 56.8%

**WORST (penalize/skip):**
- PDL LONG London: 45.7% (!)
- PDH SHORT London: 49.6%

**TODO:** Add setup_score feature or hard filter

---

### 4. Streak Mean Reversion
| Previous 5 Trades WR | Next Trade WR |
|---------------------|---------------|
| 0-40% (cold streak) | 61-62% |
| 80-100% (hot streak) | 53.2% |

**TODO:** Consider adding streak awareness (optional)

---

### 5. ATR + Direction Interaction
- LONG + Low ATR (0-0.25): 58.2% WR
- SHORT + High ATR (0.5+): 64.7% WR (small sample)

**TODO:** Add direction-aware ATR score

---

### 6. Aligned Factor Count
- 0-1 factors: 52-53% WR
- 2-3 factors: 58-61% WR (SWEET SPOT)
- 4-5 factors: 57-60% WR

---

## Implementation Checklist

- [ ] Get more data from Databento (extend history)
- [ ] Re-run analysis with larger dataset
- [ ] Implement hour_score feature
- [ ] Strengthen DI_Align weights (1.0/0.3)
- [ ] Add setup_score for best/worst combos
- [ ] Add direction-aware ATR score
- [ ] Retrain model
- [ ] Update main.py with matching features
- [ ] Update TradingView script to pass new indicators (macd_hist, plus_di, minus_di)
- [ ] Redeploy API to Railway

---

## Data Requirements for TradingView Alerts

New fields needed in webhook payload:
```json
{
  "macd_hist": "{{plot('MACD Histogram')}}",
  "plus_di": "{{plot('+DI')}}",
  "minus_di": "{{plot('-DI')}}"
}
```

---

## Notes
- Current data: 15,736 signals (MES/MNQ/MGC)
- Date range: 2019-present
- Need more PDH/PDL samples especially
