# Wireless ADB Setup Script for Android 11+
# This script helps you connect to your Android device wirelessly using ADB

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Android Wireless ADB Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Find ADB
Write-Host "[1/5] Finding ADB..." -ForegroundColor Yellow

$adbPath = $null
$searchPaths = @(
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\adb.exe",
    "$env:ProgramFiles\Android\android-sdk\platform-tools\adb.exe",
    "$env:ProgramFiles(x86)\Android\android-sdk\platform-tools\adb.exe",
    "$env:ANDROID_HOME\platform-tools\adb.exe",
    "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe",
    "adb.exe"  # If in PATH
)

foreach ($path in $searchPaths) {
    if ($path -eq "adb.exe") {
        $adbCheck = Get-Command adb -ErrorAction SilentlyContinue
        if ($adbCheck) {
            $adbPath = "adb"
            break
        }
    } elseif (Test-Path $path) {
        $adbPath = $path
        break
    }
}

if (-not $adbPath) {
    Write-Host "ERROR: ADB not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Android SDK Platform Tools:" -ForegroundColor Yellow
    Write-Host "  Download: https://developer.android.com/studio/releases/platform-tools" -ForegroundColor White
    Write-Host ""
    Write-Host "Or run: .\scripts\find-or-install-adb.ps1" -ForegroundColor Cyan
    Write-Host ""
    pause
    exit 1
}

Write-Host "SUCCESS: Found ADB" -ForegroundColor Green
Write-Host ""

# Step 2: Instructions
Write-Host "[2/5] Setup Instructions" -ForegroundColor Yellow
Write-Host ""
Write-Host "On your Android device (Android 11+):" -ForegroundColor Cyan
Write-Host "  1. Go to: Settings → Developer options" -ForegroundColor White
Write-Host "  2. Enable 'Wireless debugging'" -ForegroundColor White
Write-Host "  3. Tap 'Wireless debugging'" -ForegroundColor White
Write-Host "  4. Choose ONE of these methods:" -ForegroundColor White
Write-Host ""
Write-Host "     Method A - QR Code (if your extension shows one):" -ForegroundColor Yellow
Write-Host "       - Tap 'Pair device with pairing code'" -ForegroundColor White
Write-Host "       - Scan the QR code with your extension" -ForegroundColor White
Write-Host ""
Write-Host "     Method B - Manual Pairing:" -ForegroundColor Yellow
Write-Host "       - Tap 'Pair device with pairing code'" -ForegroundColor White
Write-Host "       - Note the IP address and port (e.g., 192.168.1.100:12345)" -ForegroundColor White
Write-Host "       - Note the 6-digit pairing code" -ForegroundColor White
Write-Host ""
Write-Host "Press any key when you're ready to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Write-Host ""

# Step 3: Pairing
Write-Host "[3/5] Device Pairing" -ForegroundColor Yellow
Write-Host ""
Write-Host "Choose pairing method:" -ForegroundColor Cyan
Write-Host "  1. QR Code (via extension)" -ForegroundColor White
Write-Host "  2. Manual pairing (IP:Port + Code)" -ForegroundColor White
Write-Host ""
$pairingMethod = Read-Host "Enter choice (1 or 2)"

if ($pairingMethod -eq "2") {
    Write-Host ""
    Write-Host "Enter the pairing information from your device:" -ForegroundColor Cyan
    $pairingAddress = Read-Host "IP Address and Port (e.g., 192.168.1.100:12345)"
    $pairingCode = Read-Host "6-digit Pairing Code"
    
    Write-Host ""
    Write-Host "Pairing device..." -ForegroundColor Yellow
    if ($adbPath -eq "adb") {
        $pairResult = adb pair $pairingAddress 2>&1
    } else {
        $pairResult = & $adbPath pair $pairingAddress 2>&1
    }
    
    # Check if pairing code prompt appears
    if ($pairResult -match "Enter pairing code") {
        Write-Host "Entering pairing code..." -ForegroundColor Yellow
        if ($adbPath -eq "adb") {
            $pairResult = echo $pairingCode | adb pair $pairingAddress 2>&1
        } else {
            $pairResult = echo $pairingCode | & $adbPath pair $pairingAddress 2>&1
        }
    }
    
    Write-Host $pairResult
    Write-Host ""
}

Write-Host "If you used QR code, the pairing should be complete." -ForegroundColor Green
Write-Host "Press any key to continue to connection..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Write-Host ""

# Step 4: Connect
Write-Host "[4/5] Connecting to device..." -ForegroundColor Yellow
Write-Host ""
Write-Host "On your device, check 'Wireless debugging' settings." -ForegroundColor Cyan
Write-Host "You should see an IP address and port (e.g., 192.168.1.100:XXXXX)" -ForegroundColor White
Write-Host ""
$connectAddress = Read-Host "Enter IP Address and Port for connection (e.g., 192.168.1.100:XXXXX)"

Write-Host ""
Write-Host "Connecting..." -ForegroundColor Yellow
if ($adbPath -eq "adb") {
    $connectResult = adb connect $connectAddress 2>&1
} else {
    $connectResult = & $adbPath connect $connectAddress 2>&1
}

Write-Host $connectResult
Write-Host ""

# Step 5: Verify and Setup Port Forwarding
Write-Host "[5/5] Verifying connection and setting up port forwarding..." -ForegroundColor Yellow
Write-Host ""

if ($adbPath -eq "adb") {
    $devices = adb devices
} else {
    $devices = & $adbPath devices
}

Write-Host $devices
Write-Host ""

# Check if device is connected
if ($devices -match "device$" -and $devices -notmatch "unauthorized") {
    Write-Host "SUCCESS: Device connected wirelessly!" -ForegroundColor Green
    Write-Host ""
    
    # Setup port forwarding
    Write-Host "Setting up port forwarding..." -ForegroundColor Yellow
    if ($adbPath -eq "adb") {
        adb forward tcp:3000 tcp:3000 2>&1 | Out-Null
        adb forward tcp:3001 tcp:3000 2>&1 | Out-Null
        $forwardList = adb forward --list
    } else {
        & $adbPath forward tcp:3000 tcp:3000 2>&1 | Out-Null
        & $adbPath forward tcp:3001 tcp:3000 2>&1 | Out-Null
        $forwardList = & $adbPath forward --list
    }
    
    Write-Host "Port forwarding configured:" -ForegroundColor Green
    Write-Host $forwardList
    Write-Host ""
    Write-Host "You can now access your dev server from the device:" -ForegroundColor Cyan
    Write-Host "  - HTTPS: https://localhost:3000/" -ForegroundColor White
    Write-Host "  - HTTP:  http://localhost:3001/" -ForegroundColor White
} else {
    Write-Host "WARNING: Device not connected or unauthorized" -ForegroundColor Yellow
    Write-Host "Please check:" -ForegroundColor Yellow
    Write-Host "  1. Device is on the same Wi-Fi network" -ForegroundColor White
    Write-Host "  2. Wireless debugging is enabled on device" -ForegroundColor White
    Write-Host "  3. Pairing was successful" -ForegroundColor White
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
