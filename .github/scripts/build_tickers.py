# .github/scripts/build_tickers.py
import sys, yaml
from pathlib import Path

suffix = sys.argv[1]  # "ST" eller "US"
doc = yaml.safe_load(Path("watchlist.yaml").read_text(encoding="utf-8")) or {}
items = doc.get("items", []) or doc.get("tickers", [])
codes = []
for it in items:
    c = it if isinstance(it, str) else (it or {}).get("code")
    if c and c.endswith(f".{suffix}"):
        codes.append(c)
print(",".join(sorted(set(codes))))
