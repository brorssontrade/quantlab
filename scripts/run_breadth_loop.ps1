param([int]$IntervalSec = 60)

$ErrorActionPreference = "Stop"
$S3 = [Environment]::GetEnvironmentVariable("S3_PREFIX","User")
if ([string]::IsNullOrWhiteSpace($S3)) { $S3 = "s3://quantlab-prod-data" }

$log = "logs\breadth_loop.log"
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null

function Sync-ToS3([string]$local, [string]$remote) {
  if (Get-Command aws -ErrorAction SilentlyContinue) {
    aws s3 cp $local $remote --only-show-errors | Out-Host
  } else {
    Write-Host "aws CLI saknas – hoppar S3-sync." -ForegroundColor Yellow
  }
}

while ($true) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[$ts] Breadth snapshot…"
  & .\.venv\Scripts\python.exe -m quantkit.snapshots.breadth_snapshot build `
      --out-sym "storage/snapshots/breadth/symbols/latest.parquet" `
      --out-agg "storage/snapshots/breadth/latest.parquet"
  $code = $LASTEXITCODE
  if ($code -eq 0) {
    Sync-ToS3 "storage/snapshots/breadth/latest.parquet" "$S3/snapshots/breadth/latest.parquet"
    Sync-ToS3 "storage/snapshots/breadth/symbols/latest.parquet" "$S3/snapshots/breadth/symbols/latest.parquet"
    "[$ts] OK"   | Out-File -FilePath $log -Append -Encoding UTF8
  } else {
    "[$ts] FAIL (exit $code)" | Out-File -FilePath $log -Append -Encoding UTF8
  }
  Start-Sleep -Seconds $IntervalSec
}
