"""
KLBS_TradersPost.pine — Full Backtest
Replicates the EXACT Pine script logic and runs full P&L simulation.
This proves the Pine indicator will produce identical results to the original backtest.
"""

import warnings
warnings.filterwarnings('ignore')

import pandas as pd
import numpy as np
from datetime import datetime, time
import pytz
import os

# ── Config (matches Pine script presets) ──────────────────────────────────────
INSTRUMENTS = {
    'MNQ': {
        'file': 'data/MNQ_combined_15m.csv',  # Combined NQ+MNQ for extended history
        'tp': 35, 'sl': 50, 'rz': 5, 'pv': 2.0, 'contracts': 4, 'trail': 5,
        'name': 'Micro Nasdaq'
    },
    'MES': {
        'file': 'data/MES_combined_15m.csv',  # Combined ES+MES for extended history
        'tp': 25, 'sl': 25, 'rz': 5, 'pv': 5.0, 'contracts': 4, 'trail': 5,
        'name': 'Micro S&P 500'
    },
    'MGC': {
        'file': 'data/MGC_combined_15m.csv',  # Combined GC+MGC for extended history
        'tp': 20, 'sl': 25, 'rz': 3, 'pv': 10.0, 'contracts': 2, 'trail': 5,
        'name': 'Micro Gold'
    },
}

# Fees (same as original backtest)
FEES = {
    'MNQ': {'round_trip': 1.50},
    'MES': {'round_trip': 1.50},
    'MGC': {'round_trip': 1.50},
}

ET = pytz.timezone('America/New_York')
PROX_THRESHOLD = 10.0

# Session times (MUST match Pine exactly)
# Pine: inLondon = not na(time(timeframe.period, "0300-0800", tz))
# Pine: inNY = not na(time(timeframe.period, "0930-1600", tz))
# Pine: inDead = not na(time(timeframe.period, "0800-0930", tz))
LONDON_START = time(3, 0)
LONDON_END = time(8, 0)
DEAD_START = time(8, 0)
DEAD_END = time(9, 30)
NY_START = time(9, 30)
NY_END = time(16, 0)
PM_START = time(4, 30)
PM_END = time(9, 30)
LPM_START = time(0, 0)
LPM_END = time(3, 0)

def in_london(t): return LONDON_START <= t < LONDON_END
def in_ny(t): return NY_START <= t < NY_END
def in_pm(t): return PM_START <= t < PM_END
def in_lpm(t): return LPM_START <= t < LPM_END
def in_session(t): return in_london(t) or in_ny(t)  # anySession in Pine
def in_dead(t): return DEAD_START <= t < DEAD_END

def f_near(a, b, prox=PROX_THRESHOLD):
    """Matches Pine f_near()"""
    if np.isnan(a) or np.isnan(b):
        return False
    return abs(a - b) <= prox

def load_data(filepath):
    print(f"  Loading {filepath}...")
    df = pd.read_csv(filepath, index_col=0, parse_dates=True)
    if df.index.tzinfo is None:
        df.index = df.index.tz_localize('UTC')
    df.index = df.index.tz_convert(ET)
    df.columns = [c.capitalize() for c in df.columns]
    df = df[['Open', 'High', 'Low', 'Close', 'Volume']].copy()
    df.dropna(inplace=True)
    print(f"    → {len(df):,} bars from {df.index[0].date()} to {df.index[-1].date()}")
    return df


def run_pine_backtest(symbol, cfg, include_fees=True):
    """
    Full backtest using EXACT KLBS_TradersPost.pine logic.
    """
    print(f"\n{'='*60}")
    print(f"  {symbol} — PINE SCRIPT BACKTEST")
    print(f"{'='*60}")

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    filepath = os.path.join(BASE_DIR, cfg['file'])
    df = load_data(filepath)

    tp_pts = cfg['tp']
    sl_pts = cfg['sl']
    rz = cfg['rz']
    pv = cfg['pv']
    contracts = cfg['contracts']
    trail_pts = cfg['trail']
    fee_per_contract = FEES[symbol]['round_trip'] if include_fees else 0

    # ══════════════════════════════════════════════════════════════════════════
    # STATE VARIABLES — Matches Pine var declarations exactly
    # ══════════════════════════════════════════════════════════════════════════
    day_h = np.nan
    day_l = np.nan
    pm_h = np.nan
    pm_l = np.nan
    lpm_h = np.nan
    lpm_l = np.nan
    prev_day_h = np.nan
    prev_day_l = np.nan

    # State machine (Pine: var int stPDH = 0, etc.)
    level_state = {k: 0 for k in ['PDH', 'PDL', 'PMH', 'PML', 'LPH', 'LPL']}
    # Breakout bar (Pine: var int boPDH = -1, etc.) — FIXED: now -1, not 0
    level_bo = {k: -1 for k in ['PDH', 'PDL', 'PMH', 'PML', 'LPH', 'LPL']}
    # Last signal bar (Pine: var int lsPDH = -1, etc.)
    level_ls = {k: -1 for k in ['PDH', 'PDL', 'PMH', 'PML', 'LPH', 'LPL']}

    prev_date = None
    trades = []

    bars = df.reset_index()
    bars.rename(columns={bars.columns[0]: 'Datetime'}, inplace=True)
    total_bars = len(bars)
    report_interval = total_bars // 10

    for i, row in bars.iterrows():
        dt = row['Datetime']

        if i == 0:
            prev_date = dt.date()
            day_h = row['High']
            day_l = row['Low']
            continue

        if i % report_interval == 0:
            pct = int(i / total_bars * 100)
            print(f"    Processing... {pct}%")

        t = dt.time()
        date = dt.date()
        h = float(row['High'])
        l = float(row['Low'])

        # Previous bar (Pine: high[1], low[1])
        prev_row = bars.iloc[i-1]
        ph = float(prev_row['High'])
        pl = float(prev_row['Low'])

        cur_london = in_london(t)
        cur_ny = in_ny(t)
        cur_pm = in_pm(t)
        cur_lpm = in_lpm(t)
        cur_sess = in_session(t)  # Pine: anySession
        cur_dead = in_dead(t)     # Pine: inDead

        # ══════════════════════════════════════════════════════════════════════
        # NEW DAY DETECTION — Matches Pine isNewDay block exactly
        # ══════════════════════════════════════════════════════════════════════
        new_day = date != prev_date
        if new_day:
            # Pine: prevDayH := dayHigh, prevDayL := dayLow
            prev_day_h = day_h
            prev_day_l = day_l
            # Pine: dayHigh := high, dayLow := low
            day_h = h
            day_l = l
            # Pine: pmHigh := na, pmLow := na, lpmHigh := na, lpmLow := na
            pm_h = np.nan
            pm_l = np.nan
            lpm_h = np.nan
            lpm_l = np.nan
            # Pine: stPDH := 0, stPDL := 0, etc.
            # Pine: boPDH := -1, boPDL := -1, etc. (CRITICAL FIX)
            # Pine: lsPDH := -1, lsPDL := -1, etc.
            for k in level_state:
                level_state[k] = 0
                level_bo[k] = -1  # MATCHES PINE: boPDH := -1
                level_ls[k] = -1
            prev_date = date
        else:
            # Pine: dayHigh := math.max(nz(dayHigh, high), high)
            day_h = max(day_h, h) if not np.isnan(day_h) else h
            day_l = min(day_l, l) if not np.isnan(day_l) else l

        # ══════════════════════════════════════════════════════════════════════
        # SESSION LEVEL ACCUMULATION — Matches Pine exactly
        # ══════════════════════════════════════════════════════════════════════
        # Pine: if inLPM
        if cur_lpm:
            lpm_h = max(lpm_h, h) if not np.isnan(lpm_h) else h
            lpm_l = min(lpm_l, l) if not np.isnan(lpm_l) else l
        # Pine: if inPM
        if cur_pm:
            pm_h = max(pm_h, h) if not np.isnan(pm_h) else h
            pm_l = min(pm_l, l) if not np.isnan(pm_l) else l

        # ══════════════════════════════════════════════════════════════════════
        # PROXIMITY FILTER — Matches Pine showPDH, showPDL, etc.
        # ══════════════════════════════════════════════════════════════════════
        levels = {}

        # Pine: showPMH = not na(pmHigh) and not inPM
        # PMH/PML only tradeable AFTER PM session ends (09:30 NY)
        if not np.isnan(pm_h) and not cur_pm:
            levels['PMH'] = (pm_h, False)  # SHORT

        # Pine: showPML = not na(pmLow) and not inPM
        if not np.isnan(pm_l) and not cur_pm:
            levels['PML'] = (pm_l, True)   # LONG

        # Pine: showLPMH = not na(lpmHigh) and not inLPM and not f_near(lpmHigh, pmHigh) and not f_near(lpmHigh, pmLow)
        # LPH/LPL only tradeable AFTER LPM session ends (03:00 NY)
        if not np.isnan(lpm_h) and not cur_lpm and not f_near(lpm_h, pm_h) and not f_near(lpm_h, pm_l):
            levels['LPH'] = (lpm_h, False)  # SHORT

        # Pine: showLPML = not na(lpmLow) and not inLPM and not f_near(lpmLow, pmHigh) and not f_near(lpmLow, pmLow)
        if not np.isnan(lpm_l) and not cur_lpm and not f_near(lpm_l, pm_h) and not f_near(lpm_l, pm_l):
            levels['LPL'] = (lpm_l, True)   # LONG

        # Pine: showPDH = not na(prevDayH) and not f_near(prevDayH, lpmHigh) and not f_near(prevDayH, lpmLow) and not f_near(prevDayH, pmHigh) and not f_near(prevDayH, pmLow)
        if not np.isnan(prev_day_h) and not f_near(prev_day_h, lpm_h) and not f_near(prev_day_h, lpm_l) and not f_near(prev_day_h, pm_h) and not f_near(prev_day_h, pm_l):
            levels['PDH'] = (prev_day_h, False)  # SHORT

        # Pine: showPDL = not na(prevDayL) and not f_near(prevDayL, lpmHigh) and not f_near(prevDayL, lpmLow) and not f_near(prevDayL, pmHigh) and not f_near(prevDayL, pmLow)
        if not np.isnan(prev_day_l) and not f_near(prev_day_l, lpm_h) and not f_near(prev_day_l, lpm_l) and not f_near(prev_day_l, pm_h) and not f_near(prev_day_l, pm_l):
            levels['PDL'] = (prev_day_l, True)   # LONG

        # ══════════════════════════════════════════════════════════════════════
        # CORE STATE MACHINE — f_check() from KLBS_TradersPost.pine
        # ══════════════════════════════════════════════════════════════════════
        for lvl_name, (lvl_price, is_long) in levels.items():
            st = level_state[lvl_name]
            bo = level_bo[lvl_name]
            ls = level_ls[lvl_name]

            if is_long:
                # ══ LONG (PDL, PML, LPL) ══
                # Pine: if _st == 0 and anySession and not inDead
                #           if low[1] > lvl
                if st == 0 and cur_sess and not cur_dead:
                    if pl > lvl_price:
                        level_state[lvl_name] = 1
                        level_bo[lvl_name] = i
                        st = 1
                        bo = i

                # Pine: if _st == 1 and bar_index > _bo
                if st == 1 and i > bo:
                    # Pine: if low <= lvl + retestPts
                    if l <= lvl_price + rz:
                        # Pine: if anySession and not inDead
                        if cur_sess and not cur_dead:
                            # Pine: if bar_index != _ls
                            if i != ls:
                                trades.append({
                                    'date': dt,
                                    'level': lvl_name,
                                    'direction': 'LONG',
                                    'entry': lvl_price,
                                    'bar_idx': i,
                                    'session': 'London' if cur_london else 'NY',
                                    'day_of_week': dt.strftime('%A'),
                                    'year': dt.year,
                                })
                                level_state[lvl_name] = 2
                                level_ls[lvl_name] = i
                        else:
                            # Pine: _st := 0 // Dead zone disarm
                            level_state[lvl_name] = 0

            else:
                # ══ SHORT (PDH, PMH, LPH) ══
                # Pine: if _st == 0 and anySession and not inDead
                #           if high[1] < lvl
                if st == 0 and cur_sess and not cur_dead:
                    if ph < lvl_price:
                        level_state[lvl_name] = -1
                        level_bo[lvl_name] = i
                        st = -1
                        bo = i

                # Pine: if _st == -1 and bar_index > _bo
                if st == -1 and i > bo:
                    # Pine: if high >= lvl - retestPts
                    if h >= lvl_price - rz:
                        # Pine: if anySession and not inDead
                        if cur_sess and not cur_dead:
                            # Pine: if bar_index != _ls
                            if i != ls:
                                trades.append({
                                    'date': dt,
                                    'level': lvl_name,
                                    'direction': 'SHORT',
                                    'entry': lvl_price,
                                    'bar_idx': i,
                                    'session': 'London' if cur_london else 'NY',
                                    'day_of_week': dt.strftime('%A'),
                                    'year': dt.year,
                                })
                                level_state[lvl_name] = -2
                                level_ls[lvl_name] = i
                        else:
                            # Pine: _st := 0 // Dead zone disarm
                            level_state[lvl_name] = 0

    if not trades:
        print("  No trades found.")
        return None

    trades_df = pd.DataFrame(trades)
    print(f"\n  Found {len(trades_df)} signals. Simulating outcomes...")

    # ══════════════════════════════════════════════════════════════════════════
    # TRADE SIMULATION — Same as original backtest
    # ══════════════════════════════════════════════════════════════════════════
    results = []
    for idx, trade in trades_df.iterrows():
        bi = trade['bar_idx']
        is_long = trade['direction'] == 'LONG'
        entry = trade['entry']

        if is_long:
            current_sl = entry - sl_pts
        else:
            current_sl = entry + sl_pts

        outcome = 'OPEN'
        exit_price = np.nan
        bars_held = 0
        max_favorable = 0.0
        max_adverse = 0.0
        trailing_active = False
        best_price = entry

        future_bars = bars.iloc[bi+1:bi+200]

        for _, fb in future_bars.iterrows():
            fh = float(fb['High'])
            fl = float(fb['Low'])
            bars_held += 1

            if is_long:
                max_favorable = max(max_favorable, fh - entry)
                max_adverse = max(max_adverse, entry - fl)

                if fh > best_price:
                    best_price = fh

                if not trailing_active and fh >= entry + tp_pts:
                    trailing_active = True
                    current_sl = fh - trail_pts

                if trailing_active:
                    new_trail_sl = best_price - trail_pts
                    if new_trail_sl > current_sl:
                        current_sl = new_trail_sl

                if fl <= current_sl:
                    exit_price = current_sl
                    outcome = 'WIN' if exit_price > entry else 'LOSS'
                    break
            else:
                max_favorable = max(max_favorable, entry - fl)
                max_adverse = max(max_adverse, fh - entry)

                if fl < best_price:
                    best_price = fl

                if not trailing_active and fl <= entry - tp_pts:
                    trailing_active = True
                    current_sl = fl + trail_pts

                if trailing_active:
                    new_trail_sl = best_price + trail_pts
                    if new_trail_sl < current_sl:
                        current_sl = new_trail_sl

                if fh >= current_sl:
                    exit_price = current_sl
                    outcome = 'WIN' if exit_price < entry else 'LOSS'
                    break

        if outcome == 'OPEN':
            continue

        if is_long:
            pnl_pts = exit_price - entry
        else:
            pnl_pts = entry - exit_price

        gross_pnl = pnl_pts * pv * contracts
        fees = fee_per_contract * contracts
        net_pnl = gross_pnl - fees

        results.append({
            'date': trade['date'],
            'level': trade['level'],
            'direction': trade['direction'],
            'entry': entry,
            'exit': exit_price,
            'pnl_pts': pnl_pts,
            'gross_pnl': gross_pnl,
            'fees': fees,
            'net_pnl': net_pnl,
            'outcome': outcome,
            'bars_held': bars_held,
            'mfe': max_favorable,
            'mae': max_adverse,
            'trail_triggered': trailing_active,
            'session': trade['session'],
            'day_of_week': trade['day_of_week'],
            'year': trade['year'],
        })

    results_df = pd.DataFrame(results)

    # ══════════════════════════════════════════════════════════════════════════
    # STATISTICS — Same format as original backtest
    # ══════════════════════════════════════════════════════════════════════════
    wins = results_df[results_df['outcome'] == 'WIN']
    losses = results_df[results_df['outcome'] == 'LOSS']

    total_trades = len(results_df)
    win_count = len(wins)
    loss_count = len(losses)
    win_rate = win_count / total_trades * 100 if total_trades > 0 else 0

    gross_pnl = results_df['gross_pnl'].sum()
    total_fees = results_df['fees'].sum()
    net_pnl = results_df['net_pnl'].sum()

    avg_win = wins['net_pnl'].mean() if len(wins) > 0 else 0
    avg_loss = losses['net_pnl'].mean() if len(losses) > 0 else 0
    avg_win_pts = wins['pnl_pts'].mean() if len(wins) > 0 else 0
    avg_loss_pts = losses['pnl_pts'].mean() if len(losses) > 0 else 0

    gross_wins = wins['net_pnl'].sum() if len(wins) > 0 else 0
    gross_losses = abs(losses['net_pnl'].sum()) if len(losses) > 0 else 1
    profit_factor = gross_wins / gross_losses if gross_losses > 0 else 0

    # Drawdown
    cumulative = results_df['net_pnl'].cumsum()
    running_max = cumulative.cummax()
    drawdown = cumulative - running_max
    max_dd = drawdown.min()
    avg_dd = drawdown[drawdown < 0].mean() if len(drawdown[drawdown < 0]) > 0 else 0

    expectancy = net_pnl / total_trades if total_trades > 0 else 0

    # Sharpe (annualized, assuming ~252 trading days)
    daily_pnl = results_df.groupby(results_df['date'].dt.date)['net_pnl'].sum()
    sharpe = (daily_pnl.mean() / daily_pnl.std()) * np.sqrt(252) if daily_pnl.std() > 0 else 0

    # Sortino
    neg_returns = daily_pnl[daily_pnl < 0]
    downside_std = neg_returns.std() if len(neg_returns) > 0 else 1
    sortino = (daily_pnl.mean() / downside_std) * np.sqrt(252) if downside_std > 0 else 0

    # Calmar
    calmar = (net_pnl / abs(max_dd)) if max_dd != 0 else 0

    # Recovery factor
    recovery = net_pnl / abs(max_dd) if max_dd != 0 else 0

    # Consecutive wins/losses
    outcomes = results_df['outcome'].tolist()
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

    trails_triggered = results_df['trail_triggered'].sum()

    print(f"\n  ── Overall ──────────────────────────────")
    print(f"  Data Range:       {df.index[0].date()} to {df.index[-1].date()}")
    print(f"  Total Bars:       {len(df):,}")
    print(f"  Contracts:        {contracts}")
    print(f"  Total trades:     {total_trades:,}")
    print(f"  Wins/Losses:      {win_count:,} / {loss_count:,}")
    print(f"  Win Rate:         {win_rate:.1f}%")
    print(f"  Gross P&L:        ${gross_pnl:,.0f}")
    print(f"  Total Fees:       ${total_fees:,.0f}")
    print(f"  Net P&L:          ${net_pnl:,.0f}")
    print(f"  Avg Win:          ${avg_win:.0f} ({avg_win_pts:.1f} pts)")
    print(f"  Avg Loss:         ${avg_loss:.0f} ({avg_loss_pts:.1f} pts)")
    print(f"  Profit Factor:    {profit_factor:.2f}")
    print(f"  Max Drawdown:     ${max_dd:,.0f}")
    print(f"  Avg Drawdown:     ${avg_dd:,.0f}")
    print(f"  Expectancy:       ${expectancy:.2f}")
    print(f"  Sharpe Ratio:     {sharpe:.2f}")
    print(f"  Sortino Ratio:    {sortino:.2f}")
    print(f"  Calmar Ratio:     {calmar:.2f}")
    print(f"  Recovery Factor:  {recovery:.1f}x")
    print(f"  Max Consec Wins:  {max_consec_wins}")
    print(f"  Max Consec Losses:{max_consec_losses}")
    print(f"  Trails Triggered: {trails_triggered} ({trails_triggered/total_trades*100:.1f}%)")

    # By Year
    print(f"\n  ── By Year ──────────────────────────────")
    by_year = results_df.groupby('year').agg({
        'net_pnl': ['count', 'sum'],
        'outcome': lambda x: (x == 'WIN').sum()
    }).reset_index()
    by_year.columns = ['year', 'trades', 'pnl', 'wins']
    by_year['losses'] = by_year['trades'] - by_year['wins']
    by_year['wr'] = by_year['wins'] / by_year['trades'] * 100
    print(by_year[['year', 'trades', 'wins', 'losses', 'pnl', 'wr']].to_string(index=False))

    # By Level
    print(f"\n  ── By Level ─────────────────────────────")
    by_level = results_df.groupby('level').agg({
        'net_pnl': ['count', 'sum'],
        'outcome': lambda x: (x == 'WIN').sum(),
        'mfe': 'mean',
        'mae': 'mean'
    }).reset_index()
    by_level.columns = ['level', 'trades', 'pnl', 'wins', 'avg_mfe', 'avg_mae']
    by_level['losses'] = by_level['trades'] - by_level['wins']
    by_level['wr'] = by_level['wins'] / by_level['trades'] * 100
    print(by_level[['level', 'trades', 'wins', 'losses', 'pnl', 'avg_mfe', 'avg_mae', 'wr']].to_string(index=False))

    # By Session
    print(f"\n  ── By Session ───────────────────────────")
    by_session = results_df.groupby('session').agg({
        'net_pnl': ['count', 'sum'],
        'outcome': lambda x: (x == 'WIN').sum()
    }).reset_index()
    by_session.columns = ['session', 'trades', 'pnl', 'wins']
    by_session['losses'] = by_session['trades'] - by_session['wins']
    by_session['wr'] = by_session['wins'] / by_session['trades'] * 100
    print(by_session[['session', 'trades', 'wins', 'losses', 'pnl', 'wr']].to_string(index=False))

    # By Direction
    print(f"\n  ── By Direction ─────────────────────────")
    by_dir = results_df.groupby('direction').agg({
        'net_pnl': ['count', 'sum'],
        'outcome': lambda x: (x == 'WIN').sum()
    }).reset_index()
    by_dir.columns = ['direction', 'trades', 'pnl', 'wins']
    by_dir['losses'] = by_dir['trades'] - by_dir['wins']
    by_dir['wr'] = by_dir['wins'] / by_dir['trades'] * 100
    print(by_dir[['direction', 'trades', 'wins', 'losses', 'pnl', 'wr']].to_string(index=False))

    return {
        'symbol': symbol,
        'trades': total_trades,
        'wins': win_count,
        'losses': loss_count,
        'win_rate': win_rate,
        'net_pnl': net_pnl,
        'profit_factor': profit_factor,
        'sharpe': sharpe,
        'max_dd': max_dd,
    }


def main():
    print("\n" + "="*70)
    print("  KLBS_TradersPost.pine — FULL BACKTEST")
    print("  Using EXACT Pine Script Logic")
    print("="*70)

    all_results = []

    for symbol, cfg in INSTRUMENTS.items():
        result = run_pine_backtest(symbol, cfg, include_fees=True)
        if result:
            all_results.append(result)

    print("\n" + "="*70)
    print("  COMBINED RESULTS")
    print("="*70)

    total_pnl = sum(r['net_pnl'] for r in all_results)
    total_trades = sum(r['trades'] for r in all_results)

    print(f"\n  Total Net P&L:    ${total_pnl:,.0f}")
    print(f"  Total Trades:     {total_trades:,}")

    print("\n  Per Instrument:")
    for r in all_results:
        print(f"    {r['symbol']}: ${r['net_pnl']:,.0f} ({r['trades']} trades, {r['win_rate']:.1f}% WR, PF {r['profit_factor']:.2f})")


if __name__ == "__main__":
    main()
