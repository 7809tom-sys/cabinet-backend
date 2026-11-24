<#
 Cabinet Dealz daily backup. Runs: 1) Supabase files  2) optional database dump  3) 90-day rotation.
 Appends to <Dest>\logs\backup-YYYY-MM-DD.log. Never prints key values.
 Usage:  powershell -ExecutionPolicy Bypass -File run-daily-backup.ps1 -Dest "E:\CabinetDealzBackups" -EnvFile "C:\CabinetDealzBackup\backup.env"
 Add -Prune only when you want snapshots older than 90 days deleted from the backup drive.
#>
param(
  [Parameter(Mandatory = $true)][string]$Dest,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [switch]$Prune
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackupDir = Split-Path -Parent $ScriptDir      # ...\scripts\backup

if (-not (Test-Path $Dest)) {
  Write-Host "The backup drive/folder '$Dest' was not found. Plug in the flash drive and check the drive letter."
  exit 2
}
$LogDir = Join-Path $Dest "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir ("backup-" + (Get-Date -Format "yyyy-MM-dd") + ".log")

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $Log -Value $line
  Write-Host $line
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Log "ERROR: Node.js is not installed or not on PATH. Install Node 18 or newer from nodejs.org."
  exit 2
}
if (-not (Test-Path $EnvFile)) {
  Write-Log "ERROR: key file not found: $EnvFile"
  exit 2
}

$failed = $false

function Invoke-Step([string]$Name, [string[]]$NodeArgs) {
  Write-Log "START $Name"
  $output = & node @NodeArgs 2>&1
  $code = $LASTEXITCODE
  foreach ($l in $output) { Add-Content -Path $Log -Value ("    " + $l) }
  if ($code -ne 0) { Write-Log "FAILED $Name (exit code $code)"; return $false }
  Write-Log "OK $Name"
  return $true
}

if (-not (Invoke-Step "Supabase files" @((Join-Path $BackupDir "backup-supabase-storage.mjs"), "--dest", $Dest, "--env", $EnvFile))) { $failed = $true }
if (-not (Invoke-Step "Database dump (skips itself if mysqldump is missing)" @((Join-Path $BackupDir "backup-tidb.mjs"), "--dest", $Dest, "--env", $EnvFile))) { $failed = $true }

$rotateArgs = @((Join-Path $BackupDir "rotate-backups.mjs"), "--dest", $Dest)
if ($Prune) { $rotateArgs += "--prune" }
if (-not (Invoke-Step "90-day rotation index" $rotateArgs)) { $failed = $true }

if ($failed) { Write-Log "BACKUP FINISHED WITH ERRORS. Read this log: $Log"; exit 1 }
Write-Log "BACKUP FINISHED OK"
exit 0
