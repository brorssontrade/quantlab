from datetime import datetime, timezone
from quantkit.data.market_hours import is_market_open, next_open_close_utc

for s in ["AAPL.US", "ABB.ST", "NVDA.US", "VOLV-B.ST"]:
    now = datetime.now(timezone.utc)
    o, c = next_open_close_utc(s, now)
    print(f"{s:12} open={o}  close={c}  open_now={is_market_open(s, now)}")
