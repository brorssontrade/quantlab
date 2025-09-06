param(
  [int]    $IntervalSeconds   = 60,
  [string] $HotlistsTimeframe = "5m",
  [switch] $Force
)

Write-Host "[loop] Start – IntervalSeconds=$IntervalSeconds, HotlistsTimeframe=$HotlistsTimeframe"

function Run-Cmd([string[]] $args) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName  = (Get-Command python).Source
  $psi.ArgumentList.AddRange($args)
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError  = $true
  $psi.UseShellExecute = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) {
    Write-Warning ("CLI failed with code {0}`n{1}" -f $p.ExitCode, $p.StandardError.ReadToEnd())
    throw "CLI failed"
  }
  else {
    Write-Host ($p.StandardOutput.ReadToEnd())
  }
}

while ($true) {
  try {
    $force = @()
    if ($Force) { $force += "--force" }

    Write-Host "[$(Get-Date -Format s)] Hotlists…"
    $argsHot = @("-m","quantkit","snapshot-hotlists","--timeframe",$HotlistsTimeframe) + $force
    Run-Cmd $argsHot

    Write-Host "[$(Get-Date -Format s)] Signals…"
    $argsSig = @("-m","quantkit","snapshot-signals") + $force
    Run-Cmd $argsSig

    Write-Host "[$(Get-Date -Format s)] Movers…"
    $argsMov = @("-m","quantkit","snapshot-movers") + $force
    Run-Cmd $argsMov
  }
  catch {
    Write-Warning "Loop error: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds $IntervalSeconds
}
