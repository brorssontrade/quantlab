import yaml, pandas as pd
from engine.ingest import EODHDClient
from engine.resample import resample_1m_to_1h
from engine.features import build_features
from engine.strategy import Strategy


# EXEMPEL: enkel körning för 1 symbol


def run_once(symbol: str, cfg_path: str, range_: str = "30d"):
cfg = yaml.safe_load(open(cfg_path))
cli = EODHDClient()
m1 = cli.intraday_1m(symbol, range_)
h1 = resample_1m_to_1h(m1)
feats = build_features(h1, cfg["features"])
strat = Strategy(feats, cfg)


# Ta första kombon som demo (i praktiken: optimera)
params = {
"rsi_thr": 55,
"emaF": 20,
"emaS": 50,
"tp_pct": 3.0,
"sl_pct": 1.5,
"max_hold_h": 6,
}
sig = strat.signals(params)
out = feats.join(sig)
out.to_csv("reports/demo_signals.csv")
print("Saved -> reports/demo_signals.csv")


if __name__ == "__main__":
run_once("ABB.ST", "config/strategy.yaml", "30d")