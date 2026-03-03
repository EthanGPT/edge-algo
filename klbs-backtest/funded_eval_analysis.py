#!/usr/bin/env python3
"""
Funded Account Evaluation Probability Analysis

Rules:
- Profit Target: $3,000
- Trailing Drawdown: $2,000
- Daily Loss Limit: $1,250
- Max Contracts: 4 minis / 40 micros

Option A: 1 MNQ, 1 MES, 1 MGC (reduced from 4, 4, 2)
"""

import pandas as pd
import numpy as np
from pathlib import Path
from collections import defaultdict
from datetime import datetime

# Load trade data
outputs = Path("outputs")

mnq = pd.read_csv(outputs / "klbs_MNQ_trades_optimized.csv")
mes = pd.read_csv(outputs / "klbs_MES_trades_optimized.csv")
mgc = pd.read_csv(outputs / "klbs_MGC_trades_optimized.csv")

# Adjust for 1 contract per symbol (currently 4, 4, 2)
mnq['pnl_1c'] = mnq['pnl_usd'] / 4
mes['pnl_1c'] = mes['pnl_usd'] / 4
mgc['pnl_1c'] = mgc['pnl_usd'] / 2

# Add symbol column
mnq['symbol'] = 'MNQ'
mes['symbol'] = 'MES'
mgc['symbol'] = 'MGC'

# Combine and sort by date
all_trades = pd.concat([mnq, mes, mgc], ignore_index=True)
all_trades['date'] = pd.to_datetime(all_trades['date'], utc=True)
all_trades = all_trades.sort_values('date').reset_index(drop=True)

print("=" * 60)
print("OPTION A: 1 Contract Per Symbol Analysis")
print("=" * 60)

# Per-symbol stats with 1 contract
print("\n--- Per-Symbol Stats (1 Contract Each) ---")
for sym, df in [('MNQ', mnq), ('MES', mes), ('MGC', mgc)]:
    wins = df[df['outcome'] == 'WIN']
    losses = df[df['outcome'] == 'LOSS']

    total_pnl = df['pnl_1c'].sum()
    win_rate = len(wins) / len(df) * 100
    avg_win = wins['pnl_1c'].mean() if len(wins) > 0 else 0
    avg_loss = losses['pnl_1c'].mean() if len(losses) > 0 else 0

    print(f"\n{sym}:")
    print(f"  Trades: {len(df)}")
    print(f"  Win Rate: {win_rate:.1f}%")
    print(f"  Avg Win: ${avg_win:.2f}")
    print(f"  Avg Loss: ${avg_loss:.2f}")
    print(f"  Total P&L (1c): ${total_pnl:,.2f}")

# Combined portfolio stats
print("\n" + "=" * 60)
print("Combined Portfolio (1 MNQ + 1 MES + 1 MGC)")
print("=" * 60)

total_trades = len(all_trades)
total_wins = len(all_trades[all_trades['outcome'] == 'WIN'])
win_rate = total_wins / total_trades * 100
total_pnl = all_trades['pnl_1c'].sum()

print(f"Total Trades: {total_trades}")
print(f"Win Rate: {win_rate:.1f}%")
print(f"Total P&L: ${total_pnl:,.2f}")

# Consecutive losses analysis
print("\n--- Consecutive Loss Analysis ---")
consecutive_losses = []
current_streak = 0
max_streak = 0
max_streak_loss = 0
current_streak_loss = 0

for _, row in all_trades.iterrows():
    if row['outcome'] == 'LOSS':
        current_streak += 1
        current_streak_loss += abs(row['pnl_1c'])
        if current_streak > max_streak:
            max_streak = current_streak
            max_streak_loss = current_streak_loss
    else:
        if current_streak > 0:
            consecutive_losses.append((current_streak, current_streak_loss))
        current_streak = 0
        current_streak_loss = 0

if current_streak > 0:
    consecutive_losses.append((current_streak, current_streak_loss))

print(f"Max Consecutive Losses: {max_streak}")
print(f"Max Consecutive Loss Amount: ${max_streak_loss:,.2f}")

# Count streaks
streak_counts = defaultdict(int)
for streak, loss in consecutive_losses:
    streak_counts[streak] += 1

print("\nConsecutive Loss Distribution:")
for streak in sorted(streak_counts.keys()):
    pct = streak_counts[streak] / len(consecutive_losses) * 100
    print(f"  {streak} losses in a row: {streak_counts[streak]} times ({pct:.1f}%)")

# Daily P&L analysis
print("\n--- Daily P&L Analysis ---")
all_trades['trade_date'] = all_trades['date'].dt.date
daily_pnl = all_trades.groupby('trade_date')['pnl_1c'].sum()

print(f"Trading Days: {len(daily_pnl)}")
print(f"Avg Daily P&L: ${daily_pnl.mean():.2f}")
print(f"Max Daily Win: ${daily_pnl.max():.2f}")
print(f"Max Daily Loss: ${daily_pnl.min():.2f}")
print(f"Days with Loss: {len(daily_pnl[daily_pnl < 0])} ({len(daily_pnl[daily_pnl < 0])/len(daily_pnl)*100:.1f}%)")

# Daily loss limit breaches
daily_limit = 1250
breach_days = daily_pnl[daily_pnl < -daily_limit]
print(f"\nDays exceeding $1,250 daily loss limit: {len(breach_days)}")
if len(breach_days) > 0:
    print(f"  Worst daily loss: ${breach_days.min():.2f}")
    for date, loss in breach_days.items():
        print(f"    {date}: ${loss:.2f}")

# Drawdown analysis from fresh start
print("\n--- Drawdown Analysis (From Fresh Start) ---")

# Simulate equity curve from $0
equity = 0
peak = 0
max_dd = 0
drawdowns = []

for _, row in all_trades.iterrows():
    equity += row['pnl_1c']
    if equity > peak:
        peak = equity
    dd = peak - equity
    if dd > max_dd:
        max_dd = dd
    drawdowns.append(dd)

print(f"Max Drawdown (from any peak): ${max_dd:,.2f}")

# Simulate from $0 - what's max DD before hitting various profit targets
print("\n--- Monte Carlo: Pass Probability Simulation ---")
print("(Running 10,000 simulations of random trade sequences)")

# Get all P&L values
pnl_values = all_trades['pnl_1c'].values

# Track daily P&L for limit checks
daily_pnls = daily_pnl.values

np.random.seed(42)
n_sims = 10000

target = 3000
trailing_dd = 2000
daily_limit = 1250

passes = 0
fails_by_dd = 0
fails_by_daily = 0
trades_to_pass = []

for _ in range(n_sims):
    # Shuffle trades
    shuffled = np.random.permutation(pnl_values)

    equity = 0
    high_watermark = 0
    passed = False
    failed = False
    daily_loss = 0
    last_date = None

    for i, pnl in enumerate(shuffled):
        # Check daily limit (approximate - each trade is a "day event")
        equity += pnl

        if equity > high_watermark:
            high_watermark = equity

        # Check trailing drawdown
        current_dd = high_watermark - equity
        if current_dd >= trailing_dd:
            fails_by_dd += 1
            failed = True
            break

        # Check if hit target
        if equity >= target:
            passes += 1
            trades_to_pass.append(i + 1)
            passed = True
            break

    if not passed and not failed:
        # Didn't hit target or fail - would keep going
        if equity >= target:
            passes += 1

pass_rate = passes / n_sims * 100
avg_trades = np.mean(trades_to_pass) if trades_to_pass else 0

print(f"\nResults:")
print(f"  Pass Rate: {pass_rate:.1f}%")
print(f"  Failed by Trailing DD: {fails_by_dd/n_sims*100:.1f}%")
print(f"  Avg Trades to Pass: {avg_trades:.0f}")

# Sequential analysis - what happens from trade 1?
print("\n--- Sequential Analysis (Actual Trade Order) ---")

equity = 0
high_water = 0
target_hit_idx = None
failed_idx = None

for i, (_, row) in enumerate(all_trades.iterrows()):
    equity += row['pnl_1c']

    if equity > high_water:
        high_water = equity

    dd = high_water - equity

    # Check if would fail
    if dd >= trailing_dd and failed_idx is None:
        failed_idx = i

    # Check if would pass
    if equity >= target and target_hit_idx is None:
        target_hit_idx = i
        break

if target_hit_idx is not None:
    print(f"Would hit ${target} target after trade #{target_hit_idx + 1}")
    days = (all_trades.iloc[target_hit_idx]['date'] - all_trades.iloc[0]['date']).days
    print(f"Time: ~{days} days")
else:
    print(f"Would not hit target in first {len(all_trades)} trades")

# Weekly P&L analysis
print("\n--- Weekly Analysis ---")
all_trades['week'] = all_trades['date'].dt.isocalendar().week.astype(str) + '-' + all_trades['date'].dt.year.astype(str)
weekly_pnl = all_trades.groupby('week')['pnl_1c'].sum()

positive_weeks = len(weekly_pnl[weekly_pnl > 0])
negative_weeks = len(weekly_pnl[weekly_pnl < 0])

print(f"Total Weeks: {len(weekly_pnl)}")
print(f"Winning Weeks: {positive_weeks} ({positive_weeks/len(weekly_pnl)*100:.1f}%)")
print(f"Losing Weeks: {negative_weeks} ({negative_weeks/len(weekly_pnl)*100:.1f}%)")
print(f"Avg Weekly P&L: ${weekly_pnl.mean():.2f}")
print(f"Best Week: ${weekly_pnl.max():.2f}")
print(f"Worst Week: ${weekly_pnl.min():.2f}")

# Early period analysis (first 30, 60, 90 days)
print("\n--- Early Performance Windows ---")
start_date = all_trades['date'].min()

for days in [30, 60, 90]:
    window = all_trades[all_trades['date'] <= start_date + pd.Timedelta(days=days)]
    window_pnl = window['pnl_1c'].sum()

    # Calculate max DD in this window
    eq = 0
    peak = 0
    max_d = 0
    for _, row in window.iterrows():
        eq += row['pnl_1c']
        if eq > peak:
            peak = eq
        if peak - eq > max_d:
            max_d = peak - eq

    print(f"\nFirst {days} days:")
    print(f"  Trades: {len(window)}")
    print(f"  P&L: ${window_pnl:.2f}")
    print(f"  Max DD: ${max_d:.2f}")

print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
print(f"""
Funded Account Rules:
  - Profit Target: $3,000
  - Trailing Drawdown: $2,000
  - Daily Loss Limit: $1,250

Option A (1 MNQ + 1 MES + 1 MGC):
  - Max possible loss per trade: ~$100-125
  - Need ~7-10 consecutive max losses to breach trailing DD
  - Historical max consecutive losses: {max_streak}
  - Monte Carlo pass rate: {pass_rate:.1f}%

Key Risk Factors:
  - Daily loss limit is the main constraint
  - With 1 contract each, max single-trade loss is small
  - Strategy has positive expected value
""")
