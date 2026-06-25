# One-time: install auto-guard (Windows logon + repo dev) so DGX SSH/Cursor/NVIDIA Sync stay fixed.
#
#   cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio
#   .\scripts\install-dgx-ssh-guard.ps1

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
$ensure = Join-Path $scriptDir "ensure-dgx-ssh-config.ps1"
$taskName = "CharacterStudio-DGX-SSH-Guard"

Write-Host ""
Write-Host "=== Install DGX SSH auto-guard ===" -ForegroundColor Cyan

# 1) Startup folder shortcut (runs after sign-in)
$startup = [Environment]::GetFolderPath("Startup")
$shortcut = Join-Path $startup "Ensure-DGX-SSH.lnk"
$wsh = New-Object -ComObject WScript.Shell
$link = $wsh.CreateShortcut($shortcut)
$link.TargetPath = "powershell.exe"
$link.Arguments = "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$ensure`""
$link.WorkingDirectory = $scriptDir
$link.Description = "Restore DGX-Local / DGX-Remote SSH + Cursor + NVIDIA Sync layout"
$link.Save()
Write-Host "  Startup shortcut: $shortcut" -ForegroundColor Green

# 2) Scheduled task at logon (backup if shortcut removed)
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$ensure`"" `
    -WorkingDirectory $scriptDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Keep DGX Spark SSH/Cursor/NVIDIA Sync two-host layout" | Out-Null
Write-Host "  Scheduled task: $taskName (At logon)" -ForegroundColor Green

# 3) Apply golden state now
& $ensure
Write-Host ""
Write-Host "Guard installed. Runs at every Windows sign-in and before npm run dev." -ForegroundColor Green
Write-Host ""
