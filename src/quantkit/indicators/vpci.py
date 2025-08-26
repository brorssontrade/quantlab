from __future__ import annotations
import numpy as np, pandas as pd
from .base import IndicatorSpec

INDICATOR = IndicatorSpec(
    id="vpci", name="Volume Price Confirmation Index (variant)",
    inputs=("close","volume"), params=dict(short=5, long=20, atr_len=14),
    outputs=("vpci","vpc","vpr","vcf"),
    description="VPCI ≈ VPC * VPR * VCF där VPC = prisdiff(EMAshort-EMAlong), VPR = volymvägt pris/EMA(pris), VCF = ATR/EMA(ATR)."
)

def compute(df: pd.DataFrame, short:int=5, long:int=20, atr_len:int=14) -> pd.DataFrame:
    c = pd.to_numeric(df["close"], errors="coerce")
    v = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)
    ema_s = c.ewm(span=short, adjust=False).mean()
    ema_l = c.ewm(span=long,  adjust=False).mean()
    vpc = ema_s - ema_l

    vma = (c*v).ewm(span=long, adjust=False).mean() / (v.ewm(span=long, adjust=False).mean() + 1e-12)
    vpr = vma / (ema_l + 1e-12)

    h = pd.to_numeric(df["high"], errors="coerce"); l = pd.to_numeric(df["low"], errors="coerce"); prev = c.shift(1)
    tr = pd.concat([h-l, (h-prev).abs(), (l-prev).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1/atr_len, adjust=False).mean()
    vcf = atr / (atr.ewm(span=atr_len, adjust=False).mean() + 1e-12)

    vpci = vpc * vpr * vcf
    return pd.DataFrame({"vpci":vpci, "vpc":vpc, "vpr":vpr, "vcf":vcf})
