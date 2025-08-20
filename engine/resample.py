import pandas as pd


def resample_1m_to_1h(df_1m: pd.DataFrame) -> pd.DataFrame:
if df_1m.empty:
return df_1m
o = df_1m["open"].resample("1H", label="right", closed="right").first()
h = df_1m["high"].resample("1H", label="right", closed="right").max()
l = df_1m["low"].resample("1H", label="right", closed="right").min()
c = df_1m["close"].resample("1H", label="right", closed="right").last()
v = df_1m["volume"].resample("1H", label="right", closed="right").sum()
bars = pd.concat([o, h, l, c, v], axis=1)
bars.columns = ["open","high","low","close","volume"]
return bars.dropna()