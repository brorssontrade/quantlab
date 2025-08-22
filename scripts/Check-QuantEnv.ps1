param(
  [ValidateSet('Local','CI')]
  [string]$Mode = 'Local',
  [string[]]$Required = @('EODHD_TOKEN','ALPHA_VANTAGE_API_KEY'),
  [string[]]$Optional = @('TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID','SLACK_WEBHOOK_URL','PARQUET_DIR','DUCKDB_PATH','TZ'),
  [switch]$WriteEnvFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Env([string]$name) {
  try { (Get-Item -Path ("Env:{0}" -f $name) -ErrorAction Stop).Value } catch { $null }
}
function Set-Env([string]$name, [string]$value) {
  if ($null -ne $value) { Set-Item -Path ("Env:{0}" -f $name) -Value $value | Out-Null }
}

function Add-EnvFromDotEnv($path) {
  if (Test-Path $path) {
    Get-Content $path | ForEach-Object {
      if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
        $k=$matches[1]; $v=$matches[2]
        if (-not (Get-Env $k)) { Set-Env $k $v }
      }
    }
  }
}

if ($Mode -eq 'Local') { Add-EnvFromDotEnv ".env" }

if (-not (Get-Env 'PARQUET_DIR')) { Set-Env 'PARQUET_DIR' './storage/parquet' }
if (-not (Get-Env 'DUCKDB_PATH')) { Set-Env 'DUCKDB_PATH' './db/quant.duckdb' }
if (-not (Get-Env 'TZ'))          { Set-Env 'TZ'          'Europe/Stockholm' }

$fail=$false
Write-Host "== REQUIRED =="
foreach($k in $Required){
  $present = -not [string]::IsNullOrWhiteSpace((Get-Env $k))
  $masked  = if ($present) { ('*' * 8) } else { '<empty>' }
  "{0,-22} : {1}" -f $k, $masked
  if (-not $present){ $fail=$true }
}

"`n== OPTIONAL =="
foreach($k in $Optional){
  $present = -not [string]::IsNullOrWhiteSpace((Get-Env $k))
  $masked  = if ($present) { ('*' * 8) } else { '<empty>' }
  "{0,-22} : {1}" -f $k, $masked
}

$parquet    = Get-Env 'PARQUET_DIR'
$duckdbPath = Get-Env 'DUCKDB_PATH'
New-Item -ItemType Directory -Force -Path $parquet | Out-Null
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($duckdbPath)) | Out-Null
"`nFolders ensured: $parquet , $duckdbPath"

if ($WriteEnvFile) {
  $lines = @()
  foreach($k in $Required + $Optional){
    $val = Get-Env $k
    if ($val) { $lines += "$k=$val" }
  }
  Set-Content -Path ".env" -Value ($lines -join "`n")
  "Wrote .env with present variables."
}

if ($fail) {
  Write-Error "Missing required secrets."
  exit 1
} else {
  "`nAll required secrets present."
}
