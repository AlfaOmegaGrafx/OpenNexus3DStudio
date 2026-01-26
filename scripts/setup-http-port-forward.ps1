# PowerShell script to set up HTTP/HTTPS port forwarding for Galaxy XR device
# This forwards the local dev server to the device via ADB

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  HTTP/HTTPS Port Forwarding Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if ADB is available
Write-Host "[1/3] Checking ADB availability..." -ForegroundColor Yellow
$adbPath = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbPath) {
    Write-Host "ERROR: ADB not found in PATH" -ForegroundColor Red
    Write-Host "Please install Android SDK Platform Tools:" -ForegroundColor Yellow
    Write-Host "Download: https://developer.android.com/studio/releases/platform-tools" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "SUCCESS: ADB found at $($adbPath.Source)" -ForegroundColor Green
Write-Host ""

# Step 2: Check for connected devices
Write-Host "[2/3] Checking for connected devices..." -ForegroundColor Yellow
$devicesOutput = adb devices
Write-Host $devicesOutput

# Check if any device is connected and authorized
$authorizedDevice = $devicesOutput | Select-String -Pattern "device$"
if (-not $authorizedDevice) {
    Write-Host ""
    Write-Host "WARNING: No authorized device found" -ForegroundColor Red
    Write-Host "Please:" -ForegroundColor Yellow
    Write-Host "  1. Connect your Galaxy XR via USB" -ForegroundColor Yellow
    Write-Host "  2. Enable USB debugging on the device" -ForegroundColor Yellow
    Write-Host "  3. Accept the USB debugging prompt on the device" -ForegroundColor Yellow
    Write-Host "  4. Run this script again" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Step 3: Set up port forwarding
Write-Host ""
Write-Host "[3/3] Setting up port forwarding..." -ForegroundColor Yellow
Write-Host ""

# Remove existing port forwards (if any)
Write-Host "  Removing existing port forwards..." -ForegroundColor Gray
adb forward --remove-all | Out-Null

# Forward HTTPS port (3000 -> 3000)
Write-Host "  Forwarding HTTPS port: localhost:3000 -> device:3000" -ForegroundColor Gray
$httpsResult = adb forward tcp:3000 tcp:3000 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  SUCCESS: HTTPS port forwarded" -ForegroundColor Green
} else {
    Write-Host "  WARNING: HTTPS port forward failed: $httpsResult" -ForegroundColor Yellow
}

# Forward HTTP port (3001 -> 3000) for non-secure access
Write-Host "  Forwarding HTTP port: localhost:3001 -> device:3000" -ForegroundColor Gray
$httpResult = adb forward tcp:3001 tcp:3000 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  SUCCESS: HTTP port forwarded" -ForegroundColor Green
} else {
    Write-Host "  WARNING: HTTP port forward failed: $httpResult" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Port Forwarding Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access your dev server from Galaxy XR:" -ForegroundColor Green
Write-Host "  HTTPS: https://localhost:3000/" -ForegroundColor Cyan
Write-Host "  HTTP:  http://localhost:3001/" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: WebXR requires HTTPS, so use port 3000 for AR/VR features" -ForegroundColor Yellow
Write-Host ""
Write-Host "To verify port forwarding:" -ForegroundColor Gray
Write-Host "  adb forward --list" -ForegroundColor White
Write-Host ""
Write-Host "To remove port forwarding:" -ForegroundColor Gray
Write-Host "  adb forward --remove-all" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"





