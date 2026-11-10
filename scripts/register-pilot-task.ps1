# Registers a Windows scheduled task that starts scripts/pilot.ps1 at logon and restarts it if it stops,
# so the pilot survives reboots. Run once in PowerShell as the user who runs TeamPulse. Remove with:
#   Unregister-ScheduledTask -TaskName 'TeamPulse pilot' -Confirm:$false
param([int]$Port = 8787)
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'pilot.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -Port $Port" `
    -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'TeamPulse pilot' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Registered 'TeamPulse pilot'. Start it now with: Start-ScheduledTask -TaskName 'TeamPulse pilot'"
