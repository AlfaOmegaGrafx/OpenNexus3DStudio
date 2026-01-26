# Add ADB to PATH for current session
# This helps extensions find ADB even if it's not in system PATH

$adbDir = "C:\Users\alfao\Desktop\Android Developer Bridge platform-tools"

# Add to current session PATH
$env:Path += ";$adbDir"

Write-Host "✅ Added ADB directory to PATH for this session" -ForegroundColor Green
Write-Host "ADB Directory: $adbDir" -ForegroundColor Cyan

# Test ADB
Write-Host "`nTesting ADB..." -ForegroundColor Yellow
& "$adbDir\adb.exe" --version

Write-Host "`n✅ ADB is now available in this terminal session" -ForegroundColor Green
Write-Host "Note: This only affects the current terminal. To make it permanent, add it to System Environment Variables." -ForegroundColor Yellow
