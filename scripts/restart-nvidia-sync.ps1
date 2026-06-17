# Hard restart NVIDIA Sync when the UI is frozen / not responding.
# Run in PowerShell:  .\scripts\restart-nvidia-sync.ps1

$ErrorActionPreference = "Continue"
$syncExe = "$env:LOCALAPPDATA\Programs\nvidia-sync\NVIDIA Sync.exe"
$session = "$env:LOCALAPPDATA\NVIDIA Corporation\Sync\session"
$statePath = "$env:LOCALAPPDATA\NVIDIA Corporation\Sync\config\state-store.json"
$stateTemplate = Join-Path $PSScriptRoot "nvidia-sync-state-store.json"

Write-Host "Stopping NVIDIA Sync..." -ForegroundColor Yellow
taskkill /F /IM "NVIDIA Sync.exe" /T 2>$null | Out-Null
Start-Sleep -Seconds 3
taskkill /F /IM "NVIDIA Sync.exe" /T 2>$null | Out-Null
Start-Sleep -Seconds 2

Write-Host "Cleaning session files..." -ForegroundColor Yellow
if (Test-Path $session) {
    Get-ChildItem $session -Recurse -Include "*.pid", "*.socket", "*.err" -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue
}

if (Test-Path $stateTemplate) {
    Write-Host "Restoring clean NVIDIA Sync state store..." -ForegroundColor Yellow
    Copy-Item -Path $stateTemplate -Destination $statePath -Force
}

attrib -R "$env:USERPROFILE\.ssh\config" 2>$null | Out-Null

$remaining = @(Get-Process -Name "NVIDIA Sync" -ErrorAction SilentlyContinue).Count
if ($remaining -gt 0) {
    Write-Host "Still $remaining NVIDIA Sync process(es). Reboot Windows, then run this script again." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $syncExe)) {
    Write-Host "NVIDIA Sync not found at: $syncExe" -ForegroundColor Red
    exit 1
}

Write-Host "Starting NVIDIA Sync..." -ForegroundColor Green
Start-Process -FilePath $syncExe
Write-Host "Done. Click Connect on Sifr-s-DGX-Spark or dgx-spark manually." -ForegroundColor Green
