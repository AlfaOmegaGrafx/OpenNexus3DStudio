# Add ADB to System PATH (Permanent)
# This requires Administrator privileges

$adbDir = "C:\Users\alfao\Desktop\Android Developer Bridge platform-tools"

Write-Host "Adding ADB to System PATH..." -ForegroundColor Cyan
Write-Host "ADB Directory: $adbDir" -ForegroundColor Yellow
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  This script requires Administrator privileges!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run PowerShell as Administrator, then run this script again." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To run as Administrator:" -ForegroundColor Cyan
    Write-Host "1. Right-click PowerShell" -ForegroundColor White
    Write-Host "2. Select 'Run as Administrator'" -ForegroundColor White
    Write-Host "3. Navigate to this directory" -ForegroundColor White
    Write-Host "4. Run: .\scripts\add-adb-to-system-path.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "OR use the manual method below:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Manual Method:" -ForegroundColor Cyan
    Write-Host "1. Press Win + R" -ForegroundColor White
    Write-Host "2. Type: sysdm.cpl" -ForegroundColor White
    Write-Host "3. Click 'Environment Variables'" -ForegroundColor White
    Write-Host "4. Under 'User variables', find 'Path'" -ForegroundColor White
    Write-Host "5. Click 'Edit'" -ForegroundColor White
    Write-Host "6. Click 'New'" -ForegroundColor White
    Write-Host "7. Add: $adbDir" -ForegroundColor White
    Write-Host "8. Click 'OK' on all dialogs" -ForegroundColor White
    Write-Host "9. Restart Cursor completely" -ForegroundColor White
    exit 1
}

# Get current PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

# Check if already in PATH
if ($currentPath -like "*$adbDir*") {
    Write-Host "✅ ADB directory is already in PATH!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Current PATH includes:" -ForegroundColor Cyan
    $currentPath -split ';' | Where-Object { $_ -like "*Android*" -or $_ -like "*platform-tools*" } | ForEach-Object {
        Write-Host "  $_" -ForegroundColor White
    }
    exit 0
}

# Add to PATH
$newPath = $currentPath + ";$adbDir"
[Environment]::SetEnvironmentVariable("Path", $newPath, "User")

Write-Host "✅ Successfully added ADB to PATH!" -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  IMPORTANT: You must restart Cursor completely for this to take effect!" -ForegroundColor Yellow
Write-Host ""
Write-Host "After restarting Cursor, test with:" -ForegroundColor Cyan
Write-Host "  adb --version" -ForegroundColor White
