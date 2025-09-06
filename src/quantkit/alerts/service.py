from __future__ import annotations
from ..config import Settings, load_app_config
from ..data.repository import get_timeseries
from ..strategies.ema_cross import EmaCross
from .slack import send_slack
from .telegram import send_telegram

def run_alerts(timeframe: str = '5m') -> None:
    cfg = load_app_config()
    env = Settings()
    for sym in cfg.watchlist:
        df = get_timeseries(sym, timeframe, env, force=False)
        strat = EmaCross(10, 30)
        sig = strat.generate(df)
        last = sig.dropna().iloc[-1]
        if last == 1:
            msg = f'[{sym}] BUY signal ({strat.name}) on {timeframe}'
        elif last == -1:
            msg = f'[{sym}] SELL signal ({strat.name}) on {timeframe}'
        else:
            continue
        send_slack(env.slack_webhook_url, msg)
        send_telegram(env.telegram_bot_token, env.telegram_chat_id, msg)
