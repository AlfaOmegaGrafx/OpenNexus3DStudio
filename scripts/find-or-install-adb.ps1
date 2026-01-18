# Helper script to find or guide installation of ADB

Write-Host "Searching for ADB (Android Debug Bridge)..." -ForegroundColor Cyan
Write-Host ""

# Check common installation locations
$searchPaths = @(
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\adb.exe",
    "$env:ProgramFiles\Android\android-sdk\platform-tools\adb.exe",
    "$env:ProgramFiles(x86)\Android\android-sdk\platform-tools\adb.exe",
    "$env:ANDROID_HOME\platform-tools\adb.exe",
    "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe"
)

$foundAdb = $null
foreach ($path in $searchPaths) {
    if (Test-Path $path) {
        $foundAdb = $path
        Write-Host "SUCCESS: Found ADB at:" -ForegroundColor Green
        Write-Host "  $path" -ForegroundColor White
        Write-Host ""
        Write-Host "To use it, add to PATH or run directly:" -ForegroundColor Yellow
        Write-Host "  & `"$path`" devices" -ForegroundColor Cyan
        break
    }
}

if (-not $foundAdb) {
    Write-Host "ADB not found in common locations." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Installation Options:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Option 1: Download Platform Tools (Recommended)" -ForegroundColor Yellow
    Write-Host "  1. Download: https://developer.android.com/studio/releases/platform-tools" -ForegroundColor White
    Write-Host "  2. Extract to a folder (e.g., C:\platform-tools)" -ForegroundColor White
    Write-Host "  3. Add to PATH or use full path to adb.exe" -ForegroundColor White
    Write-Host ""
    Write-Host "Option 2: Install via Android Studio" -ForegroundColor Yellow
    Write-Host "  1. Install Android Studio" -ForegroundColor White
    Write-Host "  2. Open SDK Manager" -ForegroundColor White
    Write-Host "  3. Install 'Android SDK Platform-Tools'" -ForegroundColor White
    Write-Host "  4. Usually installs to: %LOCALAPPDATA%\Android\Sdk\platform-tools" -ForegroundColor White
    Write-Host ""
    Write-Host "Option 3: Use Chocolatey (if installed)" -ForegroundColor Yellow
    Write-Host "  choco install adb" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "After installation, run the reconnection script again." -ForegroundColor Green
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")







