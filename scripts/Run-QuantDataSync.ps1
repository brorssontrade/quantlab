param(
  [int]$LoopMinutes = 5,
  [string]$Intervals = "EOD,5m",
  [int]$EodDays = 9000,
  [int]$IntraDays = 10,
  [switch]$NoRespectHours
)

$ErrorActionPreference = "Stop"

# --- PATHS ---
$ProjectRoot = "C:\Users\Viktor Brorsson\Desktop\quantlab"
$PyExe      = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$Watchlist  = Join-Path $ProjectRoot "watchlist.yaml"

# --- LOGG ---
$LogDir = Join-Path $ProjectRoot "reports\sync\runner"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("sync_{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))

# --- BYGG ARGUMENT ---
$commonArgs = @(
  "-m", "quantkit.cli_data", "sync",
  "--watchlist", "`"$Watchlist`"",
  "--intervals", "`"$Intervals`"",
  "--eod-days", $EodDays,
  "--intra-days", $IntraDays,
  "--loop-minutes", $LoopMinutes
)

if ($NoRespectHours) {
  $commonArgs += "--no-respect-hours"
}

# --- KÖR ---
"[$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")] starting data sync" | Out-File -FilePath $LogFile -Append -Encoding utf8
& $PyExe @commonArgs *> $LogFile
