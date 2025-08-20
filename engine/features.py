import pandas as pd


def ema(s: pd.Series, n: int) -> pd.Series:
return s.ewm(span=n, adjust=False).mean()


def rsi(s: pd.Series, n: int = 14) -> pd.Series:
delta = s.diff()
up = delta.clip(lower=0)
down = -delta.clip(upper=0)
rs = up.rolling(n).mean() / down.rolling(n).mean()
return 100 - 100/(1+rs)


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
hl = df["high"] - df["low"]
hc = (df["high"] - df["close"].shift()).abs()
lc = (df["low"] - df["close"].shift()).abs()
tr = pd.concat([hl, hc, lc], axis=1).max(axis=1)
return tr.rolling(n).mean()


def build_features(bars: pd.DataFrame, spec: list[dict]) -> pd.DataFrame:
df = bars.copy()
for f in spec:
name, kind, p = f["name"], f["kind"], f.get("params", {})
if kind == "ema":
df[name] = ema(df.close, int(p.get("length", 20)))
elif kind == "rsi":
df[name] = rsi(df.close, int(p.get("length", 14)))
elif kind == "atr":
df[name] = atr(df, int(p.get("length", 14)))
else:
raise ValueError(f"Unknown feature kind: {kind}")
return df