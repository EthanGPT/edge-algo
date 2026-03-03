# Tradeify Funded Account Setup

## Goal: $100K Payouts → Own Brokerage (ZAR)

**Target:** $100,000 USD (~R1,850,000 ZAR)

---

## Strategy: MNQ x2 (KLBS)

**Stats:**
- Win Rate: 62.2%
- Pass Rate: 94.1%
- Median time to $3K target: 26 days
- Max loss per trade: $200

**Account Rules ($50K):**
- Profit Target: $3,000
- Trailing Drawdown: $2,000
- Daily Loss Limit: $1,250

---

## Setup Steps

### 1. Tradeify Account
- Go to [Tradeify](https://tradeify.com)
- Sign up for $50K evaluation ($97/month)
- You'll get Tradovate sim credentials

### 2. TradersPost Webhook
- Go to [TradersPost.io](https://traderspost.io)
- Create account → Connect Tradovate broker
- Create Strategy → Get webhook URL
- Create 1 Subscription for MNQ:
  - Ticker: `MNQ1!`
  - Quantity: `2`
  - Take Profit: `$140` (35 pts × $2 × 2 contracts)
  - Stop Loss: `$200` (50 pts × $2 × 2 contracts)

### 3. TradingView Alert
- Add `KLBS_TradersPost` indicator to MNQ 15min chart
- Create Alert:
  - Condition: `KLBS_TradersPost` → `Any alert()`
  - Webhook URL: Your TradersPost URL
  - Alert name: `KLBS MNQ`
  - Expiration: Open-ended
  - Trigger: **Once Per Bar**

---

## Flow

```
TradingView (KLBS signal)
    ↓
Webhook Alert (JSON)
    ↓
TradersPost
    ↓
Tradovate (Tradeify sim/funded)
    ↓
Order Executed (2 MNQ contracts)
```

---

## Scaling Plan

| Month | Accounts | Expected Monthly Profit |
|-------|----------|------------------------|
| 1 | 1 (eval) | $0 |
| 2 | 1 (funded) | $2,800 |
| 3 | 2 | $5,600 |
| 4 | 3 | $8,400 |
| 5 | 4 | $11,200 |
| 6 | 5 | $14,000 |

Reinvest 50% of profits into new eval accounts.

---

## Checklist

- [ ] Tradeify $50K eval account created
- [ ] Tradovate connected to TradersPost
- [ ] MNQ subscription configured (2 contracts, $140 TP, $200 SL)
- [ ] KLBS indicator added to TradingView
- [ ] Alert created with webhook URL
- [ ] Test alert fires correctly
- [ ] Monitor first few trades for execution quality

---

## Files

- `KLBS_TradersPost.pine` - TradingView indicator
- `bot_v1.py` - Python bot (alternative to TradersPost)
- `BOT_SETUP.md` - Full bot documentation

---

## Support

- TradersPost: https://traderspost.io/docs
- Tradeify: https://tradeify.com/faq
- Tradovate API: https://api.tradovate.com
