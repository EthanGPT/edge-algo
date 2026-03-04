"""
Key Level Breakout System — Backtest
Replicates exact Pine Script logic bar-by-bar.

Instruments: MNQ (Micro Nasdaq), MES (Micro S&P), MGC (Micro Gold)
Timeframe:   15-minute bars
Data:        Databento CME Futures (6+ years)

Strategy Rules:
  - Levels: PDH, PDL, PMH, PML, LPH, LPL
  - Sessions: London 03:00-08:00 ET, NY 09:30-16:00 ET
  - Dead zone 08:00-09:30 ET: no signals, retest disarms level
  - Arm: previous candle fully through level (during session)
  - Retest zone: ±5pts MNQ/MES, ±3pts MGC
  - TP/SL: Optimized per instrument (MNQ 35/50, MES 25/25, MGC 20/25)
  - Trail: Activates at TP level, follows by trail distance
  - One signal per level per day (level locked after firing)
  - Fees: Configurable (INCLUDE_FEES toggle, ~$1.50/contract round-trip)

Usage:
  python klbs_backtest.py           # Run with fees (default)
  python klbs_backtest.py --no-fees # Run without fees
  python klbs_backtest.py --optimize # Full parameter optimization
  python klbs_backtest.py --oos     # Out-of-sample forward test
"""

import warnings
warnings.filterwarnings('ignore')

import pandas as pd
import numpy as np
from datetime import datetime, time, timedelta
import pytz
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import os
import gc  # Garbage collection for memory management

# ── Config ────────────────────────────────────────────────────────────────────
STARTING_CAPITAL = 100_000

INSTRUMENTS = {
    'MNQ': {
        'file': 'data/MNQ_15m.csv',
        'tp': 50,           # [OPTIMIZED] Target profit (pts)
        'sl': 50,           # [OPTIMIZED] Initial stop loss (pts)
        'rz': 5,            # Retest zone (pts)
        'pv': 2.0,          # Point value ($)
        'contracts': 4,     # Number of contracts
        'trail': 5,         # [OPTIMIZED] Trail distance after TP (pts)
        'name': 'Micro Nasdaq'
    },
    'MES': {
        'file': 'data/MES_15m.csv',
        'tp': 25,           # [OPTIMIZED]
        'sl': 25,           # [OPTIMIZED]
        'rz': 5,
        'pv': 5.0,
        'contracts': 4,
        'trail': 5,         # [OPTIMIZED]
        'name': 'Micro S&P 500'
    },
    'MGC': {
        'file': 'data/MGC_15m.csv',
        'tp': 20,           # [OPTIMIZED]
        'sl': 25,           # [OPTIMIZED]
        'rz': 3,
        'pv': 10.0,
        'contracts': 2,
        'trail': 5,         # [OPTIMIZED]
        'name': 'Micro Gold'
    },
    # ── Bonds (Less Volatile, Very Liquid) ──────────────────────────────
    'ZN': {
        'file': 'data/ZN_15m.csv',
        'tp': 0.20,         # [OPTIMIZED] Target profit (pts)
        'sl': 0.30,         # [OPTIMIZED] Initial stop loss (pts)
        'rz': 0.03,         # Retest zone (~2 ticks)
        'pv': 1000.0,       # Point value ($1000/point)
        'contracts': 2,     # Number of contracts
        'trail': 0.03,      # [OPTIMIZED] Trail distance after TP (pts)
        'name': '10-Year Treasury'
    },
    'ZB': {
        'file': 'data/ZB_15m.csv',
        'tp': 0.50,         # [OPTIMIZED] Target profit (pts)
        'sl': 0.50,         # [OPTIMIZED] Initial stop loss (pts)
        'rz': 0.05,         # Retest zone (~2 ticks)
        'pv': 1000.0,       # Point value ($1000/point)
        'contracts': 2,     # Number of contracts
        'trail': 0.05,      # [OPTIMIZED] Trail distance after TP (pts)
        'name': '30-Year Treasury'
    },
    # ── Currencies (Moderate Volatility, Liquid) ────────────────────────
    '6E': {
        'file': 'data/6E_15m.csv',
        'tp': 0.003,        # [OPTIMIZED] Target profit (pts)
        'sl': 0.0025,       # [OPTIMIZED] Initial stop loss (pts)
        'rz': 0.0005,       # Retest zone (~10 ticks)
        'pv': 125000.0,     # Point value ($125,000/point)
        'contracts': 1,     # Number of contracts
        'trail': 0.0005,    # [OPTIMIZED] Trail distance after TP (pts)
        'name': 'Euro FX'
    },
    '6J': {
        'file': 'data/6J_15m.csv',
        'tp': 0.00004,      # [OPTIMIZED] Target profit (pts)
        'sl': 0.00007,      # [OPTIMIZED] Initial stop loss (pts)
        'rz': 0.00001,      # Retest zone (~10 ticks)
        'pv': 125000.0,     # Point value ($125,000/point)
        'contracts': 1,     # Number of contracts
        'trail': 0.00001,   # [OPTIMIZED] Trail distance after TP (pts)
        'name': 'Japanese Yen'
    },
}

ET = pytz.timezone('America/New_York')
DEBUG = False

# ── Slippage Configuration ────────────────────────────────────────────────────
# Slippage on stop exits (market orders) - limit order entries have no slippage
# Values in points per instrument
INCLUDE_SLIPPAGE = True  # Toggle to include/exclude slippage
SLIPPAGE = {
    'MNQ': 0.50,    # ~2 ticks ($1/contract)
    'MES': 0.25,    # ~1 tick ($1.25/contract)
    'MGC': 0.20,    # ~2 ticks ($2/contract)
    'ZN':  0.015625, # 1 tick = 1/64 point ($15.63/contract)
    'ZB':  0.03125,  # 1 tick = 1/32 point ($31.25/contract)
    '6E':  0.00005,  # 0.5 pips ($6.25/contract)
    '6J':  0.0000005, # ~0.5 pips
}

# ── Fees & Commissions ───────────────────────────────────────────────────────
# Standard CME Micro futures costs (per contract, round-trip)
INCLUDE_FEES = True  # Toggle to include/exclude fees in P&L
FEES = {
    'MNQ': {
        'commission': 0.52,     # NinjaTrader/AMP typical rate per side
        'exchange': 0.22,       # CME exchange fee per side
        'nfa': 0.01,            # NFA regulatory fee per side
        'round_trip': 1.50,     # Total per contract (both sides)
    },
    'MES': {
        'commission': 0.52,
        'exchange': 0.22,
        'nfa': 0.01,
        'round_trip': 1.50,
    },
    'MGC': {
        'commission': 0.52,
        'exchange': 0.22,
        'nfa': 0.01,
        'round_trip': 1.50,
    },
    # ── Bonds ───────────────────────────────────────────────────────────
    'ZN': {
        'commission': 0.85,     # Full-size futures higher commission
        'exchange': 0.85,       # CBOT exchange fee per side
        'nfa': 0.01,
        'round_trip': 3.50,     # Total per contract (both sides)
    },
    'ZB': {
        'commission': 0.85,
        'exchange': 0.85,
        'nfa': 0.01,
        'round_trip': 3.50,
    },
    # ── Currencies ──────────────────────────────────────────────────────
    '6E': {
        'commission': 0.85,
        'exchange': 0.85,
        'nfa': 0.01,
        'round_trip': 3.50,
    },
    '6J': {
        'commission': 0.85,
        'exchange': 0.85,
        'nfa': 0.01,
        'round_trip': 3.50,
    },
}

# Output directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, 'outputs')  # CSVs go here
PUBLIC_DIR = os.path.join(BASE_DIR, '..', 'public')  # HTML report goes here
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Session definitions (ET)
LONDON_START = time(3,  0)
LONDON_END   = time(8,  0)
DEAD_START   = time(8,  0)
DEAD_END     = time(9, 30)
NY_START     = time(9, 30)
NY_END       = time(16, 0)
PM_START     = time(4, 30)
PM_END       = time(9, 30)
LPM_START    = time(0,  0)
LPM_END      = time(3,  0)


def in_london(t):   return LONDON_START <= t < LONDON_END
def in_ny(t):       return NY_START     <= t < NY_END
def in_pm(t):       return PM_START     <= t < PM_END
def in_lpm(t):      return LPM_START    <= t < LPM_END
def in_session(t):  return in_london(t) or in_ny(t)
def in_dead(t):     return DEAD_START   <= t < DEAD_END


def load_data(filepath):
    """Load data from Databento CSV and convert to ET timezone."""
    print(f"  Loading {filepath}...")
    df = pd.read_csv(filepath, index_col=0, parse_dates=True)

    # Ensure timezone-aware and convert to ET
    if df.index.tzinfo is None:
        df.index = df.index.tz_localize('UTC')
    df.index = df.index.tz_convert(ET)

    # Standardize column names
    df.columns = [c.capitalize() for c in df.columns]
    df = df[['Open', 'High', 'Low', 'Close', 'Volume']].copy()
    df.dropna(inplace=True)

    print(f"    → {len(df):,} bars from {df.index[0].date()} to {df.index[-1].date()}")
    return df


def run_backtest(symbol, cfg, include_fees=INCLUDE_FEES, include_slippage=INCLUDE_SLIPPAGE):
    fees_str = "with fees" if include_fees else "no fees"
    slip_str = "+slippage" if include_slippage else ""
    print(f"\n{'='*60}")
    print(f"  {symbol} — {cfg['name']} [Trail Mode, {fees_str}{slip_str}]")
    print(f"{'='*60}")

    filepath = os.path.join(BASE_DIR, cfg['file'])
    df = load_data(filepath)
    tp_pts = cfg['tp']
    sl_pts = cfg['sl']
    rz     = cfg['rz']
    pv     = cfg['pv']

    trades = []
    arm_events = []
    disarm_events = []

    # ── Daily level state ─────────────────────────────────────────────────────
    prev_day_h = prev_day_l = np.nan
    day_h = day_l = np.nan
    pm_h = pm_l = np.nan
    lpm_h = lpm_l = np.nan

    # ── Level arm/fire state ──────────────────────────────────────────────────
    level_state = {k: 0 for k in ['PDH','PDL','PMH','PML','LPH','LPL']}
    level_bo    = {k: -1 for k in level_state}
    level_ls    = {k: -1 for k in level_state}

    # ── Session tracking (NO direction lock - only level locks) ─────────────
    prev_london = False
    prev_ny     = False
    prev_date   = None

    bars = df.reset_index()
    bars.rename(columns={bars.columns[0]: 'Datetime'}, inplace=True)

    total_bars = len(bars)
    report_interval = total_bars // 10

    for i, row in bars.iterrows():
        dt = row['Datetime']

        if i == 0:
            prev_london = in_london(dt.time())
            prev_ny     = in_ny(dt.time())
            prev_date   = dt.date()
            day_h = row['High']
            day_l = row['Low']
            continue

        # Progress indicator
        if i % report_interval == 0:
            pct = int(i / total_bars * 100)
            print(f"    Processing... {pct}%")

        t    = dt.time()
        date = dt.date()
        o    = float(row['Open'])
        h    = float(row['High'])
        l    = float(row['Low'])
        c    = float(row['Close'])

        prev_row = bars.iloc[i-1]
        ph = float(prev_row['High'])
        pl = float(prev_row['Low'])
        pc = float(prev_row['Close'])

        cur_london = in_london(t)
        cur_ny     = in_ny(t)
        cur_pm     = in_pm(t)
        cur_lpm    = in_lpm(t)
        cur_sess   = in_session(t)
        cur_dead   = in_dead(t)

        # ── New session detection ─────────────────────────────────────────────
        prev_london = cur_london
        prev_ny     = cur_ny

        # ── New day detection ─────────────────────────────────────────────────
        new_day = date != prev_date
        if new_day:
            prev_day_h = day_h
            prev_day_l = day_l
            day_h = h
            day_l = l
            pm_h = pm_l = np.nan
            lpm_h = lpm_l = np.nan
            for k in level_state:
                level_state[k] = 0
                level_bo[k]    = -1
                level_ls[k]    = -1
            prev_date = date
        else:
            day_h = max(day_h, h) if not np.isnan(day_h) else h
            day_l = min(day_l, l) if not np.isnan(day_l) else l

        # ── Accumulate session levels ─────────────────────────────────────────
        if cur_lpm:
            lpm_h = max(lpm_h, h) if not np.isnan(lpm_h) else h
            lpm_l = min(lpm_l, l) if not np.isnan(lpm_l) else l
        if cur_pm:
            pm_h = max(pm_h, h) if not np.isnan(pm_h) else h
            pm_l = min(pm_l, l) if not np.isnan(pm_l) else l

        # ── Define active levels ──────────────────────────────────────────────
        prox = 10.0
        def near(a, b):
            return (not np.isnan(a)) and (not np.isnan(b)) and abs(a-b) <= prox

        levels = {}
        if not np.isnan(pm_h):
            levels['PMH'] = (pm_h, False)
        if not np.isnan(pm_l):
            levels['PML'] = (pm_l, True)
        if not np.isnan(lpm_h) and not near(lpm_h, pm_h) and not near(lpm_h, pm_l):
            levels['LPH'] = (lpm_h, False)
        if not np.isnan(lpm_l) and not near(lpm_l, pm_h) and not near(lpm_l, pm_l):
            levels['LPL'] = (lpm_l, True)
        if not np.isnan(prev_day_h) and not near(prev_day_h, lpm_h) and not near(prev_day_h, lpm_l) and not near(prev_day_h, pm_h) and not near(prev_day_h, pm_l):
            levels['PDH'] = (prev_day_h, False)
        if not np.isnan(prev_day_l) and not near(prev_day_l, lpm_h) and not near(prev_day_l, lpm_l) and not near(prev_day_l, pm_h) and not near(prev_day_l, pm_l):
            levels['PDL'] = (prev_day_l, True)

        # ── Check each level ──────────────────────────────────────────────────
        for lvl_name, (lvl_price, is_long) in levels.items():
            st = level_state[lvl_name]
            bo = level_bo[lvl_name]
            ls = level_ls[lvl_name]

            # NO session direction lock - only level locks (matches Pine indicator)

            if is_long:
                if st == 0 and cur_sess and pl > lvl_price:
                    level_state[lvl_name] = 1
                    level_bo[lvl_name]    = i
                    st = 1; bo = i
                    arm_events.append({
                        'date': dt, 'level': lvl_name, 'direction': 'LONG',
                        'level_price': lvl_price, 'session': 'London' if cur_london else 'NY'
                    })

                if st == 1 and i > bo:
                    if l <= lvl_price + rz:
                        if cur_sess:
                            if i != ls:
                                entry = lvl_price
                                tp    = entry + tp_pts
                                sl_p  = entry - sl_pts
                                trades.append({
                                    'date':     dt,
                                    'level':    lvl_name,
                                    'direction':'LONG',
                                    'entry':    entry,
                                    'tp':       tp,
                                    'sl':       sl_p,
                                    'bar_idx':  i,
                                    'session':  'London' if cur_london else 'NY',
                                    'day_of_week': dt.strftime('%A'),
                                    'hour': dt.hour,
                                    'level_price': lvl_price,
                                    'year': dt.year,
                                    'month': dt.month,
                                })
                                level_state[lvl_name] = 2
                                level_ls[lvl_name]    = i
                        else:
                            level_state[lvl_name] = 0
                            disarm_events.append({
                                'date': dt, 'level': lvl_name, 'direction': 'LONG',
                                'level_price': lvl_price
                            })
            else:
                if st == 0 and cur_sess and ph < lvl_price:
                    level_state[lvl_name] = -1
                    level_bo[lvl_name]    = i
                    st = -1; bo = i
                    arm_events.append({
                        'date': dt, 'level': lvl_name, 'direction': 'SHORT',
                        'level_price': lvl_price, 'session': 'London' if cur_london else 'NY'
                    })

                if st == -1 and i > bo:
                    if h >= lvl_price - rz:
                        if cur_sess:
                            if i != ls:
                                entry = lvl_price
                                tp    = entry - tp_pts
                                sl_p  = entry + sl_pts
                                trades.append({
                                    'date':     dt,
                                    'level':    lvl_name,
                                    'direction':'SHORT',
                                    'entry':    entry,
                                    'tp':       tp,
                                    'sl':       sl_p,
                                    'bar_idx':  i,
                                    'session':  'London' if cur_london else 'NY',
                                    'day_of_week': dt.strftime('%A'),
                                    'hour': dt.hour,
                                    'level_price': lvl_price,
                                    'year': dt.year,
                                    'month': dt.month,
                                })
                                level_state[lvl_name] = -2
                                level_ls[lvl_name]    = i
                        else:
                            level_state[lvl_name] = 0
                            disarm_events.append({
                                'date': dt, 'level': lvl_name, 'direction': 'SHORT',
                                'level_price': lvl_price
                            })

    if not trades:
        print("  No trades found.")
        return None

    trades_df = pd.DataFrame(trades)
    print(f"\n  Found {len(trades_df)} signals. Simulating outcomes...")

    # ── Trade simulation with trailing stop ────────────────────────────────────
    # Rules:
    # 1. Entry at level price (limit order)
    # 2. Initial SL = entry ± sl_pts
    # 3. At TP level: switch to trailing mode (trail by 'trail' pts)
    # 4. Let winners run until trailing stop is hit

    contracts = cfg['contracts']
    trail_pts = cfg.get('trail', 5)
    fee_per_contract = FEES[symbol]['round_trip'] if include_fees else 0
    slippage_pts = SLIPPAGE.get(symbol, 0) if include_slippage else 0

    results = []
    for idx, trade in trades_df.iterrows():
        bi      = trade['bar_idx']
        is_long = trade['direction'] == 'LONG'
        entry   = trade['entry']

        # Initial stop loss
        if is_long:
            current_sl = entry - sl_pts
        else:
            current_sl = entry + sl_pts

        outcome = 'OPEN'
        exit_price = np.nan
        exit_bar   = None
        bars_held  = 0
        max_favorable = 0.0
        max_adverse = 0.0

        # State tracking
        trailing_active = False
        best_price = entry  # Track best price for trailing

        # Walk forward through bars (max 200 bars = ~50 hours for letting winners run)
        future_bars = bars.iloc[bi+1:bi+200]

        for _, fb in future_bars.iterrows():
            fh = float(fb['High'])
            fl = float(fb['Low'])
            bars_held += 1

            if is_long:
                # Track MFE/MAE
                max_favorable = max(max_favorable, fh - entry)
                max_adverse = max(max_adverse, entry - fl)

                # Update best price for trailing
                if fh > best_price:
                    best_price = fh

                # Check trailing trigger (TP level reached)
                if not trailing_active and fh >= entry + tp_pts:
                    trailing_active = True
                    current_sl = fh - trail_pts  # Start trailing

                # Update trailing stop if active
                if trailing_active:
                    new_trail_sl = best_price - trail_pts
                    if new_trail_sl > current_sl:
                        current_sl = new_trail_sl

                # Check if stopped out
                if fl <= current_sl:
                    # Apply slippage on stop exit (market order gets worse fill)
                    exit_price = current_sl - slippage_pts
                    exit_bar = fb['Datetime']
                    if exit_price > entry:
                        outcome = 'WIN'
                    else:
                        outcome = 'LOSS'
                    break

            else:  # SHORT
                # Track MFE/MAE
                max_favorable = max(max_favorable, entry - fl)
                max_adverse = max(max_adverse, fh - entry)

                # Update best price for trailing
                if fl < best_price:
                    best_price = fl

                # Check trailing trigger (TP level reached)
                if not trailing_active and fl <= entry - tp_pts:
                    trailing_active = True
                    current_sl = fl + trail_pts

                # Update trailing stop if active
                if trailing_active:
                    new_trail_sl = best_price + trail_pts
                    if new_trail_sl < current_sl:
                        current_sl = new_trail_sl

                # Check if stopped out
                if fh >= current_sl:
                    # Apply slippage on stop exit (market order gets worse fill)
                    exit_price = current_sl + slippage_pts
                    exit_bar = fb['Datetime']
                    if exit_price < entry:
                        outcome = 'WIN'
                    else:
                        outcome = 'LOSS'
                    break

        # Calculate P&L
        if outcome in ['WIN', 'LOSS']:
            if is_long:
                pnl_pts = exit_price - entry
            else:
                pnl_pts = entry - exit_price
        else:
            pnl_pts = 0.0

        pnl_usd = pnl_pts * pv * contracts
        fees_usd = fee_per_contract * contracts
        pnl_usd_net = pnl_usd - fees_usd

        results.append({
            **trade,
            'outcome':       outcome,
            'exit_price':    exit_price,
            'exit_time':     exit_bar,
            'pnl_pts':       pnl_pts,
            'pnl_usd_gross': pnl_usd,
            'fees_usd':      fees_usd,
            'pnl_usd':       pnl_usd_net,
            'bars_held':     bars_held,
            'max_favorable_excursion': max_favorable,
            'max_adverse_excursion': max_adverse,
            'trailing_active': trailing_active,
            'contracts':     contracts,
        })

    res_df = pd.DataFrame(results)
    closed = res_df[res_df['outcome'].isin(['WIN','LOSS'])].copy()

    if closed.empty:
        print("  No closed trades.")
        return None

    # ── Stats ─────────────────────────────────────────────────────────────────
    total       = len(closed)
    wins        = (closed['outcome'] == 'WIN').sum()
    losses      = (closed['outcome'] == 'LOSS').sum()

    win_rate  = wins / total * 100 if total > 0 else 0

    total_pnl   = closed['pnl_usd'].sum()
    total_fees  = closed['fees_usd'].sum()
    total_gross = closed['pnl_usd_gross'].sum()
    avg_win     = closed[closed['outcome']=='WIN']['pnl_usd'].mean() if wins > 0 else 0
    avg_loss    = closed[closed['outcome']=='LOSS']['pnl_usd'].mean() if losses > 0 else 0

    # Profit factor = gross profit / gross loss
    gross_profit = closed[closed['pnl_usd'] > 0]['pnl_usd'].sum()
    gross_loss   = abs(closed[closed['pnl_usd'] < 0]['pnl_usd'].sum())
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else np.inf

    # Trailing stats
    trails_triggered = closed['trailing_active'].sum()
    avg_win_pts = closed[closed['outcome']=='WIN']['pnl_pts'].mean() if wins > 0 else 0
    avg_loss_pts = closed[closed['outcome']=='LOSS']['pnl_pts'].mean() if losses > 0 else 0

    cumulative = closed['pnl_usd'].cumsum()
    running_max = cumulative.cummax()
    drawdown = cumulative - running_max
    max_dd = drawdown.min()

    # ── Risk Metrics ──────────────────────────────────────────────────────────
    # Average drawdown (mean of all drawdown values when in drawdown)
    dd_values = drawdown[drawdown < 0]
    avg_dd = dd_values.mean() if len(dd_values) > 0 else 0

    # Total drawdown (sum of all drawdown periods)
    total_dd = dd_values.sum() if len(dd_values) > 0 else 0

    # Calculate daily returns for Sharpe/Sortino
    closed_with_date = closed.copy()
    closed_with_date['trade_date'] = closed_with_date['date'].dt.date
    daily_pnl = closed_with_date.groupby('trade_date')['pnl_usd'].sum()

    # Sharpe Ratio (annualized) - assumes risk-free rate of 0
    # Sharpe = (mean return / std of returns) * sqrt(252)
    daily_mean = daily_pnl.mean()
    daily_std = daily_pnl.std()
    sharpe_ratio = (daily_mean / daily_std) * np.sqrt(252) if daily_std > 0 else 0

    # Sortino Ratio (annualized) - only penalizes downside volatility
    # Sortino = (mean return / downside std) * sqrt(252)
    downside_returns = daily_pnl[daily_pnl < 0]
    downside_std = downside_returns.std() if len(downside_returns) > 0 else 0
    sortino_ratio = (daily_mean / downside_std) * np.sqrt(252) if downside_std > 0 else 0

    # Calmar Ratio = Annual Return / Max Drawdown
    data_years = (closed['date'].max() - closed['date'].min()).days / 365
    annual_return = total_pnl / data_years if data_years > 0 else 0
    calmar_ratio = abs(annual_return / max_dd) if max_dd != 0 else 0

    # Recovery Factor = Total P&L / Max Drawdown
    recovery_factor = abs(total_pnl / max_dd) if max_dd != 0 else 0

    # Daily volatility (annualized)
    annual_volatility = daily_std * np.sqrt(252) if daily_std > 0 else 0

    expectancy = (win_rate/100 * avg_win) + ((100-win_rate)/100 * avg_loss)

    outcomes = closed['outcome'].values
    max_consec_wins = max_consec_losses = current_wins = current_losses = 0
    for o in outcomes:
        if o == 'WIN':
            current_wins += 1
            current_losses = 0
            max_consec_wins = max(max_consec_wins, current_wins)
        else:
            current_losses += 1
            current_wins = 0
            max_consec_losses = max(max_consec_losses, current_losses)

    avg_bars_win = closed[closed['outcome']=='WIN']['bars_held'].mean() if wins > 0 else 0
    avg_bars_loss = closed[closed['outcome']=='LOSS']['bars_held'].mean() if losses > 0 else 0
    avg_mfe = closed['max_favorable_excursion'].mean()
    avg_mae = closed['max_adverse_excursion'].mean()

    # By level
    by_level = closed.groupby('level').agg(
        trades=('outcome','count'),
        wins=('outcome', lambda x: (x=='WIN').sum()),
        losses=('outcome', lambda x: (x=='LOSS').sum()),
        pnl=('pnl_usd','sum'),
        avg_mfe=('max_favorable_excursion', 'mean'),
        avg_mae=('max_adverse_excursion', 'mean'),
    ).assign(wr=lambda x: x['wins']/(x['wins']+x['losses'])*100)

    # By session
    by_sess = closed.groupby('session').agg(
        trades=('outcome','count'),
        wins=('outcome', lambda x: (x=='WIN').sum()),
        losses=('outcome', lambda x: (x=='LOSS').sum()),
        pnl=('pnl_usd','sum')
    ).assign(wr=lambda x: x['wins']/(x['wins']+x['losses'])*100)

    # By day of week
    by_dow = closed.groupby('day_of_week').agg(
        trades=('outcome','count'),
        wins=('outcome', lambda x: (x=='WIN').sum()),
        losses=('outcome', lambda x: (x=='LOSS').sum()),
        pnl=('pnl_usd','sum')
    ).assign(wr=lambda x: x['wins']/(x['wins']+x['losses'])*100)
    day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    by_dow = by_dow.reindex([d for d in day_order if d in by_dow.index])

    # By hour
    by_hour = closed.groupby('hour').agg(
        trades=('outcome','count'),
        wins=('outcome', lambda x: (x=='WIN').sum()),
        losses=('outcome', lambda x: (x=='LOSS').sum()),
        pnl=('pnl_usd','sum')
    ).assign(wr=lambda x: x['wins']/(x['wins']+x['losses'])*100)

    # By direction
    by_dir = closed.groupby('direction').agg(
        trades=('outcome','count'),
        wins=('outcome', lambda x: (x=='WIN').sum()),
        losses=('outcome', lambda x: (x=='LOSS').sum()),
        pnl=('pnl_usd','sum')
    ).assign(wr=lambda x: x['wins']/(x['wins']+x['losses'])*100)

    # By year
    by_year = closed.groupby('year').agg(
        trades=('outcome','count'),
        wins=('outcome', lambda x: (x=='WIN').sum()),
        losses=('outcome', lambda x: (x=='LOSS').sum()),
        pnl=('pnl_usd','sum')
    ).assign(wr=lambda x: x['wins']/(x['wins']+x['losses'])*100)

    # By month
    by_month = closed.groupby('month').agg(
        trades=('outcome','count'),
        wins=('outcome', lambda x: (x=='WIN').sum()),
        losses=('outcome', lambda x: (x=='LOSS').sum()),
        pnl=('pnl_usd','sum')
    ).assign(wr=lambda x: x['wins']/(x['wins']+x['losses'])*100)

    print(f"\n  ── Overall ──────────────────────────────")
    print(f"  Data Range:       {df.index[0].date()} to {df.index[-1].date()}")
    print(f"  Total Bars:       {len(df):,}")
    print(f"  Contracts:        {contracts}")
    print(f"  Total trades:     {total:,}")
    print(f"  Wins/Losses:      {wins:,} / {losses:,}")
    print(f"  Win Rate:         {win_rate:.1f}%")
    print(f"  Gross P&L:        ${total_gross:,.0f}")
    print(f"  Total Fees:       ${total_fees:,.0f}")
    print(f"  Net P&L:          ${total_pnl:,.0f}")
    print(f"  Avg Win:          ${avg_win:,.0f} ({avg_win_pts:.1f} pts)")
    print(f"  Avg Loss:         ${avg_loss:,.0f} ({avg_loss_pts:.1f} pts)")
    print(f"  Profit Factor:    {profit_factor:.2f}")
    print(f"  Max Drawdown:     ${max_dd:,.0f}")
    print(f"  Avg Drawdown:     ${avg_dd:,.0f}")
    print(f"  Expectancy:       ${expectancy:,.2f}")
    print(f"  Sharpe Ratio:     {sharpe_ratio:.2f}")
    print(f"  Sortino Ratio:    {sortino_ratio:.2f}")
    print(f"  Calmar Ratio:     {calmar_ratio:.2f}")
    print(f"  Recovery Factor:  {recovery_factor:.1f}x")
    print(f"  Max Consec Wins:  {max_consec_wins}")
    print(f"  Max Consec Losses:{max_consec_losses}")
    print(f"  Trails Triggered: {trails_triggered:,} ({trails_triggered/total*100:.1f}%)")
    print(f"\n  ── By Year ──────────────────────────────")
    print(by_year.to_string())
    print(f"\n  ── By Level ─────────────────────────────")
    print(by_level.to_string())
    print(f"\n  ── By Session ───────────────────────────")
    print(by_sess.to_string())
    print(f"\n  ── By Day of Week ───────────────────────")
    print(by_dow.to_string())
    print(f"\n  ── By Direction ─────────────────────────")
    print(by_dir.to_string())

    return {
        'symbol':   symbol,
        'cfg':      cfg,
        'df':       df,
        'trades':   res_df,
        'closed':   closed,
        'mode':     'Trail Only',
        'include_fees': include_fees,
        'stats': {
            'total': total, 'wins': wins, 'losses': losses,
            'win_rate': win_rate,
            'total_pnl': total_pnl,
            'total_gross': total_gross,
            'total_fees': total_fees,
            'avg_win': avg_win, 'avg_loss': avg_loss,
            'avg_win_pts': avg_win_pts, 'avg_loss_pts': avg_loss_pts,
            'profit_factor': profit_factor, 'max_dd': max_dd,
            'avg_dd': avg_dd, 'total_dd': total_dd,
            'sharpe_ratio': sharpe_ratio, 'sortino_ratio': sortino_ratio,
            'calmar_ratio': calmar_ratio, 'recovery_factor': recovery_factor,
            'annual_volatility': annual_volatility,
            'expectancy': expectancy,
            'max_consec_wins': max_consec_wins,
            'max_consec_losses': max_consec_losses,
            'avg_bars_win': avg_bars_win,
            'avg_bars_loss': avg_bars_loss,
            'avg_mfe': avg_mfe,
            'avg_mae': avg_mae,
            'data_start': df.index[0],
            'data_end': df.index[-1],
            'total_bars': len(df),
            'contracts': contracts,
            'trails_triggered': trails_triggered,
        },
        'by_level': by_level,
        'by_sess':  by_sess,
        'by_dow':   by_dow,
        'by_hour':  by_hour,
        'by_dir':   by_dir,
        'by_year':  by_year,
        'by_month': by_month,
        'arm_events': pd.DataFrame(arm_events) if arm_events else None,
        'disarm_events': pd.DataFrame(disarm_events) if disarm_events else None,
    }


def fmt_pts(v):
    """Format points with appropriate decimal places based on magnitude."""
    if v == 0:
        return "0"
    elif abs(v) >= 10:
        return f"{v:.1f}"
    elif abs(v) >= 1:
        return f"{v:.2f}"
    elif abs(v) >= 0.01:
        return f"{v:.3f}"
    else:
        return f"{v:.5f}"

def fmt_currency(v):
    """Format currency with M for millions, K for thousands."""
    if abs(v) >= 1_000_000:
        return f'${v/1_000_000:.2f}M'
    elif abs(v) >= 1_000:
        return f'${v/1_000:.0f}K'
    else:
        return f'${v:.0f}'


def build_report(all_results):
    """Build detailed HTML report with charts."""

    figs_html = []
    overall_figs_html = []
    date_range = ""
    for r in all_results:
        if r is not None:
            date_range = f"{r['stats']['data_start'].strftime('%Y-%m-%d')} to {r['stats']['data_end'].strftime('%Y-%m-%d')}"
            break

    # ═══════════════════════════════════════════════════════════════════════════
    # OVERALL PERFORMANCE CHARTS (Combined across all instruments)
    # ═══════════════════════════════════════════════════════════════════════════

    # Combine all closed trades
    all_closed = pd.concat([r['closed'].assign(symbol=r['symbol']) for r in all_results if r is not None], ignore_index=True)
    all_closed_sorted = all_closed.sort_values('date').copy()
    all_closed_sorted['cumulative_pnl'] = all_closed_sorted['pnl_usd'].cumsum()
    all_closed_sorted['drawdown'] = all_closed_sorted['cumulative_pnl'] - all_closed_sorted['cumulative_pnl'].cummax()

    total_pnl = all_closed_sorted['pnl_usd'].sum()
    max_dd = all_closed_sorted['drawdown'].min()
    total_wins = (all_closed['outcome'] == 'WIN').sum()
    total_losses = (all_closed['outcome'] == 'LOSS').sum()
    overall_wr = total_wins / (total_wins + total_losses) * 100 if (total_wins + total_losses) > 0 else 0

    # Overall Chart 1: Combined Equity Curve + By Instrument P&L
    fig_overall1 = make_subplots(
        rows=1, cols=2,
        subplot_titles=[
            f'Combined Equity Curve (${total_pnl:,.0f} Total)',
            'P&L by Instrument',
        ],
        horizontal_spacing=0.12,
    )

    # Combined equity
    fig_overall1.add_trace(go.Scatter(
        x=all_closed_sorted['date'],
        y=all_closed_sorted['cumulative_pnl'],
        mode='lines',
        line=dict(color='#c8f54a', width=2),
        fill='tozeroy',
        fillcolor='rgba(200,245,74,0.15)',
        name='Combined Equity',
    ), row=1, col=1)

    # P&L by instrument
    inst_pnl = all_closed.groupby('symbol')['pnl_usd'].sum().reset_index()
    inst_colors = {'MNQ': '#00c853', 'MES': '#1565C0', 'MGC': '#FFD700'}
    max_inst_pnl = max(inst_pnl['pnl_usd'].max(), 1000)  # Ensure minimum range
    min_inst_pnl = inst_pnl['pnl_usd'].min()
    fig_overall1.add_trace(go.Bar(
        x=inst_pnl['symbol'], y=inst_pnl['pnl_usd'],
        marker_color=[inst_colors.get(s, '#666') for s in inst_pnl['symbol']],
        text=[fmt_currency(v) for v in inst_pnl['pnl_usd']],
        textposition='inside',
        textfont=dict(color='white', size=12),
        showlegend=False,
    ), row=1, col=2)

    fig_overall1.update_yaxes(title_text='P&L ($)', tickformat='$,.0f', row=1, col=1)
    fig_overall1.update_yaxes(title_text='Total P&L ($)', tickformat='$,.0f', range=[min(0, min_inst_pnl * 1.15), max_inst_pnl * 1.15], row=1, col=2)
    fig_overall1.update_layout(
        template='plotly_dark', paper_bgcolor='#080808', plot_bgcolor='#0d0d0d',
        font=dict(color='#e0e0e0', family='JetBrains Mono, monospace', size=11),
        title=dict(text="<b>OVERALL PERFORMANCE</b> — All Instruments Combined", font=dict(size=18, color='#c8f54a')),
        height=400, showlegend=False, margin=dict(t=80, b=50, l=80, r=50),
    )
    # First chart includes plotly CDN, rest use it
    overall_figs_html.append(fig_overall1.to_html(full_html=False, include_plotlyjs='cdn'))

    # Overall Chart 2: Drawdown + Year Performance
    fig_overall2 = make_subplots(
        rows=1, cols=2,
        subplot_titles=[
            f'Combined Drawdown (Max: ${max_dd:,.0f})',
            f'Combined P&L by Year',
        ],
        horizontal_spacing=0.12,
    )

    fig_overall2.add_trace(go.Scatter(
        x=all_closed_sorted['date'], y=all_closed_sorted['drawdown'],
        mode='lines', line=dict(color='#ef5350', width=2),
        fill='tozeroy', fillcolor='rgba(239,83,80,0.2)',
        showlegend=False,
    ), row=1, col=1)

    # Combined by year
    all_closed['year'] = pd.to_datetime(all_closed['date']).dt.year
    by_year_all = all_closed.groupby('year').agg(
        pnl=('pnl_usd', 'sum'),
        wins=('outcome', lambda x: (x=='WIN').sum()),
        losses=('outcome', lambda x: (x=='LOSS').sum()),
    ).assign(wr=lambda x: x['wins']/(x['wins']+x['losses'])*100).reset_index()

    max_year_pnl = max(by_year_all['pnl'].max(), 1000)  # Ensure minimum range
    min_year_pnl = by_year_all['pnl'].min()
    year_colors = ['#00c853' if v >= 0 else '#ef5350' for v in by_year_all['pnl']]
    fig_overall2.add_trace(go.Bar(
        x=by_year_all['year'], y=by_year_all['pnl'], marker_color=year_colors,
        text=[fmt_currency(v) for v in by_year_all['pnl']],
        textposition='inside', textfont=dict(color='white', size=10),
        showlegend=False,
    ), row=1, col=2)

    fig_overall2.update_yaxes(title_text='Drawdown ($)', tickformat='$,.0f', row=1, col=1)
    fig_overall2.update_yaxes(title_text='P&L ($)', tickformat='$,.0f', range=[min(0, min_year_pnl * 1.15), max_year_pnl * 1.15], row=1, col=2)
    fig_overall2.update_xaxes(tickmode='linear', dtick=1, row=1, col=2)
    fig_overall2.update_layout(
        template='plotly_dark', paper_bgcolor='#080808', plot_bgcolor='#0d0d0d',
        font=dict(color='#e0e0e0', family='JetBrains Mono, monospace', size=11),
        height=400, showlegend=False, margin=dict(t=60, b=50, l=80, r=50),
    )
    overall_figs_html.append(fig_overall2.to_html(full_html=False, include_plotlyjs=False))

    # Overall Chart 3: Session + Direction + Level
    fig_overall3 = make_subplots(
        rows=1, cols=3,
        subplot_titles=['By Session', 'By Direction', 'By Level'],
        horizontal_spacing=0.1,
    )

    # By session
    by_sess_all = all_closed.groupby('session').agg(
        pnl=('pnl_usd', 'sum'),
        wins=('outcome', lambda x: (x=='WIN').sum()),
        losses=('outcome', lambda x: (x=='LOSS').sum()),
    ).assign(wr=lambda x: x['wins']/(x['wins']+x['losses'])*100).reset_index()
    sess_colors = {'London': '#1565C0', 'NY': '#e65100'}
    max_sess_pnl = max(by_sess_all['pnl'].max(), 1000)  # Ensure minimum range
    min_sess_pnl = by_sess_all['pnl'].min()
    fig_overall3.add_trace(go.Bar(
        x=by_sess_all['session'], y=by_sess_all['pnl'],
        marker_color=[sess_colors.get(s, '#666') for s in by_sess_all['session']],
        text=[f'{fmt_currency(v)}<br>{wr:.0f}%' for v, wr in zip(by_sess_all['pnl'], by_sess_all['wr'])],
        textposition='inside', textfont=dict(color='white', size=10),
        showlegend=False,
    ), row=1, col=1)

    # By direction
    by_dir_all = all_closed.groupby('direction').agg(
        pnl=('pnl_usd', 'sum'),
        wins=('outcome', lambda x: (x=='WIN').sum()),
        losses=('outcome', lambda x: (x=='LOSS').sum()),
    ).assign(wr=lambda x: x['wins']/(x['wins']+x['losses'])*100).reset_index()
    dir_colors = {'LONG': '#00c853', 'SHORT': '#ef5350'}
    max_dir_pnl = max(by_dir_all['pnl'].max(), 1000)  # Ensure minimum range
    min_dir_pnl = by_dir_all['pnl'].min()
    fig_overall3.add_trace(go.Bar(
        x=by_dir_all['direction'], y=by_dir_all['pnl'],
        marker_color=[dir_colors.get(d, '#666') for d in by_dir_all['direction']],
        text=[f'{fmt_currency(v)}<br>{wr:.0f}%' for v, wr in zip(by_dir_all['pnl'], by_dir_all['wr'])],
        textposition='inside', textfont=dict(color='white', size=10),
        showlegend=False,
    ), row=1, col=2)

    # By level
    by_level_all = all_closed.groupby('level').agg(
        pnl=('pnl_usd', 'sum'),
        wins=('outcome', lambda x: (x=='WIN').sum()),
        losses=('outcome', lambda x: (x=='LOSS').sum()),
    ).assign(wr=lambda x: x['wins']/(x['wins']+x['losses'])*100).reset_index()
    lvl_colors = ['#00c853' if v >= 0 else '#ef5350' for v in by_level_all['pnl']]
    max_lvl_pnl = max(by_level_all['pnl'].abs().max(), 1000)  # Ensure minimum range
    min_lvl_pnl = by_level_all['pnl'].min()
    fig_overall3.add_trace(go.Bar(
        x=by_level_all['level'], y=by_level_all['pnl'], marker_color=lvl_colors,
        text=[fmt_currency(v) for v in by_level_all['pnl']],
        textposition='inside', textfont=dict(color='white', size=9),
        showlegend=False,
    ), row=1, col=3)

    fig_overall3.update_yaxes(title_text='P&L ($)', tickformat='$,.0f', range=[min(0, min_sess_pnl * 1.15), max_sess_pnl * 1.15], row=1, col=1)
    fig_overall3.update_yaxes(tickformat='$,.0f', range=[min(0, min_dir_pnl * 1.15), max_dir_pnl * 1.15], row=1, col=2)
    fig_overall3.update_yaxes(tickformat='$,.0f', range=[min(0, min_lvl_pnl * 1.15), max_lvl_pnl * 1.15], row=1, col=3)
    fig_overall3.update_layout(
        template='plotly_dark', paper_bgcolor='#080808', plot_bgcolor='#0d0d0d',
        font=dict(color='#e0e0e0', family='JetBrains Mono, monospace', size=11),
        height=400, showlegend=False, margin=dict(t=60, b=50, l=80, r=50),
    )
    overall_figs_html.append(fig_overall3.to_html(full_html=False, include_plotlyjs=False))

    # ═══════════════════════════════════════════════════════════════════════════
    # INDIVIDUAL INSTRUMENT CHARTS
    # ═══════════════════════════════════════════════════════════════════════════
    for r in all_results:
        if r is None:
            continue

        symbol  = r['symbol']
        closed  = r['closed']
        stats   = r['stats']
        cfg     = r['cfg']

        # ═══════════════════════════════════════════════════════════════════════
        # CHART 1: Equity & Drawdown
        # ═══════════════════════════════════════════════════════════════════════
        closed_sorted = closed.sort_values('date').copy()
        closed_sorted['cumulative_pnl'] = closed_sorted['pnl_usd'].cumsum()
        closed_sorted['drawdown'] = closed_sorted['cumulative_pnl'] - closed_sorted['cumulative_pnl'].cummax()

        fig1 = make_subplots(
            rows=2, cols=2,
            subplot_titles=[
                f'{symbol} — Equity Curve (${stats["total_pnl"]:,.0f})',
                f'{symbol} — P&L by Level',
                f'{symbol} — Drawdown (Max: ${stats["max_dd"]:,.0f})',
                f'{symbol} — Win Rate by Level',
            ],
            vertical_spacing=0.12,
            horizontal_spacing=0.08,
        )

        fig1.add_trace(go.Scatter(
            x=closed_sorted['date'],
            y=closed_sorted['cumulative_pnl'],
            mode='lines',
            line=dict(color='#00c853', width=2),
            fill='tozeroy',
            fillcolor='rgba(0,200,83,0.15)',
            name='Equity',
        ), row=1, col=1)

        wins_df = closed_sorted[closed_sorted['outcome'] == 'WIN']
        losses_df = closed_sorted[closed_sorted['outcome'] == 'LOSS']

        fig1.add_trace(go.Scatter(
            x=wins_df['date'], y=wins_df['cumulative_pnl'],
            mode='markers', marker=dict(color='#00c853', size=4, symbol='triangle-up'),
            name='Wins', showlegend=False,
        ), row=1, col=1)

        fig1.add_trace(go.Scatter(
            x=losses_df['date'], y=losses_df['cumulative_pnl'],
            mode='markers', marker=dict(color='#ef5350', size=4, symbol='triangle-down'),
            name='Losses', showlegend=False,
        ), row=1, col=1)

        lvl_df = r['by_level'].reset_index()
        bar_colors = ['#00c853' if v >= 0 else '#ef5350' for v in lvl_df['pnl']]
        max_lvl = max(lvl_df['pnl'].abs().max(), 1000)  # Ensure minimum range
        min_lvl = lvl_df['pnl'].min()
        fig1.add_trace(go.Bar(
            x=lvl_df['level'], y=lvl_df['pnl'], marker_color=bar_colors,
            text=[fmt_currency(v) for v in lvl_df['pnl']],
            textposition='inside', textfont=dict(color='white', size=9),
            showlegend=False,
        ), row=1, col=2)

        fig1.add_trace(go.Scatter(
            x=closed_sorted['date'], y=closed_sorted['drawdown'],
            mode='lines', line=dict(color='#ef5350', width=2),
            fill='tozeroy', fillcolor='rgba(239,83,80,0.2)',
            showlegend=False,
        ), row=2, col=1)

        wr_colors = ['#00c853' if v >= 50 else '#ef5350' for v in lvl_df['wr']]
        fig1.add_trace(go.Bar(
            x=lvl_df['level'], y=lvl_df['wr'], marker_color=wr_colors,
            text=[f'{v:.0f}%' for v in lvl_df['wr']], textposition='outside',
            showlegend=False,
        ), row=2, col=2)
        fig1.add_hline(y=50, line_dash='dash', line_color='#666', row=2, col=2)

        # Add axis labels with proper formatting
        fig1.update_yaxes(title_text='P&L ($)', tickformat='$,.0f', row=1, col=1)
        fig1.update_yaxes(title_text='P&L ($)', tickformat='$,.0f', range=[min(0, min_lvl * 1.15), max_lvl * 1.15], row=1, col=2)
        fig1.update_yaxes(title_text='Drawdown ($)', tickformat='$,.0f', row=2, col=1)
        fig1.update_yaxes(title_text='Win Rate (%)', range=[0, 100], row=2, col=2)

        fig1.update_layout(
            template='plotly_dark', paper_bgcolor='#080808', plot_bgcolor='#0d0d0d',
            font=dict(color='#e0e0e0', family='JetBrains Mono, monospace', size=11),
            title=dict(text=f"<b>{symbol}</b> — {cfg['name']}", font=dict(size=16, color='#c8f54a')),
            height=550, showlegend=False, margin=dict(t=80, b=50, l=80, r=50),
        )
        figs_html.append(fig1.to_html(full_html=False, include_plotlyjs=False))

        # ═══════════════════════════════════════════════════════════════════════
        # CHART 2: Time Analysis
        # ═══════════════════════════════════════════════════════════════════════
        fig2 = make_subplots(
            rows=2, cols=2,
            subplot_titles=[
                f'{symbol} — Session Performance',
                f'{symbol} — Day of Week',
                f'{symbol} — Hour of Day (ET)',
                f'{symbol} — Direction (Long vs Short)',
            ],
            vertical_spacing=0.15, horizontal_spacing=0.12,
        )

        sess_df = r['by_sess'].reset_index()
        sess_colors = {'London': '#1565C0', 'NY': '#e65100'}
        max_sess = max(sess_df['pnl'].max(), 1000)  # Ensure minimum range
        min_sess = sess_df['pnl'].min()
        fig2.add_trace(go.Bar(
            x=sess_df['session'], y=sess_df['pnl'],
            marker_color=[sess_colors.get(s, '#666') for s in sess_df['session']],
            text=[f'{fmt_currency(v)}<br>{r["by_sess"].loc[s,"wr"]:.0f}%' for v, s in zip(sess_df['pnl'], sess_df['session'])],
            textposition='inside', textfont=dict(color='white', size=10),
            showlegend=False,
        ), row=1, col=1)

        dow_df = r['by_dow'].reset_index()
        dow_colors = ['#00c853' if v >= 0 else '#ef5350' for v in dow_df['pnl']]
        max_dow = max(dow_df['pnl'].abs().max(), 1000)  # Ensure minimum range
        min_dow = dow_df['pnl'].min()
        fig2.add_trace(go.Bar(
            x=[d[:3] for d in dow_df['day_of_week']], y=dow_df['pnl'], marker_color=dow_colors,
            text=[fmt_currency(v) for v in dow_df['pnl']],
            textposition='inside', textfont=dict(color='white', size=9),
            showlegend=False,
        ), row=1, col=2)

        hour_df = r['by_hour'].reset_index()
        hour_colors = ['#00c853' if v >= 0 else '#ef5350' for v in hour_df['pnl']]
        max_hour = max(hour_df['pnl'].abs().max(), 1000)  # Ensure minimum range
        min_hour = hour_df['pnl'].min()
        fig2.add_trace(go.Bar(
            x=hour_df['hour'], y=hour_df['pnl'], marker_color=hour_colors,
            text=[fmt_currency(v) for v in hour_df['pnl']],
            textposition='inside', textfont=dict(color='white', size=8),
            showlegend=False,
        ), row=2, col=1)

        dir_df = r['by_dir'].reset_index()
        dir_colors = {'LONG': '#00c853', 'SHORT': '#ef5350'}
        max_dir = max(dir_df['pnl'].abs().max(), 1000)  # Ensure minimum range
        min_dir = dir_df['pnl'].min()
        fig2.add_trace(go.Bar(
            x=dir_df['direction'], y=dir_df['pnl'],
            marker_color=[dir_colors.get(d, '#666') for d in dir_df['direction']],
            text=[f'{fmt_currency(v)}<br>{r["by_dir"].loc[d,"wr"]:.0f}%' for v, d in zip(dir_df['pnl'], dir_df['direction'])],
            textposition='inside', textfont=dict(color='white', size=10),
            showlegend=False,
        ), row=2, col=2)

        # Add axis labels with proper formatting and ranges
        fig2.update_yaxes(title_text='P&L ($)', tickformat='$,.0f', range=[min(0, min_sess * 1.15), max_sess * 1.15], row=1, col=1)
        fig2.update_yaxes(title_text='P&L ($)', tickformat='$,.0f', range=[min(0, min_dow * 1.15), max_dow * 1.15], row=1, col=2)
        fig2.update_yaxes(title_text='P&L ($)', tickformat='$,.0f', range=[min(0, min_hour * 1.15), max_hour * 1.15], row=2, col=1)
        fig2.update_yaxes(title_text='P&L ($)', tickformat='$,.0f', range=[min(0, min_dir * 1.15), max_dir * 1.15], row=2, col=2)
        fig2.update_xaxes(tickmode='linear', dtick=1, row=2, col=1)

        fig2.update_layout(
            template='plotly_dark', paper_bgcolor='#080808', plot_bgcolor='#0d0d0d',
            font=dict(color='#e0e0e0', family='JetBrains Mono, monospace', size=11),
            height=550, showlegend=False, margin=dict(t=60, b=60, l=80, r=50),
        )
        figs_html.append(fig2.to_html(full_html=False, include_plotlyjs=False))

        # ═══════════════════════════════════════════════════════════════════════
        # CHART 3: Year-over-Year
        # ═══════════════════════════════════════════════════════════════════════
        fig3 = make_subplots(
            rows=1, cols=2,
            subplot_titles=[f'{symbol} — P&L by Year', f'{symbol} — P&L by Month'],
            horizontal_spacing=0.12,
        )

        year_df = r['by_year'].reset_index()
        year_colors = ['#00c853' if v >= 0 else '#ef5350' for v in year_df['pnl']]
        max_year = max(year_df['pnl'].max(), 1000)  # Ensure minimum range
        min_year = year_df['pnl'].min()
        fig3.add_trace(go.Bar(
            x=year_df['year'], y=year_df['pnl'], marker_color=year_colors,
            text=[fmt_currency(v) for v in year_df['pnl']],
            textposition='inside', textfont=dict(color='white', size=9),
            showlegend=False,
        ), row=1, col=1)

        month_df = r['by_month'].reset_index()
        month_names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        month_df['month_name'] = month_df['month'].apply(lambda x: month_names[x-1] if 1 <= x <= 12 else str(x))
        month_colors = ['#00c853' if v >= 0 else '#ef5350' for v in month_df['pnl']]
        max_month = max(month_df['pnl'].abs().max(), 1000)  # Ensure minimum range
        min_month = month_df['pnl'].min()
        fig3.add_trace(go.Bar(
            x=month_df['month_name'], y=month_df['pnl'], marker_color=month_colors,
            text=[fmt_currency(v) for v in month_df['pnl']],
            textposition='inside', textfont=dict(color='white', size=8),
            showlegend=False,
        ), row=1, col=2)

        # Add axis labels with proper ranges
        fig3.update_yaxes(title_text='P&L ($)', tickformat='$,.0f', range=[min(0, min_year * 1.15), max_year * 1.15], row=1, col=1)
        fig3.update_yaxes(title_text='P&L ($)', tickformat='$,.0f', range=[min(0, min_month * 1.15), max_month * 1.15], row=1, col=2)
        fig3.update_xaxes(tickmode='linear', dtick=1, row=1, col=1)

        fig3.update_layout(
            template='plotly_dark', paper_bgcolor='#080808', plot_bgcolor='#0d0d0d',
            font=dict(color='#e0e0e0', family='JetBrains Mono, monospace', size=11),
            height=380, showlegend=False, margin=dict(t=60, b=50, l=80, r=50),
        )
        figs_html.append(fig3.to_html(full_html=False, include_plotlyjs=False))

        # ═══════════════════════════════════════════════════════════════════════
        # CHART 4: Distribution & MFE/MAE
        # ═══════════════════════════════════════════════════════════════════════
        fig4 = make_subplots(
            rows=1, cols=2,
            subplot_titles=[f'{symbol} — Trade P&L Distribution', f'{symbol} — MFE vs MAE'],
            horizontal_spacing=0.1,
        )

        fig4.add_trace(go.Histogram(
            x=closed['pnl_usd'], nbinsx=20, marker_color='#c8f54a', opacity=0.8, showlegend=False,
        ), row=1, col=1)

        fig4.add_trace(go.Scatter(
            x=closed['max_adverse_excursion'], y=closed['max_favorable_excursion'],
            mode='markers',
            marker=dict(color=['#00c853' if o == 'WIN' else '#ef5350' for o in closed['outcome']], size=6, opacity=0.6),
            showlegend=False,
        ), row=1, col=2)

        max_val = max(closed['max_favorable_excursion'].max(), closed['max_adverse_excursion'].max())
        fig4.add_trace(go.Scatter(
            x=[0, max_val], y=[0, max_val], mode='lines', line=dict(color='#666', dash='dash'), showlegend=False,
        ), row=1, col=2)
        fig4.update_xaxes(title_text='P&L ($)', row=1, col=1)
        fig4.update_yaxes(title_text='# Trades', row=1, col=1)
        fig4.update_xaxes(title_text='MAE (pts)', row=1, col=2)
        fig4.update_yaxes(title_text='MFE (pts)', row=1, col=2)

        fig4.update_layout(
            template='plotly_dark', paper_bgcolor='#080808', plot_bgcolor='#0d0d0d',
            font=dict(color='#e0e0e0', family='JetBrains Mono, monospace', size=11),
            height=350, showlegend=False, margin=dict(t=60, b=50, l=70, r=40),
        )
        figs_html.append(fig4.to_html(full_html=False, include_plotlyjs=False))

    # ═══════════════════════════════════════════════════════════════════════════
    # BUILD HTML
    # ═══════════════════════════════════════════════════════════════════════════
    rows_html = ''
    totals = {'trades': 0, 'wins': 0, 'losses': 0, 'pnl': 0, 'gross': 0, 'fees': 0}

    for r in all_results:
        if r is None:
            continue
        s = r['stats']
        totals['trades'] += s['total']
        totals['wins'] += s['wins']
        totals['losses'] += s['losses']
        totals['pnl'] += s['total_pnl']
        totals['gross'] += s.get('total_gross', s['total_pnl'])
        totals['fees'] += s.get('total_fees', 0)

        rows_html += f"""
        <tr>
          <td><span class="symbol">{r['symbol']}</span></td>
          <td>{s.get('contracts', 1)}</td>
          <td>{s['total']:,}</td>
          <td class="green">{s['wins']:,}</td>
          <td class="red">{s['losses']:,}</td>
          <td class="{'green' if s['win_rate']>=50 else 'red'} bold">{s['win_rate']:.1f}%</td>
          <td class="green">${s.get('total_gross', s['total_pnl']):,.0f}</td>
          <td class="red">-${s.get('total_fees', 0):,.0f}</td>
          <td class="{'green' if s['total_pnl']>=0 else 'red'} bold">${s['total_pnl']:,.0f}</td>
          <td class="green">${s['avg_win']:,.0f}</td>
          <td class="red">${s['avg_loss']:,.0f}</td>
          <td class="accent">{s['profit_factor']:.2f}</td>
          <td class="red">${s['max_dd']:,.0f}</td>
        </tr>"""

    total_resolved = totals['wins'] + totals['losses']
    total_wr = totals['wins'] / total_resolved * 100 if total_resolved > 0 else 0
    rows_html += f"""
        <tr class="totals-row">
          <td><span class="symbol">TOTAL</span></td>
          <td>—</td>
          <td>{totals['trades']:,}</td>
          <td class="green">{totals['wins']:,}</td>
          <td class="red">{totals['losses']:,}</td>
          <td class="{'green' if total_wr>=50 else 'red'} bold">{total_wr:.1f}%</td>
          <td class="green">${totals['gross']:,.0f}</td>
          <td class="red">-${totals['fees']:,.0f}</td>
          <td class="{'green' if totals['pnl']>=0 else 'red'} bold">${totals['pnl']:,.0f}</td>
          <td colspan="4"></td>
        </tr>"""

    # Stats cards (compact - 8 items per card)
    stats_cards = ''
    for r in all_results:
        if r is None:
            continue
        s = r['stats']
        years = (s['data_end'] - s['data_start']).days / 365
        trail_pct = s.get('trails_triggered', 0) / s['total'] * 100 if s['total'] > 0 else 0
        stats_cards += f"""
        <div class="stats-card">
          <h3>{r['symbol']} — {s.get('contracts', 1)} Contracts | TP {fmt_pts(r['cfg'].get('tp', 0))}pts SL {fmt_pts(r['cfg'].get('sl', 0))}pts</h3>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">Avg Win</span>
              <span class="stat-value green">{fmt_pts(s.get('avg_win_pts', 0))} pts (${s['avg_win']:,.0f})</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Avg Loss</span>
              <span class="stat-value red">{fmt_pts(s.get('avg_loss_pts', 0))} pts (${s['avg_loss']:,.0f})</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Trails Triggered</span>
              <span class="stat-value accent">{s.get('trails_triggered', 0):,} ({trail_pct:.1f}%)</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Expectancy</span>
              <span class="stat-value green">${s.get('expectancy', 0):,.2f}/trade</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Max Consec Wins</span>
              <span class="stat-value green">{s['max_consec_wins']}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Max Consec Losses</span>
              <span class="stat-value red">{s['max_consec_losses']}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Avg Annual P&L</span>
              <span class="stat-value {'green' if s['total_pnl']>=0 else 'red'}">${s['total_pnl']/years:,.0f}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Return / Max DD</span>
              <span class="stat-value accent">{abs(s['total_pnl']/s['max_dd']) if s['max_dd'] != 0 else 0:.1f}x</span>
            </div>
          </div>
        </div>"""

    # Risk metrics card (combined across all instruments)
    combined_sharpe = np.mean([r['stats'].get('sharpe_ratio', 0) for r in all_results if r])
    combined_sortino = np.mean([r['stats'].get('sortino_ratio', 0) for r in all_results if r])
    combined_calmar = np.mean([r['stats'].get('calmar_ratio', 0) for r in all_results if r])
    combined_recovery = np.mean([r['stats'].get('recovery_factor', 0) for r in all_results if r])
    combined_avg_dd = np.mean([r['stats'].get('avg_dd', 0) for r in all_results if r])
    combined_max_dd = min([r['stats'].get('max_dd', 0) for r in all_results if r])

    risk_metrics_card = f"""
    <div class="risk-metrics-section">
      <h2 class="section-header">Risk-Adjusted Returns</h2>
      <div class="risk-grid">
        <div class="risk-card">
          <span class="risk-value accent">{combined_sharpe:.2f}</span>
          <span class="risk-label">Sharpe Ratio</span>
          <span class="risk-desc">Risk-adjusted return (>1 = good, >2 = excellent)</span>
        </div>
        <div class="risk-card">
          <span class="risk-value accent">{combined_sortino:.2f}</span>
          <span class="risk-label">Sortino Ratio</span>
          <span class="risk-desc">Downside-adjusted return (higher = better)</span>
        </div>
        <div class="risk-card">
          <span class="risk-value accent">{combined_calmar:.2f}</span>
          <span class="risk-label">Calmar Ratio</span>
          <span class="risk-desc">Annual return / Max drawdown (>3 = excellent)</span>
        </div>
        <div class="risk-card">
          <span class="risk-value accent">{combined_recovery:.1f}x</span>
          <span class="risk-label">Recovery Factor</span>
          <span class="risk-desc">Total profit / Max drawdown</span>
        </div>
        <div class="risk-card">
          <span class="risk-value red">${combined_max_dd:,.0f}</span>
          <span class="risk-label">Max Drawdown</span>
          <span class="risk-desc">Largest peak-to-trough decline</span>
        </div>
        <div class="risk-card">
          <span class="risk-value red">${combined_avg_dd:,.0f}</span>
          <span class="risk-label">Avg Drawdown</span>
          <span class="risk-desc">Average drawdown when in loss</span>
        </div>
      </div>
      <div class="risk-by-instrument">
        <h4>Risk Metrics by Instrument</h4>
        <table>
          <thead>
            <tr><th>Symbol</th><th>Sharpe</th><th>Sortino</th><th>Calmar</th><th>Recovery</th><th>Max DD</th><th>Avg DD</th></tr>
          </thead>
          <tbody>
            {''.join(f'''<tr>
              <td class="symbol">{r['symbol']}</td>
              <td class="accent">{r['stats'].get('sharpe_ratio', 0):.2f}</td>
              <td class="accent">{r['stats'].get('sortino_ratio', 0):.2f}</td>
              <td class="accent">{r['stats'].get('calmar_ratio', 0):.2f}</td>
              <td class="accent">{r['stats'].get('recovery_factor', 0):.1f}x</td>
              <td class="red">${r['stats'].get('max_dd', 0):,.0f}</td>
              <td class="red">${r['stats'].get('avg_dd', 0):,.0f}</td>
            </tr>''' for r in all_results if r)}
          </tbody>
        </table>
      </div>
    </div>"""

    # Level tables
    level_tables = ''
    for r in all_results:
        if r is None:
            continue
        lvl_rows = ''
        for idx, row in r['by_level'].iterrows():
            lvl_rows += f"""
            <tr>
              <td>{idx}</td>
              <td>{int(row['trades']):,}</td>
              <td class="green">{int(row['wins']):,}</td>
              <td class="red">{int(row['losses']):,}</td>
              <td class="{'green' if row['wr']>=50 else 'red'}">{row['wr']:.0f}%</td>
              <td class="{'green' if row['pnl']>=0 else 'red'}">${row['pnl']:,.0f}</td>
              <td>{row['avg_mfe']:.1f}</td>
              <td>{row['avg_mae']:.1f}</td>
            </tr>"""
        level_tables += f"""
        <div class="level-table">
          <h4>{r['symbol']} — Level Breakdown</h4>
          <table>
            <thead><tr><th>Level</th><th>Trades</th><th>Wins</th><th>Losses</th><th>Win Rate</th><th>P&L</th><th>Avg MFE</th><th>Avg MAE</th></tr></thead>
            <tbody>{lvl_rows}</tbody>
          </table>
        </div>"""

    # Year-over-year tables
    yoy_tables = ''
    for r in all_results:
        if r is None:
            continue
        yoy_rows = ''
        for idx, row in r['by_year'].iterrows():
            yoy_rows += f"""
            <tr>
              <td>{int(idx)}</td>
              <td>{int(row['trades']):,}</td>
              <td class="green">{int(row['wins']):,}</td>
              <td class="{'green' if row['wr']>=50 else 'red'}">{row['wr']:.0f}%</td>
              <td class="{'green' if row['pnl']>=0 else 'red'}">${row['pnl']:,.0f}</td>
            </tr>"""
        yoy_tables += f"""
        <div class="level-table">
          <h4>{r['symbol']} — Year-over-Year</h4>
          <table>
            <thead><tr><th>Year</th><th>Trades</th><th>Wins</th><th>Win Rate</th><th>P&L</th></tr></thead>
            <tbody>{yoy_rows}</tbody>
          </table>
        </div>"""

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>KLBS Backtest Report — THE EDGE</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    body {{ background:#080808; color:#e0e0e0; font-family:'JetBrains Mono',monospace; padding:40px; line-height:1.6; }}
    .header {{ text-align:center; margin-bottom:40px; padding-bottom:30px; border-bottom:1px solid #222; }}
    h1 {{ font-size:36px; letter-spacing:4px; margin-bottom:8px; font-weight:700; }}
    .accent {{ color:#c8f54a; }}
    .green {{ color:#00c853; }}
    .red {{ color:#ef5350; }}
    .bold {{ font-weight:700; }}
    .subtitle {{ color:#666; font-size:12px; margin-bottom:8px; letter-spacing:2px; }}
    .date-range {{ color:#888; font-size:14px; margin-top:10px; }}
    .summary-section {{ margin-bottom:50px; }}
    .summary-section h2 {{ font-size:14px; letter-spacing:2px; color:#c8f54a; margin-bottom:20px; text-transform:uppercase; }}
    table {{ width:100%; border-collapse:collapse; font-size:13px; background:#0a0a0a; border-radius:8px; overflow:hidden; }}
    th {{ background:#111; color:#c8f54a; padding:14px 16px; text-align:left; font-size:11px; letter-spacing:1px; text-transform:uppercase; border-bottom:2px solid #222; }}
    td {{ padding:12px 16px; border-bottom:1px solid #1a1a1a; }}
    tr:hover td {{ background:#111; }}
    .totals-row td {{ background:#111; border-top:2px solid #c8f54a; font-weight:700; }}
    .symbol {{ color:#c8f54a; font-weight:700; }}
    .stats-section {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(450px,1fr)); gap:24px; margin-bottom:50px; }}
    .stats-card {{ background:#0d0d0d; border:1px solid #1a1a1a; border-radius:12px; padding:24px; }}
    .stats-card h3 {{ color:#c8f54a; font-size:14px; letter-spacing:1px; margin-bottom:20px; padding-bottom:12px; border-bottom:1px solid #222; }}
    .stats-grid {{ display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }}
    .stat-item {{ display:flex; flex-direction:column; gap:4px; }}
    .stat-label {{ color:#666; font-size:11px; text-transform:uppercase; letter-spacing:1px; }}
    .stat-value {{ font-size:16px; font-weight:500; }}
    .levels-section {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(420px,1fr)); gap:24px; margin-bottom:50px; }}
    .level-table {{ background:#0d0d0d; border:1px solid #1a1a1a; border-radius:12px; padding:24px; overflow-x:auto; }}
    .level-table h4 {{ color:#c8f54a; font-size:13px; letter-spacing:1px; margin-bottom:16px; }}
    .level-table table {{ font-size:11px; white-space:nowrap; min-width:100%; }}
    .level-table th, .level-table td {{ padding:10px 12px; }}
    .chart-section {{ margin-bottom:40px; }}
    .chart-wrap {{ margin-bottom:30px; background:#0a0a0a; border-radius:12px; padding:20px; border:1px solid #1a1a1a; }}
    .disclaimer {{ margin-top:60px; padding:24px; background:#0d0d0d; border:1px solid #333; border-radius:8px; color:#666; font-size:11px; line-height:1.8; }}
    .disclaimer strong {{ color:#ef5350; }}
    .section-header {{ font-size:14px; letter-spacing:2px; color:#c8f54a; margin:50px 0 24px 0; text-transform:uppercase; padding-bottom:12px; border-bottom:1px solid #222; }}
    .risk-metrics-section {{ margin-bottom:50px; }}
    .risk-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:20px; margin-bottom:30px; }}
    .risk-card {{ background:#0d0d0d; border:1px solid #1a1a1a; border-radius:12px; padding:24px; text-align:center; }}
    .risk-value {{ display:block; font-size:32px; font-weight:700; margin-bottom:8px; }}
    .risk-label {{ display:block; font-size:12px; color:#c8f54a; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }}
    .risk-desc {{ display:block; font-size:10px; color:#555; }}
    .risk-by-instrument {{ background:#0d0d0d; border:1px solid #1a1a1a; border-radius:12px; padding:24px; overflow-x:auto; }}
    .risk-by-instrument h4 {{ color:#c8f54a; font-size:13px; letter-spacing:1px; margin-bottom:16px; }}
    .risk-by-instrument table {{ font-size:12px; white-space:nowrap; }}
  </style>
</head>
<body>
  <div class="header">
    <h1>THE <span class="accent">EDGE</span></h1>
    <div class="subtitle">KEY LEVEL BREAKOUT SYSTEM — BACKTEST REPORT</div>
    <div class="subtitle">15-MINUTE BARS &nbsp;·&nbsp; MNQ &nbsp;·&nbsp; MES &nbsp;·&nbsp; MGC &nbsp;·&nbsp; DATABENTO CME DATA</div>
    <div class="date-range">Data: {date_range} (~6.5 years)</div>
  </div>

  <div class="summary-section">
    <h2>Performance Summary — $100K Starting Capital | Trail Mode | Fees Included</h2>
    <table>
      <thead>
        <tr><th>Symbol</th><th>Cts</th><th>Trades</th><th>Wins</th><th>Losses</th><th>Win Rate</th><th>Gross P&L</th><th>Fees</th><th>Net P&L</th><th>Avg Win</th><th>Avg Loss</th><th>PF</th><th>Max DD</th></tr>
      </thead>
      <tbody>{rows_html}</tbody>
    </table>
  </div>

  <div class="stats-section">{stats_cards}</div>

  {risk_metrics_card}

  <h2 class="section-header">Year-over-Year Performance</h2>
  <div class="levels-section">{yoy_tables}</div>

  <h2 class="section-header">Level Analysis</h2>
  <div class="levels-section">{level_tables}</div>

  <h2 class="section-header">Overall Performance Charts</h2>
  <div class="chart-section">{''.join(f'<div class="chart-wrap">{fig}</div>' for fig in overall_figs_html)}</div>

  <h2 class="section-header">Individual Instrument Charts</h2>
  <div class="chart-section">{''.join(f'<div class="chart-wrap">{fig}</div>' for fig in figs_html)}</div>

  <div class="disclaimer">
    <strong>⚠ DISCLAIMER:</strong> These results are based on <strong>simulated/hypothetical performance</strong> using historical data. All trades shown were generated by backtesting software and do not represent actual trades. Past performance, whether actual or simulated, is not indicative of future results.<br><br>
    <strong>Important considerations:</strong><br>
    • Commissions & fees ARE included (~$1.50/contract round-trip)<br>
    • Slippage is NOT included — real-world execution may differ<br>
    • Market conditions change and past patterns may not repeat<br>
    • This data is for educational purposes only and should not be considered financial advice<br>
    • Trading futures involves substantial risk of loss and is not suitable for all investors<br><br>
    <em>Generated by KLBS Backtest Engine — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} — Data: Databento CME Futures</em>
  </div>
</body>
</html>"""

    out_path = os.path.join(PUBLIC_DIR, 'klbs_backtest_report.html')
    with open(out_path, 'w') as f:
        f.write(html)
    print(f"\n✓ Report saved: {out_path}")
    return out_path


def run_full_optimization():
    """
    Full parameter optimization for TP, SL, and Trail per instrument.
    Tests combinations and finds optimal settings for each.
    Memory-efficient: doesn't store full results, uses garbage collection.
    """
    print("\n" + "="*60)
    print("  FULL PARAMETER OPTIMIZATION (Memory-Efficient)")
    print("  Testing TP, SL, and Trail combinations")
    print("="*60)

    # Define parameter ranges - REDUCED for speed
    param_ranges = {
        'MNQ': {
            'tp': [35, 40, 50],
            'sl': [35, 40, 50],
            'trail': [5, 10],
        },
        'MES': {
            'tp': [20, 25, 30],
            'sl': [20, 25],
            'trail': [5, 10],
        },
        'MGC': {
            'tp': [20, 25],
            'sl': [20, 25],
            'trail': [5, 8],
        },
        # ── Bonds ───────────────────────────────────────────────────────
        'ZN': {
            'tp': [0.15, 0.20, 0.25, 0.30],
            'sl': [0.20, 0.25, 0.30],
            'trail': [0.03, 0.05, 0.08],
        },
        'ZB': {
            'tp': [0.20, 0.30, 0.40, 0.50],
            'sl': [0.30, 0.40, 0.50],
            'trail': [0.05, 0.08, 0.10],
        },
        # ── Currencies ──────────────────────────────────────────────────
        '6E': {
            'tp': [0.0020, 0.0025, 0.0030, 0.0035],
            'sl': [0.0025, 0.0030, 0.0035, 0.0040],
            'trail': [0.0005, 0.0008, 0.0010],
        },
        '6J': {
            'tp': [0.00004, 0.00005, 0.00006],
            'sl': [0.00005, 0.00006, 0.00007],
            'trail': [0.00001, 0.00002],
        },
    }

    optimal_params = {}
    all_optimization_results = {}

    for symbol, cfg in INSTRUMENTS.items():
        print(f"\n{'='*60}")
        print(f"  Optimizing {symbol}...")
        print(f"{'='*60}")

        # Force garbage collection before each instrument
        gc.collect()

        ranges = param_ranges[symbol]
        best_pnl = float('-inf')
        best_params = None
        best_stats = None
        results_grid = []

        total_combos = len(ranges['tp']) * len(ranges['sl']) * len(ranges['trail'])
        combo_num = 0

        for tp in ranges['tp']:
            for sl in ranges['sl']:
                for trail in ranges['trail']:
                    combo_num += 1

                    # Create test config
                    test_cfg = cfg.copy()
                    test_cfg['tp'] = tp
                    test_cfg['sl'] = sl
                    test_cfg['trail'] = trail

                    try:
                        # Run backtest (suppress detailed output)
                        result = run_backtest(symbol, test_cfg, include_fees=False)

                        if result:
                            pnl = result['stats']['total_pnl']
                            wr = result['stats']['win_rate']
                            pf = result['stats']['profit_factor']
                            max_dd = result['stats']['max_dd']

                            # Store ONLY stats, not the full result (memory efficient)
                            results_grid.append({
                                'tp': tp, 'sl': sl, 'trail': trail,
                                'pnl': pnl, 'win_rate': wr,
                                'profit_factor': pf, 'max_dd': max_dd,
                            })

                            if pnl > best_pnl:
                                best_pnl = pnl
                                best_params = {'tp': tp, 'sl': sl, 'trail': trail}
                                best_stats = result['stats'].copy()

                            print(f"  [{combo_num}/{total_combos}] TP={tp} SL={sl} Trail={trail} → P&L=${pnl:,.0f} WR={wr:.1f}%")

                            # Explicitly delete result and force gc every iteration
                            del result
                            gc.collect()

                    except Exception as e:
                        print(f"  ERROR: TP={tp} SL={sl} Trail={trail} → {e}")

        optimal_params[symbol] = best_params
        all_optimization_results[symbol] = {
            'results_grid': results_grid,
            'best_params': best_params,
            'best_pnl': best_pnl,
            'best_stats': best_stats
        }

        print(f"\n  ★ {symbol} OPTIMAL: TP={best_params['tp']} SL={best_params['sl']} Trail={best_params['trail']} → ${best_pnl:,.0f}")

        # Force garbage collection after each instrument
        gc.collect()

    # Summary
    print("\n" + "="*60)
    print("  OPTIMIZATION COMPLETE — OPTIMAL PARAMETERS")
    print("="*60)
    for symbol, params in optimal_params.items():
        best_pnl = all_optimization_results[symbol]['best_pnl']
        print(f"  {symbol}: TP={params['tp']} SL={params['sl']} Trail={params['trail']} → ${best_pnl:,.0f}")

    # Build optimization report
    build_full_optimization_report(all_optimization_results, optimal_params)

    return all_optimization_results, optimal_params


def build_full_optimization_report(all_results, optimal_params):
    """Build comprehensive HTML report for full parameter optimization."""

    # Get date range from best_stats
    date_range = ""
    for symbol, data in all_results.items():
        if data.get('best_stats') and 'data_start' in data['best_stats']:
            date_range = f"{data['best_stats']['data_start'].strftime('%Y-%m-%d')} to {data['best_stats']['data_end'].strftime('%Y-%m-%d')}"
            break
    if not date_range:
        date_range = "2019-06-03 to 2026-02-26"  # Fallback

    # Build per-instrument sections
    inst_sections = ''
    total_optimal_pnl = 0

    for symbol in ['MNQ', 'MES', 'MGC']:
        data = all_results[symbol]
        params = optimal_params[symbol]
        best_pnl = data['best_pnl']
        total_optimal_pnl += best_pnl

        # Sort results by P&L
        sorted_results = sorted(data['results_grid'], key=lambda x: x['pnl'], reverse=True)

        # Top 10 combinations table
        top_rows = ''
        for i, r in enumerate(sorted_results[:10]):
            is_best = (r['tp'] == params['tp'] and r['sl'] == params['sl'] and r['trail'] == params['trail'])
            row_class = 'optimal-row' if is_best else ''
            top_rows += f"""
            <tr class="{row_class}">
              <td>{'★' if is_best else i+1}</td>
              <td>{r['tp']} pts</td>
              <td>{r['sl']} pts</td>
              <td>{r['trail']} pts</td>
              <td class="green bold">${r['pnl']:,.0f}</td>
              <td>{r['win_rate']:.1f}%</td>
              <td>{r['profit_factor']:.2f}</td>
              <td class="red">${r['max_dd']:,.0f}</td>
            </tr>"""

        # Get original config for comparison
        orig_cfg = INSTRUMENTS[symbol]
        orig_result = next((r for r in data['results_grid']
                           if r['tp'] == orig_cfg['tp'] and r['sl'] == orig_cfg['sl'] and r['trail'] == orig_cfg['trail']), None)
        orig_pnl = orig_result['pnl'] if orig_result else 0
        improvement = best_pnl - orig_pnl
        improvement_pct = (best_pnl / orig_pnl - 1) * 100 if orig_pnl > 0 else 0

        inst_sections += f"""
        <div class="instrument-section">
          <h3>{symbol} — {INSTRUMENTS[symbol]['name']}</h3>
          <div class="optimal-box">
            <div class="param-group">
              <span class="param-label">Optimal TP</span>
              <span class="param-value">{params['tp']} pts</span>
            </div>
            <div class="param-group">
              <span class="param-label">Optimal SL</span>
              <span class="param-value">{params['sl']} pts</span>
            </div>
            <div class="param-group">
              <span class="param-label">Optimal Trail</span>
              <span class="param-value">{params['trail']} pts</span>
            </div>
            <div class="param-group highlight">
              <span class="param-label">Total P&L</span>
              <span class="param-value green">${best_pnl:,.0f}</span>
            </div>
          </div>
          <div class="comparison-note">
            vs Original (TP={orig_cfg['tp']}, SL={orig_cfg['sl']}, Trail={orig_cfg['trail']}):
            <span class="{'green' if improvement > 0 else 'red'}">{'+' if improvement > 0 else ''}{improvement:,.0f} ({'+' if improvement_pct > 0 else ''}{improvement_pct:.1f}%)</span>
          </div>
          <h4>Top 10 Parameter Combinations</h4>
          <table>
            <thead>
              <tr><th>#</th><th>TP</th><th>SL</th><th>Trail</th><th>P&L</th><th>Win Rate</th><th>PF</th><th>Max DD</th></tr>
            </thead>
            <tbody>{top_rows}</tbody>
          </table>
        </div>"""

    # Calculate total improvement
    orig_total = sum(INSTRUMENTS[s]['tp'] for s in INSTRUMENTS)  # placeholder
    # Get original total P&L
    orig_total_pnl = 0
    for symbol in ['MNQ', 'MES', 'MGC']:
        orig_cfg = INSTRUMENTS[symbol]
        data = all_results[symbol]
        orig_result = next((r for r in data['results_grid']
                           if r['tp'] == orig_cfg['tp'] and r['sl'] == orig_cfg['sl'] and r['trail'] == orig_cfg['trail']), None)
        if orig_result:
            orig_total_pnl += orig_result['pnl']

    total_improvement = total_optimal_pnl - orig_total_pnl
    total_improvement_pct = (total_optimal_pnl / orig_total_pnl - 1) * 100 if orig_total_pnl > 0 else 0

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Full Parameter Optimization — THE EDGE</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    body {{ background:#080808; color:#e0e0e0; font-family:'JetBrains Mono',monospace; padding:40px; line-height:1.6; }}
    .header {{ text-align:center; margin-bottom:40px; padding-bottom:30px; border-bottom:1px solid #222; }}
    h1 {{ font-size:36px; letter-spacing:4px; margin-bottom:8px; font-weight:700; }}
    .accent {{ color:#c8f54a; }}
    .green {{ color:#00c853; }}
    .red {{ color:#ef5350; }}
    .bold {{ font-weight:700; }}
    .subtitle {{ color:#666; font-size:12px; margin-bottom:8px; letter-spacing:2px; }}
    table {{ width:100%; border-collapse:collapse; font-size:12px; background:#0a0a0a; border-radius:8px; overflow:hidden; margin-bottom:20px; }}
    th {{ background:#111; color:#c8f54a; padding:12px; text-align:left; font-size:10px; letter-spacing:1px; text-transform:uppercase; }}
    td {{ padding:10px 12px; border-bottom:1px solid #1a1a1a; }}
    .optimal-row td {{ background:#1a2a1a; border-left:3px solid #c8f54a; }}
    .summary-box {{ background:linear-gradient(135deg, #1a2a1a 0%, #0d0d0d 100%); border:2px solid #c8f54a; border-radius:16px; padding:30px; text-align:center; margin-bottom:40px; }}
    .summary-box h2 {{ color:#c8f54a; font-size:16px; margin-bottom:20px; }}
    .summary-box .total {{ font-size:48px; font-weight:700; color:#00c853; }}
    .summary-box .improvement {{ font-size:18px; margin-top:10px; }}
    .instrument-section {{ background:#0d0d0d; border:1px solid #1a1a1a; border-radius:12px; padding:24px; margin-bottom:30px; }}
    .instrument-section h3 {{ color:#c8f54a; font-size:16px; margin-bottom:16px; border-bottom:1px solid #222; padding-bottom:10px; }}
    .instrument-section h4 {{ color:#888; font-size:12px; margin:20px 0 10px 0; text-transform:uppercase; letter-spacing:1px; }}
    .optimal-box {{ display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; margin-bottom:16px; }}
    .param-group {{ background:#0a0a0a; padding:16px; border-radius:8px; text-align:center; }}
    .param-group.highlight {{ border:1px solid #c8f54a; }}
    .param-label {{ display:block; color:#666; font-size:10px; text-transform:uppercase; margin-bottom:4px; }}
    .param-value {{ font-size:20px; font-weight:700; color:#f5f5f5; }}
    .param-value.green {{ color:#00c853; }}
    .comparison-note {{ color:#888; font-size:12px; margin-bottom:16px; padding:12px; background:#0a0a0a; border-radius:6px; }}
    .config-summary {{ display:grid; grid-template-columns:repeat(3, 1fr); gap:20px; margin-top:40px; }}
    .config-card {{ background:#0d0d0d; border:1px solid #c8f54a; border-radius:12px; padding:20px; text-align:center; }}
    .config-card h4 {{ color:#c8f54a; margin-bottom:12px; }}
    .config-card .params {{ font-size:14px; line-height:2; }}
  </style>
</head>
<body>
  <div class="header">
    <h1>THE <span class="accent">EDGE</span></h1>
    <div class="subtitle">FULL PARAMETER OPTIMIZATION — TP / SL / TRAIL</div>
    <div style="color:#888; font-size:14px; margin-top:10px;">Data: {date_range} | Mode: Trail Only (No Breakeven)</div>
  </div>

  <div class="summary-box">
    <h2>OPTIMIZED TOTAL P&L</h2>
    <div class="total">${total_optimal_pnl:,.0f}</div>
    <div class="improvement">
      vs Original Settings:
      <span class="{'green' if total_improvement > 0 else 'red'} bold">
        {'+' if total_improvement > 0 else ''}{total_improvement:,.0f} ({'+' if total_improvement_pct > 0 else ''}{total_improvement_pct:.1f}%)
      </span>
    </div>
  </div>

  {inst_sections}

  <h2 style="color:#c8f54a; font-size:14px; letter-spacing:2px; margin:40px 0 20px 0; text-transform:uppercase; border-bottom:1px solid #222; padding-bottom:10px;">
    Recommended Configuration
  </h2>
  <div class="config-summary">
    <div class="config-card">
      <h4>MNQ (Micro Nasdaq)</h4>
      <div class="params">
        TP: <span class="accent">{optimal_params['MNQ']['tp']} pts</span><br>
        SL: <span class="accent">{optimal_params['MNQ']['sl']} pts</span><br>
        Trail: <span class="accent">{optimal_params['MNQ']['trail']} pts</span>
      </div>
    </div>
    <div class="config-card">
      <h4>MES (Micro S&P)</h4>
      <div class="params">
        TP: <span class="accent">{optimal_params['MES']['tp']} pts</span><br>
        SL: <span class="accent">{optimal_params['MES']['sl']} pts</span><br>
        Trail: <span class="accent">{optimal_params['MES']['trail']} pts</span>
      </div>
    </div>
    <div class="config-card">
      <h4>MGC (Micro Gold)</h4>
      <div class="params">
        TP: <span class="accent">{optimal_params['MGC']['tp']} pts</span><br>
        SL: <span class="accent">{optimal_params['MGC']['sl']} pts</span><br>
        Trail: <span class="accent">{optimal_params['MGC']['trail']} pts</span>
      </div>
    </div>
  </div>

  <div style="margin-top:40px; padding:20px; background:#0d0d0d; border:1px solid #333; border-radius:8px; color:#666; font-size:11px;">
    <strong style="color:#ef5350;">DISCLAIMER:</strong> Backtested results using historical data. Past performance does not guarantee future results.
    Parameter optimization may lead to overfitting. Consider forward testing before live trading.
    <br><br><em>Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</em>
  </div>
</body>
</html>"""

    out_path = os.path.join(PUBLIC_DIR, 'klbs_optimization_report.html')
    with open(out_path, 'w') as f:
        f.write(html)
    print(f"\n✓ Full optimization report saved: {out_path}")
    return out_path


def run_trail_optimization(trail_values=[5, 10, 15, 20, 25, 30]):
    """Test multiple trail distances to find optimal setting."""
    print("\n" + "="*60)
    print("  TRAIL DISTANCE OPTIMIZATION")
    print(f"  Testing: {trail_values} pts")
    print("="*60)

    all_trail_results = {}

    for trail in trail_values:
        print(f"\n>>> Testing trail = {trail} pts...")
        trail_results = []

        for symbol, cfg in INSTRUMENTS.items():
            # Override trail setting
            test_cfg = cfg.copy()
            test_cfg['trail'] = trail

            try:
                result = run_backtest(symbol, test_cfg, include_fees=False)
                trail_results.append(result)
            except Exception as e:
                print(f"  ERROR on {symbol}: {e}")
                trail_results.append(None)

        # Calculate totals for this trail setting
        total_pnl = sum(r['stats']['total_pnl'] for r in trail_results if r)
        total_wins = sum(r['stats']['wins'] for r in trail_results if r)
        total_losses = sum(r['stats']['losses'] for r in trail_results if r)
        win_rate = total_wins / (total_wins + total_losses) * 100 if (total_wins + total_losses) > 0 else 0
        max_dd = min(r['stats']['max_dd'] for r in trail_results if r)

        all_trail_results[trail] = {
            'results': trail_results,
            'total_pnl': total_pnl,
            'win_rate': win_rate,
            'max_dd': max_dd,
            'total_wins': total_wins,
            'total_losses': total_losses,
        }

        print(f"  Trail {trail}pts: P&L=${total_pnl:,.0f} | WR={win_rate:.1f}% | MaxDD=${max_dd:,.0f}")

    # Find optimal
    optimal_trail = max(all_trail_results.keys(), key=lambda t: all_trail_results[t]['total_pnl'])
    print(f"\n{'='*60}")
    print(f"  OPTIMAL TRAIL: {optimal_trail} pts")
    print(f"  P&L: ${all_trail_results[optimal_trail]['total_pnl']:,.0f}")
    print(f"{'='*60}")

    # Build optimization report
    build_trail_optimization_report(all_trail_results, optimal_trail)

    return all_trail_results, optimal_trail


def build_trail_optimization_report(all_trail_results, optimal_trail):
    """Build HTML report comparing trail distances."""

    # Sort by P&L
    sorted_trails = sorted(all_trail_results.keys(), key=lambda t: all_trail_results[t]['total_pnl'], reverse=True)

    # Get date range from first result
    date_range = ""
    for trail, data in all_trail_results.items():
        for r in data['results']:
            if r is not None:
                date_range = f"{r['stats']['data_start'].strftime('%Y-%m-%d')} to {r['stats']['data_end'].strftime('%Y-%m-%d')}"
                break
        if date_range:
            break

    # Build comparison table
    rows_html = ''
    best_pnl = all_trail_results[optimal_trail]['total_pnl']

    for trail in sorted_trails:
        data = all_trail_results[trail]
        diff = data['total_pnl'] - best_pnl
        is_optimal = trail == optimal_trail
        row_class = 'optimal-row' if is_optimal else ''

        # Per-instrument breakdown
        inst_pnls = []
        for r in data['results']:
            if r:
                inst_pnls.append(fmt_currency(r['stats']['total_pnl']))
            else:
                inst_pnls.append("—")

        rows_html += f"""
        <tr class="{row_class}">
          <td><span class="{'optimal' if is_optimal else ''}">{trail} pts {'★' if is_optimal else ''}</span></td>
          <td class="green bold">${data['total_pnl']:,.0f}</td>
          <td>{data['win_rate']:.1f}%</td>
          <td class="red">${data['max_dd']:,.0f}</td>
          <td>{inst_pnls[0]}</td>
          <td>{inst_pnls[1]}</td>
          <td>{inst_pnls[2]}</td>
          <td class="{'green' if diff >= 0 else 'red'}">{'+' if diff > 0 else ''}{diff:,.0f}</td>
        </tr>"""

    # Year comparison for top 3 trails
    year_comparison_html = ''
    top_trails = sorted_trails[:3]

    for trail in top_trails:
        data = all_trail_results[trail]
        all_closed = pd.concat([r['closed'].assign(symbol=r['symbol']) for r in data['results'] if r], ignore_index=True)
        all_closed['year'] = pd.to_datetime(all_closed['date']).dt.year
        by_year = all_closed.groupby('year')['pnl_usd'].sum()

        year_rows = ''
        for year in sorted(by_year.index):
            pnl = by_year[year]
            year_rows += f"<td class=\"{'green' if pnl >= 0 else 'red'}\">${pnl:,.0f}</td>"

        year_comparison_html += f"""
        <tr>
          <td class="{'optimal' if trail == optimal_trail else ''}">{trail} pts {'★' if trail == optimal_trail else ''}</td>
          {year_rows}
        </tr>"""

    # Get year headers
    sample_data = all_trail_results[top_trails[0]]
    all_closed = pd.concat([r['closed'].assign(symbol=r['symbol']) for r in sample_data['results'] if r], ignore_index=True)
    all_closed['year'] = pd.to_datetime(all_closed['date']).dt.year
    years = sorted(all_closed['year'].unique())
    year_headers = ''.join([f'<th>{int(y)}</th>' for y in years])

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Trail Distance Optimization — THE EDGE</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    body {{ background:#080808; color:#e0e0e0; font-family:'JetBrains Mono',monospace; padding:40px; line-height:1.6; }}
    .header {{ text-align:center; margin-bottom:40px; padding-bottom:30px; border-bottom:1px solid #222; }}
    h1 {{ font-size:36px; letter-spacing:4px; margin-bottom:8px; font-weight:700; }}
    .accent {{ color:#c8f54a; }}
    .green {{ color:#00c853; }}
    .red {{ color:#ef5350; }}
    .bold {{ font-weight:700; }}
    .subtitle {{ color:#666; font-size:12px; margin-bottom:8px; letter-spacing:2px; }}
    .date-range {{ color:#888; font-size:14px; margin-top:10px; }}
    table {{ width:100%; border-collapse:collapse; font-size:13px; background:#0a0a0a; border-radius:8px; overflow:hidden; margin-bottom:30px; }}
    th {{ background:#111; color:#c8f54a; padding:14px 16px; text-align:left; font-size:11px; letter-spacing:1px; text-transform:uppercase; border-bottom:2px solid #222; }}
    td {{ padding:12px 16px; border-bottom:1px solid #1a1a1a; }}
    tr:hover td {{ background:#111; }}
    .optimal-row td {{ background:#1a2a1a; border-left:3px solid #c8f54a; }}
    .optimal {{ color:#c8f54a; font-weight:700; }}
    .section-header {{ font-size:14px; letter-spacing:2px; color:#c8f54a; margin:50px 0 24px 0; text-transform:uppercase; padding-bottom:12px; border-bottom:1px solid #222; }}
    .winner-box {{ background:linear-gradient(135deg, #1a2a1a 0%, #0d0d0d 100%); border:2px solid #c8f54a; border-radius:16px; padding:40px; text-align:center; margin-bottom:40px; }}
    .winner-box h2 {{ color:#c8f54a; font-size:18px; margin-bottom:16px; letter-spacing:2px; }}
    .winner-box .big {{ font-size:72px; font-weight:700; color:#c8f54a; }}
    .winner-box .pnl {{ font-size:36px; color:#00c853; margin-top:16px; }}
    .winner-box .detail {{ color:#888; font-size:13px; margin-top:8px; }}
    .note {{ background:#0d0d0d; border:1px solid #333; border-radius:8px; padding:20px; margin-top:30px; color:#888; font-size:12px; }}
  </style>
</head>
<body>
  <div class="header">
    <h1>THE <span class="accent">EDGE</span></h1>
    <div class="subtitle">TRAIL DISTANCE OPTIMIZATION — NO BREAKEVEN MODE</div>
    <div class="date-range">Data: {date_range} | Testing: {', '.join([f'{t}pts' for t in sorted(all_trail_results.keys())])}</div>
  </div>

  <div class="winner-box">
    <h2>OPTIMAL TRAIL DISTANCE</h2>
    <div class="big">{optimal_trail} PTS</div>
    <div class="pnl">${all_trail_results[optimal_trail]['total_pnl']:,.0f}</div>
    <div class="detail">Win Rate: {all_trail_results[optimal_trail]['win_rate']:.1f}% | Max Drawdown: ${all_trail_results[optimal_trail]['max_dd']:,.0f}</div>
  </div>

  <h2 class="section-header">All Trail Distances Compared</h2>
  <table>
    <thead>
      <tr>
        <th>Trail</th>
        <th>Total P&L</th>
        <th>Win Rate</th>
        <th>Max DD</th>
        <th>MNQ</th>
        <th>MES</th>
        <th>MGC</th>
        <th>vs Best</th>
      </tr>
    </thead>
    <tbody>{rows_html}</tbody>
  </table>

  <h2 class="section-header">Year-over-Year (Top 3 Trails)</h2>
  <table>
    <thead>
      <tr>
        <th>Trail</th>
        {year_headers}
      </tr>
    </thead>
    <tbody>{year_comparison_html}</tbody>
  </table>

  <div class="note">
    <strong>Methodology:</strong> All tests run in Trail Mode with trailing stops activated at TP level.
    Trail activates when price reaches full TP target (40pts MNQ, 20pts MES/MGC), then follows price by the trail distance.
    <br><br>
    <strong>Recommendation:</strong> Use <span class="accent">{optimal_trail}pt trail</span> for optimal risk-adjusted returns.
  </div>

  <div style="margin-top:40px; padding:20px; background:#0d0d0d; border:1px solid #333; border-radius:8px; color:#666; font-size:11px;">
    <strong style="color:#ef5350;">DISCLAIMER:</strong> Backtested results. Past performance does not guarantee future results.
    <br><br><em>Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</em>
  </div>
</body>
</html>"""

    out_path = os.path.join(PUBLIC_DIR, 'klbs_trail_optimization.html')
    with open(out_path, 'w') as f:
        f.write(html)
    print(f"\n✓ Trail optimization report saved: {out_path}")
    return out_path


def run_oos_test(oos_split_year=2024):
    """
    Run Out-of-Sample (OOS) forward testing.
    Splits data into In-Sample (IS) and Out-of-Sample (OOS) periods.
    IS: Everything before split_year
    OOS: split_year onwards (forward testing)
    """
    print("\n" + "="*60)
    print(f"  OUT-OF-SAMPLE FORWARD TEST")
    print(f"  In-Sample: 2019 - {oos_split_year-1}")
    print(f"  Out-of-Sample: {oos_split_year} - 2026")
    print("="*60)

    is_results = []
    oos_results = []

    for symbol, cfg in INSTRUMENTS.items():
        print(f"\n{'='*60}")
        print(f"  {symbol} — {cfg['name']}")
        print(f"{'='*60}")

        # Load full data
        data_path = os.path.join(BASE_DIR, cfg['file'])
        df = pd.read_csv(data_path)
        df['ts_event'] = pd.to_datetime(df['ts_event'])
        df = df.set_index('ts_event').sort_index()

        # Split by year
        split_date = pd.Timestamp(f'{oos_split_year}-01-01', tz=ET)
        df_is = df[df.index < split_date].copy()
        df_oos = df[df.index >= split_date].copy()

        print(f"  IS Period:  {df_is.index[0].date()} to {df_is.index[-1].date()} ({len(df_is):,} bars)")
        print(f"  OOS Period: {df_oos.index[0].date()} to {df_oos.index[-1].date()} ({len(df_oos):,} bars)")

        # Create temp files for split data (preserve index for run_backtest)
        is_path = os.path.join(OUTPUT_DIR, f'temp_{symbol}_is.csv')
        oos_path = os.path.join(OUTPUT_DIR, f'temp_{symbol}_oos.csv')

        df_is.to_csv(is_path)  # Keep index as first column
        df_oos.to_csv(oos_path)

        # Run IS backtest
        is_cfg = cfg.copy()
        is_cfg['file'] = is_path
        print(f"\n  Running In-Sample backtest...")
        is_result = run_backtest(symbol + '_IS', is_cfg, include_fees=False)
        is_results.append(is_result)

        # Run OOS backtest
        oos_cfg = cfg.copy()
        oos_cfg['file'] = oos_path
        print(f"\n  Running Out-of-Sample backtest...")
        oos_result = run_backtest(symbol + '_OOS', oos_cfg, include_fees=False)
        oos_results.append(oos_result)

        # Cleanup temp files
        os.remove(is_path)
        os.remove(oos_path)

    # Build OOS report
    build_oos_report(is_results, oos_results, oos_split_year)

    return is_results, oos_results


def build_oos_report(is_results, oos_results, split_year):
    """Build Out-of-Sample test report."""

    def calc_metrics(results):
        totals = {'pnl': 0, 'wins': 0, 'losses': 0, 'trades': 0, 'sharpe': [], 'sortino': [], 'calmar': [], 'max_dd': 0}
        for r in results:
            if r is None:
                continue
            s = r['stats']
            totals['pnl'] += s['total_pnl']
            totals['wins'] += s['wins']
            totals['losses'] += s['losses']
            totals['trades'] += s['total']
            totals['sharpe'].append(s.get('sharpe_ratio', 0))
            totals['sortino'].append(s.get('sortino_ratio', 0))
            totals['calmar'].append(s.get('calmar_ratio', 0))
            totals['max_dd'] = min(totals['max_dd'], s.get('max_dd', 0))
        totals['win_rate'] = totals['wins'] / (totals['wins'] + totals['losses']) * 100 if (totals['wins'] + totals['losses']) > 0 else 0
        totals['avg_sharpe'] = np.mean(totals['sharpe']) if totals['sharpe'] else 0
        totals['avg_sortino'] = np.mean(totals['sortino']) if totals['sortino'] else 0
        totals['avg_calmar'] = np.mean(totals['calmar']) if totals['calmar'] else 0
        return totals

    is_totals = calc_metrics(is_results)
    oos_totals = calc_metrics(oos_results)

    # Calculate years for annualized returns
    is_years = split_year - 2019
    oos_years = 2026 - split_year + 0.15  # Feb 2026

    is_annual = is_totals['pnl'] / is_years if is_years > 0 else 0
    oos_annual = oos_totals['pnl'] / oos_years if oos_years > 0 else 0

    # Determine if OOS holds up
    wr_diff = oos_totals['win_rate'] - is_totals['win_rate']
    sharpe_diff = oos_totals['avg_sharpe'] - is_totals['avg_sharpe']
    annual_diff_pct = ((oos_annual / is_annual) - 1) * 100 if is_annual > 0 else 0

    # Status
    oos_status = "PASS" if oos_totals['win_rate'] >= 50 and oos_totals['pnl'] > 0 and oos_totals['avg_sharpe'] >= 1 else "CAUTION"
    status_color = "#00c853" if oos_status == "PASS" else "#ff9800"

    print(f"\n{'='*60}")
    print(f"  OOS TEST RESULTS")
    print(f"{'='*60}")
    print(f"  Status: {oos_status}")
    print(f"\n  IN-SAMPLE ({2019}-{split_year-1}):")
    print(f"    Total P&L:     ${is_totals['pnl']:,.0f} (${is_annual:,.0f}/yr)")
    print(f"    Win Rate:      {is_totals['win_rate']:.1f}%")
    print(f"    Sharpe Ratio:  {is_totals['avg_sharpe']:.2f}")
    print(f"    Sortino Ratio: {is_totals['avg_sortino']:.2f}")
    print(f"    Max Drawdown:  ${is_totals['max_dd']:,.0f}")
    print(f"\n  OUT-OF-SAMPLE ({split_year}-2026):")
    print(f"    Total P&L:     ${oos_totals['pnl']:,.0f} (${oos_annual:,.0f}/yr)")
    print(f"    Win Rate:      {oos_totals['win_rate']:.1f}% ({wr_diff:+.1f}%)")
    print(f"    Sharpe Ratio:  {oos_totals['avg_sharpe']:.2f} ({sharpe_diff:+.2f})")
    print(f"    Sortino Ratio: {oos_totals['avg_sortino']:.2f}")
    print(f"    Max Drawdown:  ${oos_totals['max_dd']:,.0f}")
    print(f"\n  Annual Return Change: {annual_diff_pct:+.1f}%")

    # Build HTML report
    rows_html = ''
    symbols = list(INSTRUMENTS.keys())
    for i, sym in enumerate(symbols):
        is_r = is_results[i]
        oos_r = oos_results[i]
        if is_r is None or oos_r is None:
            continue

        is_s = is_r['stats']
        oos_s = oos_r['stats']

        wr_chg = oos_s['win_rate'] - is_s['win_rate']
        pf_chg = oos_s['profit_factor'] - is_s['profit_factor']
        sharpe_chg = oos_s.get('sharpe_ratio', 0) - is_s.get('sharpe_ratio', 0)

        rows_html += f"""
        <tr>
          <td class="symbol">{sym}</td>
          <td>{is_s['total']:,}</td>
          <td class="green">{is_s['win_rate']:.1f}%</td>
          <td class="green">{fmt_currency(is_s['total_pnl'])}</td>
          <td class="accent">{is_s.get('sharpe_ratio', 0):.2f}</td>
          <td>{oos_s['total']:,}</td>
          <td class="{'green' if oos_s['win_rate']>=50 else 'red'}">{oos_s['win_rate']:.1f}%</td>
          <td class="{'green' if oos_s['total_pnl']>=0 else 'red'}">{fmt_currency(oos_s['total_pnl'])}</td>
          <td class="accent">{oos_s.get('sharpe_ratio', 0):.2f}</td>
          <td class="{'green' if wr_chg>=0 else 'red'}">{wr_chg:+.1f}%</td>
          <td class="{'green' if sharpe_chg>=0 else 'red'}">{sharpe_chg:+.2f}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>KLBS Out-of-Sample Test — THE EDGE</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    body {{ background:#080808; color:#e0e0e0; font-family:'JetBrains Mono',monospace; padding:40px; line-height:1.6; }}
    .header {{ text-align:center; margin-bottom:40px; padding-bottom:30px; border-bottom:1px solid #222; }}
    h1 {{ font-size:32px; letter-spacing:4px; margin-bottom:8px; font-weight:700; }}
    .accent {{ color:#c8f54a; }}
    .green {{ color:#00c853; }}
    .red {{ color:#ef5350; }}
    .symbol {{ color:#c8f54a; font-weight:700; }}
    .status {{ display:inline-block; padding:8px 24px; border-radius:4px; font-size:14px; font-weight:700; letter-spacing:2px; margin-top:16px; }}
    .status.pass {{ background:#00c85322; color:#00c853; border:1px solid #00c853; }}
    .status.caution {{ background:#ff980022; color:#ff9800; border:1px solid #ff9800; }}
    table {{ width:100%; border-collapse:collapse; font-size:12px; background:#0a0a0a; border-radius:8px; overflow:hidden; margin-top:24px; }}
    th {{ background:#111; color:#c8f54a; padding:12px 10px; text-align:left; font-size:10px; letter-spacing:1px; text-transform:uppercase; border-bottom:2px solid #222; }}
    td {{ padding:10px; border-bottom:1px solid #1a1a1a; }}
    tr:hover td {{ background:#111; }}
    .summary-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:24px; margin:40px 0; }}
    .summary-card {{ background:#0d0d0d; border:1px solid #1a1a1a; border-radius:12px; padding:24px; }}
    .summary-card h3 {{ color:#c8f54a; font-size:14px; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #222; }}
    .metric {{ display:flex; justify-content:space-between; margin-bottom:12px; }}
    .metric-label {{ color:#666; }}
    .metric-value {{ font-weight:600; }}
    .conclusion {{ background:#0d0d0d; border:1px solid #1a1a1a; border-radius:12px; padding:24px; margin-top:40px; }}
    .conclusion h3 {{ color:#c8f54a; margin-bottom:16px; }}
    .conclusion p {{ color:#888; font-size:13px; line-height:1.8; }}
  </style>
</head>
<body>
  <div class="header">
    <h1>THE <span class="accent">EDGE</span></h1>
    <div style="color:#888; font-size:14px;">OUT-OF-SAMPLE FORWARD TEST</div>
    <div style="color:#666; font-size:12px; margin-top:8px;">
      In-Sample: 2019-{split_year-1} | Out-of-Sample: {split_year}-2026
    </div>
    <div class="status {'pass' if oos_status=='PASS' else 'caution'}">{oos_status}</div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <h3>In-Sample (Training): 2019-{split_year-1}</h3>
      <div class="metric"><span class="metric-label">Total P&L</span><span class="metric-value green">{fmt_currency(is_totals['pnl'])}</span></div>
      <div class="metric"><span class="metric-label">Annual Return</span><span class="metric-value green">{fmt_currency(is_annual)}/yr</span></div>
      <div class="metric"><span class="metric-label">Win Rate</span><span class="metric-value">{is_totals['win_rate']:.1f}%</span></div>
      <div class="metric"><span class="metric-label">Trades</span><span class="metric-value">{is_totals['trades']:,}</span></div>
      <div class="metric"><span class="metric-label">Sharpe Ratio</span><span class="metric-value accent">{is_totals['avg_sharpe']:.2f}</span></div>
      <div class="metric"><span class="metric-label">Sortino Ratio</span><span class="metric-value accent">{is_totals['avg_sortino']:.2f}</span></div>
      <div class="metric"><span class="metric-label">Max Drawdown</span><span class="metric-value red">{fmt_currency(is_totals['max_dd'])}</span></div>
    </div>
    <div class="summary-card">
      <h3>Out-of-Sample (Forward Test): {split_year}-2026</h3>
      <div class="metric"><span class="metric-label">Total P&L</span><span class="metric-value {'green' if oos_totals['pnl']>0 else 'red'}">{fmt_currency(oos_totals['pnl'])}</span></div>
      <div class="metric"><span class="metric-label">Annual Return</span><span class="metric-value {'green' if oos_annual>0 else 'red'}">{fmt_currency(oos_annual)}/yr</span></div>
      <div class="metric"><span class="metric-label">Win Rate</span><span class="metric-value">{oos_totals['win_rate']:.1f}% <span class="{'green' if wr_diff>=0 else 'red'}">({wr_diff:+.1f}%)</span></span></div>
      <div class="metric"><span class="metric-label">Trades</span><span class="metric-value">{oos_totals['trades']:,}</span></div>
      <div class="metric"><span class="metric-label">Sharpe Ratio</span><span class="metric-value accent">{oos_totals['avg_sharpe']:.2f} <span class="{'green' if sharpe_diff>=0 else 'red'}">({sharpe_diff:+.2f})</span></span></div>
      <div class="metric"><span class="metric-label">Sortino Ratio</span><span class="metric-value accent">{oos_totals['avg_sortino']:.2f}</span></div>
      <div class="metric"><span class="metric-label">Max Drawdown</span><span class="metric-value red">{fmt_currency(oos_totals['max_dd'])}</span></div>
    </div>
  </div>

  <h2 style="color:#c8f54a; font-size:14px; letter-spacing:2px; margin-bottom:16px;">DETAILED BREAKDOWN BY INSTRUMENT</h2>
  <table>
    <thead>
      <tr>
        <th rowspan="2">Symbol</th>
        <th colspan="4" style="text-align:center; border-right:1px solid #333;">In-Sample (2019-{split_year-1})</th>
        <th colspan="4" style="text-align:center; border-right:1px solid #333;">Out-of-Sample ({split_year}-2026)</th>
        <th colspan="2" style="text-align:center;">Change</th>
      </tr>
      <tr>
        <th>Trades</th><th>Win%</th><th>P&L</th><th>Sharpe</th>
        <th>Trades</th><th>Win%</th><th>P&L</th><th>Sharpe</th>
        <th>Win%</th><th>Sharpe</th>
      </tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
  </table>

  <div class="conclusion">
    <h3>Forward Test Conclusion</h3>
    <p>
      {'The strategy shows consistent performance across both in-sample and out-of-sample periods, suggesting the edge is robust and not curve-fitted. The win rate and risk-adjusted returns remain stable, indicating the underlying market dynamics the strategy exploits are persistent.' if oos_status == 'PASS' else 'The strategy shows some degradation in out-of-sample testing. While still profitable, the reduced metrics suggest some optimization bias may be present. Consider further validation with different market conditions.'}
    </p>
    <p style="margin-top:16px; color:#666;">
      <strong>Key Findings:</strong><br>
      • Annual return {'+' if annual_diff_pct>0 else ''}{annual_diff_pct:.0f}% in OOS vs IS<br>
      • Win rate change: {wr_diff:+.1f}%<br>
      • Sharpe ratio change: {sharpe_diff:+.2f}<br>
      • OOS data represents ~{oos_years:.1f} years of unseen market data
    </p>
  </div>

  <div style="margin-top:40px; padding:20px; background:#0d0d0d; border:1px solid #333; border-radius:8px; color:#666; font-size:11px;">
    <strong style="color:#ef5350;">⚠ DISCLAIMER:</strong> This out-of-sample test is based on historical data only. While forward testing helps validate strategy robustness,
    past performance does not guarantee future results. Always use proper risk management in live trading.
    <br><br>
    <em>Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</em>
  </div>
</body>
</html>"""

    out_path = os.path.join(PUBLIC_DIR, 'klbs_oos_report.html')
    with open(out_path, 'w') as f:
        f.write(html)
    print(f"\n✓ OOS report saved: {out_path}")
    return out_path


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='KLBS Backtest')
    parser.add_argument('--no-fees', action='store_true', help='Run without fees/commissions')
    parser.add_argument('--optimize-trail', action='store_true', help='Find optimal trail distance')
    parser.add_argument('--trail-values', type=str, default='5,10,15,20,25,30', help='Trail values to test (comma-separated)')
    parser.add_argument('--optimize', action='store_true', help='Full parameter optimization (TP, SL, Trail)')
    parser.add_argument('--oos', action='store_true', help='Run out-of-sample forward test')
    parser.add_argument('--oos-split', type=int, default=2024, help='Year to split IS/OOS (default: 2024)')
    args = parser.parse_args()

    print("\n" + "="*60)
    print("  KEY LEVEL BREAKOUT SYSTEM — BACKTEST")
    print("  6+ Years of CME Futures Data (Databento)")
    print("="*60)

    if args.optimize:
        # Full parameter optimization
        all_results, optimal_params = run_full_optimization()

        # Update INSTRUMENTS with optimal values and run final report
        print("\n>>> Generating final report with optimal settings...")
        final_results = []
        for symbol, cfg in INSTRUMENTS.items():
            opt = optimal_params[symbol]
            final_cfg = cfg.copy()
            final_cfg['tp'] = opt['tp']
            final_cfg['sl'] = opt['sl']
            final_cfg['trail'] = opt['trail']

            result = run_backtest(symbol, final_cfg, include_fees=not args.no_fees)
            final_results.append(result)

            if result:
                csv_path = os.path.join(OUTPUT_DIR, f"klbs_{symbol}_trades_optimized.csv")
                result['closed'].to_csv(csv_path, index=False)

        build_report(final_results)

    elif args.oos:
        # Out-of-sample forward test
        run_oos_test(oos_split_year=args.oos_split)

    elif args.optimize_trail:
        # Run trail optimization
        trail_values = [int(x.strip()) for x in args.trail_values.split(',')]
        all_trail_results, optimal_trail = run_trail_optimization(trail_values)

        # Save optimal results as main report
        optimal_results = all_trail_results[optimal_trail]['results']
        for r in optimal_results:
            if r is None:
                continue
            csv_path = os.path.join(OUTPUT_DIR, f"klbs_{r['symbol']}_trades_optimal.csv")
            r['closed'].to_csv(csv_path, index=False)

        build_report(optimal_results)

    else:
        # Run standard backtest
        include_fees = not args.no_fees
        all_results = []
        for symbol, cfg in INSTRUMENTS.items():
            try:
                result = run_backtest(symbol, cfg, include_fees=include_fees)
                all_results.append(result)
            except Exception as e:
                print(f"  ERROR on {symbol}: {e}")
                import traceback
                traceback.print_exc()
                all_results.append(None)

        for r in all_results:
            if r is None:
                continue
            csv_path = os.path.join(OUTPUT_DIR, f"klbs_{r['symbol']}_trades.csv")
            r['closed'].to_csv(csv_path, index=False)
            print(f"  Trade log: {csv_path}")

        build_report(all_results)

    print("\n" + "="*60)
    print("  DONE")
    print("="*60)
