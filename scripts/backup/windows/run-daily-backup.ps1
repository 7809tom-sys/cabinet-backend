<#
 Cabinet Dealz backup runner. The Windows scheduled task starts this every 15 minutes.
 Each time it asks the website for the backup schedule and only backs up when:
   - the configured time (in the configured time zone) has passed today, and
   - today's snapshot is not already finished on the drive.
 So changing the time in the admin Backups tab needs no change on this PC.

 If the website cannot be reached, it uses the last schedule it saved (schedule-cache.json next to the scripts),
 or 03:00 America/New_York.

 Steps when due: 1) Supabase files  2) database dump (skips itself if mysqldump is missing)
                 3) GitHub code mirror (Sundays only)  4) 90-day index / cleanup.
 It reports start and finish to the admin Backups tab. If reporting fails, the backup still runs and it is logged here.
 Logs: <Dest>\logs\backup-YYYY-MM-DD.log. Key values are never printed.

 Usage:  powershell -ExecutionPolicy Bypass -File run-daily-backup.ps1 -Dest "E:\CabinetDealzBackups" -EnvFile "C:\CabinetDealzBackup\backup.env"
 Extra switches:  -Force (back up now even if not due)   -Prune (delete snapshots older than the retention from the drive)
#>
param(
  [string]$Dest = "E:\CabinetDealzBackups",
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [switch]$Force,
  [switch]$Prune
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackupDir = Split-Path -Parent $ScriptDir      # ...\scripts\backup
$CacheFile = Join-Path $ScriptDir "schedule-cache.json"
$Machine = $env:COMPUTERNAME

# Nothing to do (and nothing to log) if the drive is not plugged in. This runs every 15 minutes.
if (-not (Test-Path $Dest)) { exit 0 }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Node.js is not installed. Install Node 18 or newer from nodejs.org."; exit 2 }
if (-not (Test-Path $EnvFile)) { Write-Host "Key file not found: $EnvFile"; exit 2 }

# Only one backup at a time.
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "CabinetDealzBackupRunner", [ref]$createdNew)
if (-not $createdNew) { exit 0 }

try {
  $checkArgs = @((Join-Path $BackupDir "check-due.mjs"), "--dest", $Dest, "--env", $EnvFile, "--cache", $CacheFile)
  if ($Force) { $checkArgs += "--force" }
  $decisionText = (& node @checkArgs 2>$null | Select-Object -Last 1)
  try { $decision = $decisionText | ConvertFrom-Json } catch { $decision = $null }
  if ($null -eq $decision) { exit 0 }
  if (-not $decision.due) { exit 0 }

  $Today = $decision.today
  $Tz = $decision.schedule.timezone
  $Retention = $decision.schedule.retentionDays
  $LogDir = Join-Path $Dest "logs"
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $Log = Join-Path $LogDir "backup-$Today.log"

  function Write-Log([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $Log -Value $line
    Write-Host $line
  }

  function Invoke-Step([string]$Name, [string[]]$NodeArgs) {
    Write-Log "START $Name"
    $output = & node @NodeArgs 2>&1
    $code = $LASTEXITCODE
    foreach ($l in $output) { Add-Content -Path $Log -Value ("    " + $l) }
    if ($code -ne 0) { Write-Log "FAILED $Name (exit code $code)"; return $false }
    Write-Log "OK $Name"
    return $true
  }

  function Send-Report([string[]]$ReportArgs) {
    $out = & node @ReportArgs 2>&1
    foreach ($l in $out) { Add-Content -Path $Log -Value ("    [report] " + $l) }
    try { return ($out | Where-Object { $_ -match '^\{' } | Select-Object -Last 1 | ConvertFrom-Json) } catch { return $null }
  }

  Write-Log "Backup due ($($decision.reason)). Schedule $($decision.schedule.dailyTime) $Tz from $($decision.source). Snapshot date $Today."
  $Snapshot = Join-Path $Dest "daily\$Today"
  $started = (Get-Date).ToUniversalTime().ToString("o")
  $IsSunday = ([datetime]::ParseExact($Today, "yyyy-MM-dd", $null)).DayOfWeek -eq "Sunday"
  $scope = @("supabase_storage")
  $reportBase = @((Join-Path $BackupDir "report-run.mjs"))

  $r = Send-Report ($reportBase + @("start", "--env", $EnvFile, "--machine", $Machine, "--dest", $Dest, "--scope", ($scope -join ","), "--started", $started))
  $runId = $null; if ($r -and $r.ok) { $runId = $r.runId } else { Write-Log "Could not report the start to the admin Backups tab. Continuing with the backup." }

  $errors = @()
  $storageOk = Invoke-Step "Supabase files" @((Join-Path $BackupDir "backup-supabase-storage.mjs"), "--dest", $Dest, "--env", $EnvFile, "--date", $Today, "--tz", $Tz)
  if (-not $storageOk) { $errors += "Supabase files failed" }

  $dbOk = Invoke-Step "Database dump (skips itself if mysqldump is missing)" @((Join-Path $BackupDir "backup-tidb.mjs"), "--dest", $Dest, "--env", $EnvFile, "--date", $Today, "--tz", $Tz)
  if (-not $dbOk) { $errors += "Database dump failed" }
  if (Test-Path (Join-Path $Snapshot "database\cabinet_dealz.sql.gz")) { $scope += "database" }

  if ($IsSunday) {
    Write-Log "START GitHub code mirror (Sundays)"
    $codeOut = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ScriptDir "backup-github-repos.ps1") -Dest $Dest 2>&1
    $codeCode = $LASTEXITCODE
    foreach ($l in $codeOut) { Add-Content -Path $Log -Value ("    " + $l) }
    if ($codeCode -ne 0) { Write-Log "FAILED GitHub code mirror"; $errors += "Code mirror failed" }
    elseif (Test-Path (Join-Path $Dest "code\$Today")) { $scope += "code"; Write-Log "OK GitHub code mirror" }
  }

  $rotateArgs = @((Join-Path $BackupDir "rotate-backups.mjs"), "--dest", $Dest, "--tz", $Tz, "--retention", "$Retention")
  if ($Prune) { $rotateArgs += "--prune" }
  if (-not (Invoke-Step "90-day index" $rotateArgs)) { $errors += "Index/cleanup failed" }

  if (-not $storageOk) { $status = "failed" } elseif ($errors.Count -gt 0) { $status = "partial" } else { $status = "success" }
  $errText = ($errors -join "; ")
  if (-not $storageOk -and (Test-Path (Join-Path $Snapshot "SUMMARY.txt"))) {
    $first = (Select-String -Path (Join-Path $Snapshot "SUMMARY.txt") -Pattern "^\s+- " | Select-Object -First 3 | ForEach-Object { $_.Line.Trim() }) -join " "
    if ($first) { $errText = "$errText $first".Trim() }
  }

  $finishArgs = $reportBase + @("finish", "--env", $EnvFile, "--machine", $Machine, "--dest", $Dest, "--scope", ($scope -join ","), "--status", $status, "--snapshot", $Snapshot, "--started", $started, "--error", $errText)
  if ($runId) { $finishArgs += @("--run-id", "$runId") }
  $r2 = Send-Report $finishArgs
  if (-not ($r2 -and $r2.ok)) { Write-Log "Could not report the finish to the admin Backups tab. The result is in this log." }

  Write-Log "BACKUP FINISHED: $status"
  if ($status -eq "success") { exit 0 } else { exit 1 }
}
finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
