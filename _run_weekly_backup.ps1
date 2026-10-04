# Backup runner for the Windows scheduled task "Supabase Weekly Backup".
#
# Why this exists: on 2026-09-21 and 2026-09-28 the task woke the PC at 01:00, started the
# backup, and was killed before it finished (result 0xC000013A). A PC woken by a timer goes back
# to sleep after about 2 minutes without user input, and right after waking the network can be
# slow, so a backup that ran past that window died. This runner:
#   1. skips (silently) if a successful backup from the last 6 days already exists, so the logon
#      and unlock triggers only do work when the Monday run failed or was missed,
#   2. keeps the PC awake for the whole run,
#   3. waits for the network before starting,
#   4. gives each attempt a time limit and retries.
#
# A backup counts as successful only when its folder contains _manifest.json, which
# _backup_user.mjs writes last. Folders without one are leftovers from a failed attempt.
#
# Manual use:  _run_weekly_backup.cmd          (backs up only if the last one is stale)
#              _run_weekly_backup.cmd -Force   (always backs up)

param(
  [switch]$Force,
  [int]$MaxAttempts = 3,
  [int]$AttemptTimeoutSeconds = 600,
  [int]$RetryDelaySeconds = 60,
  [string]$NodeScript = '_backup_user.mjs'
)

$ErrorActionPreference = 'Stop'
$RepoDir   = $PSScriptRoot
$BackupDir = Join-Path (Split-Path $RepoDir -Parent) 'Backups'
$LogFile   = Join-Path $BackupDir 'backup-log.txt'
$Node      = 'C:\Program Files\nodejs\node.exe'
$FreshDays = 6

function Write-Log([string]$Message) {
  $line = '{0} | {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -Path $LogFile -Value $line -Encoding ASCII
}

# ---- 1. skip if a recent successful backup exists ----
if (-not $Force) {
  $latest = Get-ChildItem -Path $BackupDir -Directory -Filter 'backup-*' |
    ForEach-Object { Join-Path $_.FullName '_manifest.json' } |
    Where-Object { Test-Path $_ } |
    ForEach-Object { Get-Item $_ } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($latest -and ((Get-Date) - $latest.LastWriteTime).TotalDays -lt $FreshDays) { exit 0 }
}

Write-Log 'run starting'

# ---- 2. keep the PC awake until this script exits ----
Add-Type -Namespace Win32 -Name Power -MemberDefinition @'
[DllImport("kernel32.dll")]
public static extern uint SetThreadExecutionState(uint esFlags);
'@
$ES_CONTINUOUS      = [uint32]2147483648
$ES_SYSTEM_REQUIRED = [uint32]1
if ([Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) -eq 0) {
  Write-Log 'warning: could not request keep awake'
}

$exitCode = 1
try {
  # ---- 3. wait up to 3 minutes for the Supabase host to be reachable ----
  $envLine = Select-String -Path (Join-Path $RepoDir '.env.local') -Pattern '^VITE_SUPABASE_URL=(.+)$'
  $apiHost = ([uri]$envLine.Matches[0].Groups[1].Value.Trim()).Host
  $online = $false
  for ($w = 0; $w -lt 18; $w++) {
    try {
      $tcp = New-Object System.Net.Sockets.TcpClient
      if ($tcp.ConnectAsync($apiHost, 443).Wait(5000)) { $online = $true }
      $tcp.Close()
    } catch { }
    if ($online) { break }
    Start-Sleep -Seconds 10
  }
  if (-not $online) { Write-Log "network not reachable after 3 minutes ($apiHost), trying anyway" }

  # ---- 4. run the backup with a time limit, retrying on failure ----
  $env:BACKUP_OUT_DIR = $BackupDir
  $outFile = Join-Path $env:TEMP 'supabase-backup-stdout.txt'
  $errFile = Join-Path $env:TEMP 'supabase-backup-stderr.txt'
  for ($i = 1; $i -le $MaxAttempts; $i++) {
    $p = Start-Process -FilePath $Node -ArgumentList $NodeScript -WorkingDirectory $RepoDir `
      -NoNewWindow -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    $null = $p.Handle   # PowerShell 5.1 only reports ExitCode if the handle was read
    if ($p.WaitForExit($AttemptTimeoutSeconds * 1000)) {
      $result = $p.ExitCode
    } else {
      try { $p.Kill() } catch { }
      $result = "timed out after $AttemptTimeoutSeconds s"
    }
    foreach ($f in @($outFile, $errFile)) {
      if (Test-Path $f) { Get-Content $f | Add-Content -Path $LogFile -Encoding ASCII }
    }
    if ($result -eq 0) {
      Write-Log "attempt $i of ${MaxAttempts}: success"
      $exitCode = 0
      break
    }
    Write-Log "attempt $i of ${MaxAttempts}: failed ($result)"
    if ($i -lt $MaxAttempts) { Start-Sleep -Seconds $RetryDelaySeconds }
  }
  if ($exitCode -ne 0) { Write-Log 'BACKUP FAILED: all attempts failed; the next logon or unlock will retry' }
}
finally {
  [void][Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS)
  Write-Log "run finished, exit code $exitCode"
}
exit $exitCode
