# Comprehensive script to reconnect Galaxy XR device for debugging
# This script:
# 1. Triggers USB debugging authentication
# 2. Verifies device connection
# 3. Opens Chrome DevTools for remote debugging
# 4. Provides instructions for chrome://inspect setup

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Galaxy XR Debugging Reconnection" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if ADB is available
Write-Host "[1/4] Checking ADB availability..." -ForegroundColor Yellow
$adbPath = Get-Command adb -ErrorAction SilentlyContinue

if (-not $adbPath) {
    $commonPaths = @(
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
        "$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\adb.exe",
        "$env:ProgramFiles\Android\android-sdk\platform-tools\adb.exe",
        "$env:ProgramFiles(x86)\Android\android-sdk\platform-tools\adb.exe"
    )
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            $adbPath = Get-Item $path
            $env:Path += ";$(Split-Path $path -Parent)"
            Write-Host "Found ADB at: $path" -ForegroundColor Green
            break
        }
    }
}

if (-not $adbPath) {
    Write-Host "ERROR: ADB not found. Please install Android SDK Platform Tools." -ForegroundColor Red
    Write-Host "Download: https://developer.android.com/studio/releases/platform-tools" -ForegroundColor Yellow
    exit 1
}

$adbExe = if ($adbPath.Source) { $adbPath.Source } else { $adbPath.FullName }
Write-Host "SUCCESS: ADB found" -ForegroundColor Green
Write-Host ""

# Step 2: Reset ADB connection
Write-Host "[2/4] Resetting ADB connection..." -ForegroundColor Yellow
Write-Host "  Stopping ADB server..." -ForegroundColor Gray
& $adbExe kill-server 2>&1 | Out-Null
Start-Sleep -Seconds 1

Write-Host "  Starting ADB server..." -ForegroundColor Gray
& $adbExe start-server 2>&1 | Out-Null
Start-Sleep -Seconds 2

Write-Host "SUCCESS: ADB server reset" -ForegroundColor Green
Write-Host ""

# Step 3: Check for devices
Write-Host "[3/4] Checking for connected devices..." -ForegroundColor Yellow
Write-Host "  (This should trigger the USB debugging popup on your device)" -ForegroundColor Gray
Write-Host ""

$devicesOutput = & $adbExe devices
Write-Host $devicesOutput

$deviceLines = $devicesOutput -split "`n" | Where-Object { $_ -match "^\w" -and $_ -notmatch "List of devices" }
$authorizedDevices = $deviceLines | Where-Object { $_ -match "\s+device\s*$" }
$unauthorizedDevices = $deviceLines | Where-Object { $_ -match "\s+unauthorized\s*$" }
$offlineDevices = $deviceLines | Where-Object { $_ -match "\s+offline\s*$" }

if ($authorizedDevices.Count -gt 0) {
    Write-Host ""
    Write-Host "SUCCESS: Device(s) connected and authorized!" -ForegroundColor Green
    foreach ($device in $authorizedDevices) {
        $deviceId = ($device -split "\s+")[0]
        Write-Host "  Device ID: $deviceId" -ForegroundColor Green
    }
} elseif ($unauthorizedDevices.Count -gt 0) {
    Write-Host ""
    Write-Host "WARNING: Device(s) detected but not authorized" -ForegroundColor Yellow
    Write-Host "  Please check your device screen for the 'Allow USB debugging' popup" -ForegroundColor Yellow
    Write-Host "  Tap 'Allow' or 'OK' on the popup" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  If popup doesn't appear:" -ForegroundColor Cyan
    Write-Host "    1. On device: Settings → Developer options → Revoke USB debugging authorizations" -ForegroundColor White
    Write-Host "    2. Disconnect and reconnect USB cable" -ForegroundColor White
    Write-Host "    3. Run this script again" -ForegroundColor White
} elseif ($offlineDevices.Count -gt 0) {
    Write-Host ""
    Write-Host "WARNING: Device(s) detected but offline" -ForegroundColor Yellow
    Write-Host "  Try: adb kill-server && adb start-server" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "WARNING: No devices detected" -ForegroundColor Yellow
    Write-Host "  Make sure:" -ForegroundColor Cyan
    Write-Host "    1. USB cable is connected" -ForegroundColor White
    Write-Host "    2. USB debugging is enabled on device" -ForegroundColor White
    Write-Host "    3. USB connection mode is set to 'File Transfer' or 'MTP'" -ForegroundColor White
    Write-Host "    4. Check device screen for USB debugging popup" -ForegroundColor White
}

Write-Host ""

# Step 4: Open Chrome DevTools
Write-Host "[4/4] Opening Chrome DevTools for remote debugging..." -ForegroundColor Yellow
Write-Host ""

# Try to find Chrome
$chromePaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
)

$chromeExe = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromeExe = $path
        break
    }
}

if ($chromeExe) {
    Write-Host "  Opening chrome://inspect/#devices..." -ForegroundColor Gray
    Start-Process $chromeExe -ArgumentList "chrome://inspect/#devices"
    Write-Host "SUCCESS: Chrome DevTools opened" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Wait for your device to appear in the 'Remote Target' section" -ForegroundColor White
    Write-Host "  2. Look for: 'OpenNexus3DStudio: SPACE-TIME EDITION' at https://10.0.0.32:3002/" -ForegroundColor White
    Write-Host "  3. Click the 'inspect' link next to the device" -ForegroundColor White
    Write-Host "  4. This will open DevTools connected to your Galaxy XR device" -ForegroundColor White
} else {
    Write-Host "WARNING: Chrome not found in standard locations" -ForegroundColor Yellow
    Write-Host "  Please manually open: chrome://inspect/#devices" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Additional helpful commands
Write-Host "Useful ADB commands:" -ForegroundColor Cyan
Write-Host "  adb devices              - List connected devices" -ForegroundColor Gray
Write-Host "  adb shell                - Open device shell" -ForegroundColor Gray
Write-Host "  adb logcat               - View device logs" -ForegroundColor Gray
Write-Host "  adb forward tcp:9222 tcp:9222  - Forward Chrome DevTools port" -ForegroundColor Gray
Write-Host ""

# Wait for user input
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")







