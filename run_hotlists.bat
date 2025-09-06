@echo off
setlocal
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
call ".\.venv\Scripts\activate.bat"
set "PYTHONPATH=%CD%\src"
powershell -ExecutionPolicy Bypass -File ".\scripts\run_hotlists_loop.ps1" -IntervalSeconds 60 -Timeframe 5m -Force >> "logs\hotlists_loop.log" 2>&1
