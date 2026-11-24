<#
 Registers a daily Windows Task Scheduler task that runs run-daily-backup.ps1. Tom runs this once himself.
 Usage:  powershell -ExecutionPolicy Bypass -File install-scheduled-task.ps1 -Dest "E:\CabinetDealzBackups" -EnvFile "C:\CabinetDealzBackup\backup.env" -Time "02:00"
 Remove later with:  Unregister-ScheduledTask -TaskName "CabinetDealz Daily Backup" -Confirm:$false
 Note: the task only works while the flash drive is plugged in and the PC is on at that time.
#>
param(
  [Parameter(Mandatory = $true)][string]$Dest,
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [string]$Time = "02:00",
  [string]$TaskName = "CabinetDealz Daily Backup"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Runner = Join-Path $ScriptDir "run-daily-backup.ps1"
if (-not (Test-Path $Runner)) { throw "Cannot find $Runner" }
if (-not (Test-Path $EnvFile)) { throw "Key file not found: $EnvFile" }

$argString = "-NoProfile -ExecutionPolicy Bypass -File `"$Runner`" -Dest `"$Dest`" -EnvFile `"$EnvFile`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argString
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
# StartWhenAvailable: if the PC was off at the scheduled time, run as soon as it is back on.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 6)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Cabinet Dealz daily backup of Supabase files (and database dump if mysqldump is installed)." -Force | Out-Null
Write-Host "Task '$TaskName' registered. It will run daily at $Time."
Write-Host "To test it now: Start-ScheduledTask -TaskName `"$TaskName`""
Write-Host "Then read the newest file in $Dest\logs"
