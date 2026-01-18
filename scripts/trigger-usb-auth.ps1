# Script to trigger USB debugging authentication popup on Android device
# This script resets the ADB server connection to force the authentication popup to appear

Write-Host "Triggering USB Debugging Authentication Popup..." -ForegroundColor Cyan
Write-Host ""

# Check if ADB is available in PATH
$adbPath = Get-Command adb -ErrorAction SilentlyContinue

# If not in PATH, check common installation locations
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
            Write-Host "Found ADB at: $path" -ForegroundColor Green
            break
        }
    }
}

if (-not $adbPath) {
    Write-Host "ERROR: ADB (Android Debug Bridge) is not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install ADB:" -ForegroundColor Yellow
    Write-Host "1. Download Android SDK Platform Tools: https://developer.android.com/studio/releases/platform-tools" -ForegroundColor Yellow
    Write-Host "2. Or install via Android Studio SDK Manager" -ForegroundColor Yellow
    Write-Host "3. Add platform-tools directory to your PATH" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or run this command manually:" -ForegroundColor Cyan
    Write-Host "  adb kill-server" -ForegroundColor White
    Write-Host "  adb start-server" -ForegroundColor White
    Write-Host "  adb devices" -ForegroundColor White
    exit 1
}

# Get the full path to adb
$adbExe = if ($adbPath.Source) { $adbPath.Source } else { $adbPath.FullName }

Write-Host "SUCCESS: ADB found at: $adbExe" -ForegroundColor Green
Write-Host ""

# Step 1: Kill ADB server
Write-Host "Stopping ADB server..." -ForegroundColor Yellow
& $adbExe kill-server
if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: ADB server stopped" -ForegroundColor Green
} else {
    Write-Host "WARNING: ADB server may not have been running" -ForegroundColor Yellow
}
Write-Host ""

# Wait a moment
Start-Sleep -Seconds 1

# Step 2: Start ADB server
Write-Host "Starting ADB server..." -ForegroundColor Yellow
& $adbExe start-server
if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: ADB server started" -ForegroundColor Green
} else {
    Write-Host "ERROR: Failed to start ADB server" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Wait a moment for server to initialize
Start-Sleep -Seconds 2

# Step 3: List devices (this should trigger the authentication popup)
Write-Host "Checking for devices (this should trigger the authentication popup on your device)..." -ForegroundColor Yellow
Write-Host ""
$devicesOutput = & $adbExe devices
Write-Host $devicesOutput

Write-Host ""
Write-Host "Device Status:" -ForegroundColor Cyan

# Parse device output
$deviceLines = $devicesOutput -split "`n" | Where-Object { $_ -match "^\w" -and $_ -notmatch "List of devices" }
if ($deviceLines.Count -eq 0) {
    Write-Host "WARNING: No devices found. Make sure:" -ForegroundColor Yellow
    Write-Host "   1. Your device is connected via USB" -ForegroundColor Yellow
    Write-Host "   2. USB debugging is enabled on your device" -ForegroundColor Yellow
    Write-Host "   3. Check your device screen for the authentication popup" -ForegroundColor Yellow
} else {
    foreach ($line in $deviceLines) {
        if ($line -match "unauthorized") {
            Write-Host "   WARNING: Device found but UNAUTHORIZED" -ForegroundColor Yellow
            Write-Host "   Check your device screen - the authentication popup should appear!" -ForegroundColor Cyan
            Write-Host "   Tap 'Allow' and check 'Always allow from this computer'" -ForegroundColor Green
        } elseif ($line -match "device") {
            Write-Host "   SUCCESS: Device authorized and ready!" -ForegroundColor Green
        } elseif ($line -match "offline") {
            Write-Host "   WARNING: Device is OFFLINE" -ForegroundColor Yellow
            Write-Host "   Try: adb kill-server && adb start-server" -ForegroundColor Yellow
        } else {
            Write-Host "   INFO: $line" -ForegroundColor Gray
        }
    }
}

Write-Host ""
Write-Host "TIP: If the popup didn't appear, try:" -ForegroundColor Cyan
Write-Host "   1. Revoke USB debugging authorizations on your device" -ForegroundColor Yellow
Write-Host "   2. Disconnect and reconnect the USB cable" -ForegroundColor Yellow
Write-Host "   3. Run this script again" -ForegroundColor Yellow
Write-Host ""

