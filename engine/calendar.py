from datetime import time
from zoneinfo import ZoneInfo
import pandas as pd


XSTO_TZ = ZoneInfo("Europe/Stockholm")


class XSTOCalendar:
def __init__(self, open_str="09:00", close_str="17:30", tz=XSTO_TZ):
h1, m1 = map(int, open_str.split(":"))
h2, m2 = map(int, close_str.split(":"))
self.open_t = time(h1, m1)
self.close_t = time(h2, m2)
self.tz = tz


def is_session_time(self, ts):
ts = ts.astimezone(self.tz)
t = ts.timetz().replace(tzinfo=None)
return (t >= self.open_t) and (t <= self.close_t)


def session_open(self, ts):
d = ts.astimezone(self.tz).date()
return pd.Timestamp.combine(d, self.open_t, tz=self.tz)


def session_close(self, ts):
d = ts.astimezone(self.tz).date()
return pd.Timestamp.combine(d, self.close_t, tz=self.tz)


def is_second_hour(self, bar_close_ts):
"""Returnerar True om barens close ligger i *andra* timmen från dagens öppning.
Ex: öppning 09:00 => andra timmen 10:00–11:00 (right-closed 11:00)."""
so = self.session_open(bar_close_ts)
# Vi antar 1h-buckets med right-closed etikett på bar-index
return (bar_close_ts > so) and (bar_close_ts <= so + pd.Timedelta(hours=2))