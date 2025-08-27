from __future__ import annotations
from typing import Literal

# Konsekventa alias i hela koden
Timeframe = Literal["EOD", "1m", "5m", "15m", "30m", "1h", "2h", "4h"]

INTRADAY = {"1m", "5m", "15m", "30m", "1h", "2h", "4h"}
DAILY = {"EOD"}

def is_intraday(tf: str) -> bool:
    return tf.lower() != "eod"

def normalize_tf(tf: str) -> Timeframe:
    tf = tf.strip()
    if tf.upper() == "EOD":
        return "EOD"  # type: ignore[return-value]
    return tf.lower()  # type: ignore[return-value]
