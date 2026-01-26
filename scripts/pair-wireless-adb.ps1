# Quick script to pair Android device with pairing code
# This is a simplified version for manual pairing

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ADB Wireless Pairing" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Find ADB
$adbPath = $null
$searchPaths = @(
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\adb.exe",
    "$env:ProgramFiles\Android\android-sdk\platform-tools\adb.exe",
    "$env:ProgramFiles(x86)\Android\android-sdk\platform-tools\adb.exe",
    "$env:ANDROID_HOME\platform-tools\adb.exe",
    "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe",
    "adb.exe"
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
    pause
    exit 1
}

Write-Host "Found ADB: $adbPath" -ForegroundColor Green
Write-Host ""

# Get pairing information
Write-Host "On your Android device:" -ForegroundColor Cyan
Write-Host "  1. Go to: Settings → Developer options → Wireless debugging" -ForegroundColor White
Write-Host "  2. Tap 'Pair device with pairing code'" -ForegroundColor White
Write-Host "  3. You'll see:" -ForegroundColor White
Write-Host "     - IP address and port (e.g., 192.168.1.100:12345)" -ForegroundColor Yellow
Write-Host "     - 6-digit pairing code (e.g., 123456)" -ForegroundColor Yellow
Write-Host ""

$pairingAddress = Read-Host "Enter IP Address and Port (e.g., 192.168.1.100:12345)"
$pairingCode = Read-Host "Enter 6-digit Pairing Code"

Write-Host ""
Write-Host "Pairing device..." -ForegroundColor Yellow

# Pair the device
if ($adbPath -eq "adb") {
    Write-Host "Running: adb pair $pairingAddress" -ForegroundColor Gray
    Write-Host "When prompted, enter the pairing code: $pairingCode" -ForegroundColor Yellow
    Write-Host ""
    
    # Start the pairing process
    $pairProcess = Start-Process -FilePath "adb" -ArgumentList "pair", $pairingAddress -NoNewWindow -PassThru -Wait
    
    # Note: ADB will prompt for the code interactively
    # The user needs to type it in the terminal
} else {
    Write-Host "Running: $adbPath pair $pairingAddress" -ForegroundColor Gray
    Write-Host "When prompted, enter the pairing code: $pairingCode" -ForegroundColor Yellow
    Write-Host ""
    
    # For full path, we need to run it differently
    & $adbPath pair $pairingAddress
}

Write-Host ""
Write-Host "If pairing was successful, you should see 'Successfully paired'" -ForegroundColor Green
Write-Host ""
Write-Host "Next step: Connect to the device" -ForegroundColor Cyan
Write-Host "  On your device, check 'Wireless debugging' settings" -ForegroundColor White
Write-Host "  You'll see a different IP:Port for connection (not the pairing one)" -ForegroundColor White
Write-Host ""
Write-Host "Then run:" -ForegroundColor Yellow
Write-Host "  adb connect <IP:PORT>" -ForegroundColor White
Write-Host ""
Write-Host "Or use the full setup script:" -ForegroundColor Yellow
Write-Host "  .\scripts\setup-wireless-adb.ps1" -ForegroundColor White
Write-Host ""
