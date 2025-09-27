# ML Baseline (XGB + Backtest)

## Träna
python -m quantkit.ml.supervised.trainer train ^
  --parquet storage/snapshots/breadth/symbols/latest.parquet ^
  --horizon 5 --label class --neutral-band 0.0 ^
  --n-splits 5 --n-trials 30 ^
  --out-model models/xgb_us_5d.pkl ^
  --out-oof storage/signals/oof_xgb_5d.parquet

## Signaler (OOF)
python -m quantkit.ml.supervised.signals from-oof ^
  --oof-parquet storage/signals/oof_xgb_5d.parquet ^
  --threshold 0.0 ^
  --out storage/signals/signals_oof_xgb_5d.parquet

## Backtest
python -m quantkit.backtest.engine run ^
  --signals storage/signals/signals_oof_xgb_5d.parquet ^
  --prices storage/snapshots/breadth/symbols/latest.parquet ^
  --cost-bps 2 ^
  --out storage/backtests/xgb_5d_equity.parquet

**Tolka output**
- Trainer: OOF AUC/F1/ACC (klass) eller RMSE (reg).
- Backtest: CAGR, Sharpe, MaxDD, Turnover skrivs till stdout.
- Equity-kurva: storage/backtests/xgb_5d_equity.parquet (Ts, Equity, Ret)
