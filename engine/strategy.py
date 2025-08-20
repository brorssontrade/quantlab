import pandas as pd
from .calendar import XSTOCalendar
from .rules import eval_expr, combine_all, combine_any


class Strategy:
def __init__(self, df_features: pd.DataFrame, cfg: dict):
self.df = df_features.copy()
self.cfg = cfg
self.cal = XSTOCalendar(cfg["session"]["open"], cfg["session"]["close"])
# Hjälpkolumn: "is_second_hour"
self.df["is_second_hour"] = self.df.index.map(self.cal.is_second_hour)


def signals(self, params: dict) -> pd.DataFrame:
# Entry
entry_specs = self.cfg["entry"].get("all", [])
entry_parts = [eval_expr(self.df, e["expr"], params) for e in entry_specs]
entry = combine_all(entry_parts) if entry_parts else pd.Series(False, index=self.df.index)


# Exit (any)
exit_specs = self.cfg["exit"].get("any", [])
# Här antar vi att TP/SL/time_in_trade beräknas i backtest, så placeholder:
# I första versionen implementerar vi endast regler baserat på pris/indikatorer.
exit_rule = pd.Series(False, index=self.df.index)
for e in exit_specs:
if any(k in e["expr"] for k in ("take_profit_pct","stop_loss_pct","time_in_trade_hours")):
continue
exit_rule |= eval_expr(self.df, e["expr"], params).astype(bool)


return pd.DataFrame({"entry": entry, "exit": exit_rule})