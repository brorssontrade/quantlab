param(
  [int]    $IntervalSeconds = 60,
  [string] $Timeframe       = "5m",
  [switch] $Force
)

Write-Host "[hotlists-loop] Start – IntervalSeconds=$IntervalSeconds, Timeframe=$Timeframe"
$ErrorActionPreference = "Stop"

while ($true) {
  try {
    $forceArg = @()
    if ($Force) { $forceArg += "--force" }

    Write-Host "[$(Get-Date -Format s)] Hotlists…"
    & python -m quantkit snapshot-hotlists --timeframe $Timeframe @forceArg
  }
  catch {
    Write-Warning "Loop error: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $IntervalSeconds
}
