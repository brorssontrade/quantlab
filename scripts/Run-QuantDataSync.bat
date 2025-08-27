@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem --- Paths ---
set "PROJECT_ROOT=C:\Users\Viktor Brorsson\Desktop\quantlab"
cd /d "%PROJECT_ROOT%"

set "PY=%PROJECT_ROOT%\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo [ERROR] Hittar inte Python i venv: %PY%
  exit /b 1
)

set "WATCHLIST=%PROJECT_ROOT%\watchlist.yaml"
if not exist "%WATCHLIST%" (
  echo [WARN] Hittar inte watchlist.yaml: %WATCHLIST%
)

rem --- Loggfil ---
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format ''yyyy-MM-dd''"') do set "TODAY=%%I"
set "LOGDIR=%PROJECT_ROOT%\reports\sync\runner"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1
set "LOGFILE=%LOGDIR%\sync_%TODAY%.log"

echo [%date% %time%] starting data sync >> "%LOGFILE%"

rem --- K?r sync-loopen ---
"%PY%" -m quantkit.cli_data sync ^
  --watchlist "%WATCHLIST%" ^
  --intervals "EOD,5m" ^
  --eod-days 9000 ^
  --intra-days 10 ^
  --loop-minutes 5 ^
  --respect-hours >> "%LOGFILE%" 2>&1

exit /b %ERRORLEVEL%
