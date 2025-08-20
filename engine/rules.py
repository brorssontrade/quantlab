import numexpr as ne
import pandas as pd


# Enkel expressionsmotor med numexpr för vektoriserad evaluering.
# Exempel: expr "rsi > rsi_thr" där rsi är kolumn, rsi_thr parameter.


def eval_expr(df: pd.DataFrame, expr: str, params: dict) -> pd.Series:
# Gör parametrar till variabler i evalutationen
local_dict = {**{c: df[c] for c in df.columns if c not in ("open","high","low","close","volume")}, **params}
try:
res = ne.evaluate(expr, local_dict)
except Exception as e:
raise ValueError(f"Expression error '{expr}': {e}")
return pd.Series(res, index=df.index)


def combine_all(series_list: list[pd.Series]) -> pd.Series:
out = series_list[0].copy().astype(bool)
for s in series_list[1:]:
out &= s.astype(bool)
return out


def combine_any(series_list: list[pd.Series]) -> pd.Series:
out = series_list[0].copy().astype(bool)
for s in series_list[1:]:
out |= s.astype(bool)
return out