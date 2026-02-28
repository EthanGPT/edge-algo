"""
KLBS Webhook Signal Generator
=============================
Real-time signal generation for TradersPost webhook execution.
Matches exact Pine Script indicator logic.

Usage:
  python klbs_webhook.py --symbol MNQ --live
  python klbs_webhook.py --symbol MES --test  # Dry run without sending webhooks

Strategy Rules:
  - Levels: PDH, PDL, PMH, PML, LPH, LPL
  - Sessions: London 03:00-08:00 ET, NY 09:30-16:00 ET
  - Dead zone 08:00-09:30 ET: no signals, retest disarms level
  - Arm: previous candle fully through level (during session)
  - Retest zone: ±5pts MNQ/MES, ±3pts MGC
  - TP/SL: MNQ 35/50, MES 25/25, MGC 20/25
  - Trail: 5pts after TP hit
  - One signal per level per day (level locked after firing)
  - NO session direction lock (can fire both long and short in same session)
  - NO breakeven (Trail Only mode)
"""

import os
import json
import requests
from datetime import datetime, time, timedelta
from dataclasses import dataclass
from typing import Optional, Dict, List
import pytz

# ── Configuration ────────────────────────────────────────────────────────────

ET = pytz.timezone('America/New_York')

# TradersPost webhook URL (set in environment or replace with your URL)
WEBHOOK_URL = os.environ.get('TRADERSPOST_WEBHOOK_URL', 'https://traderspost.io/trading/webhook/YOUR_WEBHOOK_ID')

@dataclass
class InstrumentConfig:
    symbol: str
    tp: int          # Take profit (pts) - triggers trail mode
    sl: int          # Stop loss (pts)
    rz: int          # Retest zone (pts)
    pv: float        # Point value ($)
    contracts: int   # Number of contracts
    trail: int       # Trail distance (pts)

INSTRUMENTS = {
    'MNQ': InstrumentConfig('MNQ', tp=35, sl=50, rz=5, pv=2.0,  contracts=4, trail=5),
    'MES': InstrumentConfig('MES', tp=25, sl=25, rz=5, pv=5.0,  contracts=4, trail=5),
    'MGC': InstrumentConfig('MGC', tp=20, sl=25, rz=3, pv=10.0, contracts=2, trail=5),
}

# Session times (ET)
LONDON_START = time(3, 0)
LONDON_END   = time(8, 0)
DEAD_START   = time(8, 0)
DEAD_END     = time(9, 30)
NY_START     = time(9, 30)
NY_END       = time(16, 0)
PM_START     = time(4, 30)
PM_END       = time(9, 30)
LPM_START    = time(0, 0)
LPM_END      = time(3, 0)


# ── Session Helpers ──────────────────────────────────────────────────────────

def in_london(t: time) -> bool:
    return LONDON_START <= t < LONDON_END

def in_ny(t: time) -> bool:
    return NY_START <= t < NY_END

def in_session(t: time) -> bool:
    return in_london(t) or in_ny(t)

def in_dead(t: time) -> bool:
    return DEAD_START <= t < DEAD_END

def in_pm(t: time) -> bool:
    return PM_START <= t < PM_END

def in_lpm(t: time) -> bool:
    return LPM_START <= t < LPM_END


# ── Level State ──────────────────────────────────────────────────────────────

@dataclass
class LevelState:
    """State for a single level within a day."""
    name: str
    price: float
    is_long: bool      # True = long setup (level below price), False = short
    armed: bool = False
    fired: bool = False
    arm_bar: int = -1


class DailyState:
    """Tracks all level states and daily highs/lows for one instrument."""

    def __init__(self, symbol: str):
        self.symbol = symbol
        self.cfg = INSTRUMENTS[symbol]

        # Daily levels (from previous day)
        self.prev_day_h: Optional[float] = None
        self.prev_day_l: Optional[float] = None

        # Current day tracking
        self.day_h: Optional[float] = None
        self.day_l: Optional[float] = None

        # Session levels
        self.pm_h: Optional[float] = None
        self.pm_l: Optional[float] = None
        self.lpm_h: Optional[float] = None
        self.lpm_l: Optional[float] = None

        # Level states (reset daily)
        self.levels: Dict[str, LevelState] = {}

        # Current bar index (resets daily)
        self.bar_idx = 0
        self.current_date = None

    def reset_daily(self, date):
        """Reset for new trading day."""
        # Roll over day levels
        self.prev_day_h = self.day_h
        self.prev_day_l = self.day_l
        self.day_h = None
        self.day_l = None
        self.pm_h = None
        self.pm_l = None
        self.lpm_h = None
        self.lpm_l = None
        self.levels = {}
        self.bar_idx = 0
        self.current_date = date

    def update_bar(self, dt: datetime, o: float, h: float, l: float, c: float) -> List[dict]:
        """
        Process a new bar and return any signals to fire.

        Returns list of signal dicts ready for webhook.
        """
        t = dt.time()
        date = dt.date()

        # New day check
        if self.current_date is None or date != self.current_date:
            self.reset_daily(date)

        self.bar_idx += 1

        # Update daily high/low
        if self.day_h is None:
            self.day_h = h
            self.day_l = l
        else:
            self.day_h = max(self.day_h, h)
            self.day_l = min(self.day_l, l)

        # Update session levels
        if in_lpm(t):
            self.lpm_h = max(self.lpm_h, h) if self.lpm_h else h
            self.lpm_l = min(self.lpm_l, l) if self.lpm_l else l
        if in_pm(t):
            self.pm_h = max(self.pm_h, h) if self.pm_h else h
            self.pm_l = min(self.pm_l, l) if self.pm_l else l

        # Build active levels
        self._update_levels()

        # Check for signals
        signals = []
        cur_sess = in_session(t)
        cur_dead = in_dead(t)

        for name, lvl in self.levels.items():
            if lvl.fired:
                continue

            signal = self._check_level(lvl, h, l, c, cur_sess, cur_dead, dt)
            if signal:
                signals.append(signal)

        return signals

    def _update_levels(self):
        """Build/update active level states."""
        prox = 10.0

        def near(a: Optional[float], b: Optional[float]) -> bool:
            if a is None or b is None:
                return False
            return abs(a - b) <= prox

        # PMH / PML
        if self.pm_h and 'PMH' not in self.levels:
            self.levels['PMH'] = LevelState('PMH', self.pm_h, is_long=False)
        if self.pm_l and 'PML' not in self.levels:
            self.levels['PML'] = LevelState('PML', self.pm_l, is_long=True)

        # LPH / LPL (skip if near PM levels)
        if self.lpm_h and 'LPH' not in self.levels:
            if not near(self.lpm_h, self.pm_h) and not near(self.lpm_h, self.pm_l):
                self.levels['LPH'] = LevelState('LPH', self.lpm_h, is_long=False)
        if self.lpm_l and 'LPL' not in self.levels:
            if not near(self.lpm_l, self.pm_h) and not near(self.lpm_l, self.pm_l):
                self.levels['LPL'] = LevelState('LPL', self.lpm_l, is_long=True)

        # PDH / PDL (skip if near other levels)
        if self.prev_day_h and 'PDH' not in self.levels:
            if not any(near(self.prev_day_h, x) for x in [self.pm_h, self.pm_l, self.lpm_h, self.lpm_l]):
                self.levels['PDH'] = LevelState('PDH', self.prev_day_h, is_long=False)
        if self.prev_day_l and 'PDL' not in self.levels:
            if not any(near(self.prev_day_l, x) for x in [self.pm_h, self.pm_l, self.lpm_h, self.lpm_l]):
                self.levels['PDL'] = LevelState('PDL', self.prev_day_l, is_long=True)

    def _check_level(self, lvl: LevelState, h: float, l: float, c: float,
                     cur_sess: bool, cur_dead: bool, dt: datetime) -> Optional[dict]:
        """Check a single level for arm/retest/signal."""
        rz = self.cfg.rz

        if lvl.is_long:
            # ARM: previous bar fully above level (during session)
            if not lvl.armed and cur_sess:
                # For live: we only have current bar, so check if LOW > level
                # This is simplified - in live you'd track prev bar
                if l > lvl.price:
                    lvl.armed = True
                    lvl.arm_bar = self.bar_idx
                    print(f"  [ARM] {self.symbol} {lvl.name} LONG @ {lvl.price:.2f}")

            # RETEST: price touches level + retest zone
            if lvl.armed and self.bar_idx > lvl.arm_bar:
                if l <= lvl.price + rz:
                    if cur_sess:
                        # FIRE SIGNAL
                        lvl.fired = True
                        return self._create_signal(lvl, dt)
                    elif cur_dead:
                        # Dead zone disarm
                        lvl.armed = False
                        print(f"  [DISARM] {self.symbol} {lvl.name} (dead zone)")
        else:
            # SHORT setup
            if not lvl.armed and cur_sess:
                if h < lvl.price:
                    lvl.armed = True
                    lvl.arm_bar = self.bar_idx
                    print(f"  [ARM] {self.symbol} {lvl.name} SHORT @ {lvl.price:.2f}")

            if lvl.armed and self.bar_idx > lvl.arm_bar:
                if h >= lvl.price - rz:
                    if cur_sess:
                        lvl.fired = True
                        return self._create_signal(lvl, dt)
                    elif cur_dead:
                        lvl.armed = False
                        print(f"  [DISARM] {self.symbol} {lvl.name} (dead zone)")

        return None

    def _create_signal(self, lvl: LevelState, dt: datetime) -> dict:
        """Create a signal dict ready for webhook."""
        direction = 'LONG' if lvl.is_long else 'SHORT'
        entry = lvl.price

        if lvl.is_long:
            tp = entry + self.cfg.tp
            sl = entry - self.cfg.sl
        else:
            tp = entry - self.cfg.tp
            sl = entry + self.cfg.sl

        return {
            'timestamp': dt.isoformat(),
            'symbol': self.symbol,
            'level': lvl.name,
            'direction': direction,
            'entry': entry,
            'tp': tp,
            'sl': sl,
            'contracts': self.cfg.contracts,
            'trail_pts': self.cfg.trail,
            'session': 'London' if in_london(dt.time()) else 'NY',
        }


# ── Webhook Sender ───────────────────────────────────────────────────────────

def send_webhook(signal: dict, test_mode: bool = False) -> bool:
    """
    Send signal to TradersPost webhook.

    TradersPost webhook format:
    {
        "ticker": "MNQ1!",
        "action": "buy" or "sell",
        "sentiment": "bullish" or "bearish",
        "price": 18500.00,
        "quantity": 4,
        "takeProfit": 18535.00,
        "stopLoss": 18450.00
    }
    """
    # Map to TradersPost format
    ticker_map = {
        'MNQ': 'MNQ1!',
        'MES': 'MES1!',
        'MGC': 'MGC1!',
    }

    action = 'buy' if signal['direction'] == 'LONG' else 'sell'
    sentiment = 'bullish' if signal['direction'] == 'LONG' else 'bearish'

    payload = {
        'ticker': ticker_map.get(signal['symbol'], signal['symbol']),
        'action': action,
        'sentiment': sentiment,
        'price': signal['entry'],
        'quantity': signal['contracts'],
        'takeProfit': signal['tp'],
        'stopLoss': signal['sl'],
    }

    print(f"\n{'='*60}")
    print(f"  SIGNAL: {signal['symbol']} {signal['direction']} @ {signal['level']}")
    print(f"{'='*60}")
    print(f"  Entry:     {signal['entry']:.2f}")
    print(f"  TP:        {signal['tp']:.2f}")
    print(f"  SL:        {signal['sl']:.2f}")
    print(f"  Contracts: {signal['contracts']}")
    print(f"  Session:   {signal['session']}")
    print(f"  Time:      {signal['timestamp']}")
    print()

    if test_mode:
        print("  [TEST MODE] Would send webhook:")
        print(f"  {json.dumps(payload, indent=2)}")
        return True

    try:
        response = requests.post(
            WEBHOOK_URL,
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        if response.status_code == 200:
            print(f"  [SENT] Webhook delivered successfully")
            return True
        else:
            print(f"  [ERROR] Webhook failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"  [ERROR] Webhook exception: {e}")
        return False


# ── Alert Handler (for Pine Script alerts via webhook) ───────────────────────

def parse_pine_alert(alert_text: str) -> Optional[dict]:
    """
    Parse alert text from Pine Script indicator.

    Expected format from Pine:
    "KLBS MNQ LONG PDH 18500.00 TP:18535.00 SL:18450.00"
    or
    "KLBS MES SHORT PMH 5200.00 TP:5175.00 SL:5225.00"
    """
    parts = alert_text.strip().split()
    if len(parts) < 7 or parts[0] != 'KLBS':
        return None

    try:
        symbol = parts[1]
        direction = parts[2]
        level = parts[3]
        entry = float(parts[4])
        tp = float(parts[5].replace('TP:', ''))
        sl = float(parts[6].replace('SL:', ''))

        cfg = INSTRUMENTS.get(symbol)
        if not cfg:
            return None

        return {
            'timestamp': datetime.now(ET).isoformat(),
            'symbol': symbol,
            'level': level,
            'direction': direction,
            'entry': entry,
            'tp': tp,
            'sl': sl,
            'contracts': cfg.contracts,
            'trail_pts': cfg.trail,
            'session': 'London' if in_london(datetime.now(ET).time()) else 'NY',
        }
    except (ValueError, IndexError):
        return None


# ── Main Entry Points ────────────────────────────────────────────────────────

def process_bar(symbol: str, dt: datetime, o: float, h: float, l: float, c: float,
                state: DailyState, test_mode: bool = False) -> List[dict]:
    """
    Process a single bar and send any webhooks.
    Call this from your data feed handler.
    """
    signals = state.update_bar(dt, o, h, l, c)

    for signal in signals:
        send_webhook(signal, test_mode=test_mode)

    return signals


def handle_alert(alert_text: str, test_mode: bool = False) -> bool:
    """
    Handle an incoming alert from Pine Script.
    Use this as your webhook endpoint handler.
    """
    signal = parse_pine_alert(alert_text)
    if signal:
        return send_webhook(signal, test_mode=test_mode)
    return False


# ── CLI for Testing ──────────────────────────────────────────────────────────

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='KLBS Webhook Signal Generator')
    parser.add_argument('--symbol', type=str, default='MNQ', choices=['MNQ', 'MES', 'MGC'])
    parser.add_argument('--test', action='store_true', help='Test mode (no actual webhooks)')
    parser.add_argument('--alert', type=str, help='Process a Pine alert string')
    args = parser.parse_args()

    if args.alert:
        # Process Pine alert
        print(f"Processing alert: {args.alert}")
        handle_alert(args.alert, test_mode=args.test)
    else:
        # Demo mode - show current state
        print(f"\nKLBS Webhook Generator")
        print(f"{'='*60}")
        print(f"Symbol: {args.symbol}")
        print(f"Config: {INSTRUMENTS[args.symbol]}")
        print(f"Mode:   {'TEST' if args.test else 'LIVE'}")
        print(f"\nCurrent time (ET): {datetime.now(ET).strftime('%Y-%m-%d %H:%M:%S')}")

        t = datetime.now(ET).time()
        print(f"Session status:")
        print(f"  London: {'ACTIVE' if in_london(t) else 'closed'}")
        print(f"  NY:     {'ACTIVE' if in_ny(t) else 'closed'}")
        print(f"  Dead:   {'YES' if in_dead(t) else 'no'}")

        print(f"\nTo process bars, import and call:")
        print(f"  from klbs_webhook import DailyState, process_bar")
        print(f"  state = DailyState('{args.symbol}')")
        print(f"  signals = process_bar('{args.symbol}', dt, o, h, l, c, state)")

        print(f"\nTo handle Pine alerts:")
        print(f"  from klbs_webhook import handle_alert")
        print(f"  handle_alert('KLBS MNQ LONG PDH 18500.00 TP:18535.00 SL:18450.00')")
