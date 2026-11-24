<#
 Registers a Windows Task Scheduler task that starts run-daily-backup.ps1 EVERY 15 MINUTES.
 The runner decides whether a backup is due, using the time set in the admin Backups tab.
 Changing the time there needs no change on this PC. Tom runs this installer once himself.

 Usage:  powershell -ExecutionPolicy Bypass -File install-scheduled-task.ps1 -Dest "E:\CabinetDealzBackups" -EnvFile "C:\CabinetDealzBackup\backup.env"
 Remove later with:  Unregister-ScheduledTask -TaskName "CabinetDealz Backup Check" -Confirm:$false
 Note: it only backs up while the PC is on and the flash drive is plugged in.
#>
param(
  [string]$Dest = "E:\CabinetDealzBackups",
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [string]$TaskName = "CabinetDealz Backup Check"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Runner = Join-Path $ScriptDir "run-daily-backup.ps1"
if (-not (Test-Path $Runner)) { throw "Cannot find $Runner" }
if (-not (Test-Path $EnvFile)) { throw "Key file not found: $EnvFile" }

$argString = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`" -Dest `"$Dest`" -EnvFile `"$EnvFile`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argString
# Starts a minute from now, then repeats every 15 minutes for ever.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
# StartWhenAvailable: catch up after the PC was off. IgnoreNew: never run two at once.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 6)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Every 15 minutes: back up Cabinet Dealz files only when the admin-set time has passed and today's snapshot is not done." -Force | Out-Null
Write-Host "Task '$TaskName' registered. It checks every 15 minutes."
Write-Host "To test it now (backs up immediately): powershell -ExecutionPolicy Bypass -File `"$Runner`" -Dest `"$Dest`" -EnvFile `"$EnvFile`" -Force"
Write-Host "Then read the newest file in $Dest\logs"
