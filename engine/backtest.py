import pandas as pd
import numpy as np


class Backtester:
def __init__(self, bars: pd.DataFrame, signals: pd.DataFrame, params: dict, delay_minutes: int = 20):
self.bars = bars
self.signals = signals
self.params = params
self.delay = pd.Timedelta(minutes=delay_minutes)


def run_long_only(self) -> pd.DataFrame:
# Köp vid *nästa* timestamp >= (bar_close + delay)
idx = self.bars.index
close = self.bars["close"]


entries = self.signals["entry"].astype(bool)
exits = self.signals["exit"].astype(bool)


in_pos = False
entry_px = np.nan
pnl = []
pos = []


for i, t in enumerate(idx):
if not in_pos and entries.iloc[i]:
# hitta första tidpunkt efter delay (i 1h-data => nästa bar duger)
in_pos = True
entry_px = close.iloc[i+1] if i+1 < len(idx) else close.iloc[i]
elif in_pos and exits.iloc[i]:
exit_px = close.iloc[i+1] if i+1 < len(idx) else close.iloc[i]
pnl.append((exit_px / entry_px) - 1.0)
in_pos = False
entry_px = np.nan
pos.append(1 if in_pos else 0)


# Om öppen position vid slutet: stäng på sista close (ingen PnL registreras om du vill vara strikt)
returns = pd.Series(0.0, index=idx)
if pnl:
# För demo returnerar vi kumulativ avkastning per bar genom en enkel approximation
# I produktion: beräkna portföljkurva bar-för-bar
pass
# Här skapar vi en enkel "trade list" som CSV i rapportfasen.
out = pd.DataFrame({"position": pos}, index=idx)
return out