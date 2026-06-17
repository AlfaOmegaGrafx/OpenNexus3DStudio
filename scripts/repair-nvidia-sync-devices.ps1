# Remove junk aliases only; keep DGX Sparks local + DGX Sparks remote.
#   cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio
#   .\scripts\repair-nvidia-sync-devices.ps1

$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "dgx-device-map.ps1")

$nvsync = "$env:LOCALAPPDATA\Programs\nvidia-sync\resources\bin\nvsync-amd64.exe"
$ensure = Join-Path $PSScriptRoot "ensure-dgx-ssh-config.ps1"

Write-Host ""
Write-Host "=== NVIDIA Sync cleanup (two devices only) ===" -ForegroundColor Cyan
Write-Host "  $DgxDisplayLocal  ->  $DgxHostLocal" -ForegroundColor White
Write-Host "  $DgxDisplayRemote ->  $DgxHostRemote" -ForegroundColor White
Write-Host ""

Get-Process -Name "NVIDIA Sync" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

if (Test-Path $ensure) { & $ensure }

foreach ($alias in $DgxLegacyNvsyncAliases) {
    Write-Host "Removing junk: $alias" -ForegroundColor Gray
    & $nvsync delete $alias 2>&1 | Out-Null
}

if (Test-Path $ensure) { & $ensure }

Write-Host ""
Write-Host "Done. Restart NVIDIA Sync." -ForegroundColor Green
Write-Host "You should see ONLY $DgxDisplayLocal and $DgxDisplayRemote." -ForegroundColor Green
Write-Host "Do NOT click ADD under Available from SSH config file." -ForegroundColor Cyan
Write-Host ""
