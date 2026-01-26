@echo off
REM Script to trigger USB debugging authentication popup on Android device
REM This script resets the ADB server connection to force the authentication popup to appear

echo.
echo [33m🔄 Triggering USB Debugging Authentication Popup...[0m
echo.

REM Check if ADB is available
where adb >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [31m❌ ADB (Android Debug Bridge) is not found in PATH[0m
    echo.
    echo [33mPlease install ADB:[0m
    echo 1. Download Android SDK Platform Tools: https://developer.android.com/studio/releases/platform-tools
    echo 2. Or install via Android Studio SDK Manager
    echo 3. Add platform-tools directory to your PATH
    pause
    exit /b 1
)

echo [32m✅ ADB found[0m
echo.

REM Step 1: Kill ADB server
echo [33m🛑 Stopping ADB server...[0m
adb kill-server
if %ERRORLEVEL% EQU 0 (
    echo [32m✅ ADB server stopped[0m
) else (
    echo [33m⚠️  ADB server may not have been running[0m
)
echo.

REM Wait a moment
timeout /t 1 /nobreak >nul

REM Step 2: Start ADB server
echo [33m🚀 Starting ADB server...[0m
adb start-server
if %ERRORLEVEL% NEQ 0 (
    echo [31m❌ Failed to start ADB server[0m
    pause
    exit /b 1
)
echo [32m✅ ADB server started[0m
echo.

REM Wait a moment for server to initialize
timeout /t 2 /nobreak >nul

REM Step 3: List devices (this should trigger the authentication popup)
echo [33m📱 Checking for devices (this should trigger the authentication popup on your device)...[0m
echo.
adb devices
echo.

echo [36m📋 Device Status:[0m
echo.
echo [33m💡 If the popup didn't appear, try:[0m
echo    1. Revoke USB debugging authorizations on your device
echo    2. Disconnect and reconnect the USB cable
echo    3. Run this script again
echo.
pause







