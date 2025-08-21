@echo off
REM Byter till repo-roten (denna fil ligger i scripts\)
cd /d "%~dp0\.."
REM Kör din venvs python och scriptet
.\.venv\Scripts\python.exe -m scripts.live_alerts --symbols ABB.ST,ERICB.ST --source yahoo --use_optuna_best

