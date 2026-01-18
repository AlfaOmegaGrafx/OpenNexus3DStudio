@echo off
REM Comprehensive script to reconnect Galaxy XR device for debugging
REM This script:
REM 1. Triggers USB debugging authentication
REM 2. Verifies device connection
REM 3. Opens Chrome DevTools for remote debugging

echo.
echo ========================================
echo   Galaxy XR Debugging Reconnection
echo ========================================
echo.

REM Step 1: Check if ADB is available
echo [1/4] Checking ADB availability...
where adb >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: ADB not found in PATH
    echo Please install Android SDK Platform Tools:
    echo Download: https://developer.android.com/studio/releases/platform-tools
    pause
    exit /b 1
)
echo SUCCESS: ADB found
echo.

REM Step 2: Reset ADB connection
echo [2/4] Resetting ADB connection...
echo   Stopping ADB server...
adb kill-server >nul 2>&1
timeout /t 1 /nobreak >nul

echo   Starting ADB server...
adb start-server >nul 2>&1
timeout /t 2 /nobreak >nul

echo SUCCESS: ADB server reset
echo.

REM Step 3: Check for devices
echo [3/4] Checking for connected devices...
echo   (This should trigger the USB debugging popup on your device)
echo.
adb devices
echo.

echo Device Status:
echo   - If you see "device" (not "unauthorized" or "offline"), your device is connected!
echo   - If you see "unauthorized", check your device screen for the popup
echo   - If no devices appear, make sure USB debugging is enabled
echo.

REM Step 4: Set up port forwarding for HTTP/HTTPS access
echo [4/5] Setting up port forwarding...
echo   Forwarding HTTPS port: localhost:3000 -> device:3000
adb forward tcp:3000 tcp:3000 >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   SUCCESS: HTTPS port forwarded
) else (
    echo   WARNING: HTTPS port forward failed (may already exist)
)

echo   Forwarding HTTP port: localhost:3001 -> device:3000
adb forward tcp:3001 tcp:3000 >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   SUCCESS: HTTP port forwarded
) else (
    echo   WARNING: HTTP port forward failed (may already exist)
)
echo.

REM Step 5: Open Chrome DevTools
echo [5/5] Opening Chrome DevTools for remote debugging...
echo.

REM Try to find Chrome
set CHROME_PATH=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
)

if defined CHROME_PATH (
    echo   Opening chrome://inspect/#devices...
    start "" "%CHROME_PATH%" "chrome://inspect/#devices"
    echo SUCCESS: Chrome DevTools opened
    echo.
    echo Next steps:
    echo   1. Wait for your device to appear in the 'Remote Target' section
    echo   2. Look for: 'OpenNexus3DStudio: SPACE-TIME EDITION' at https://localhost:3000/
    echo   3. Click the 'inspect' link next to the device
    echo   4. This will open DevTools connected to your Galaxy XR device
    echo.
    echo Access dev server from Galaxy XR:
    echo   HTTPS: https://localhost:3000/ (for WebXR/AR/VR)
    echo   HTTP:  http://localhost:3001/ (for debugging)
) else (
    echo WARNING: Chrome not found in standard locations
    echo   Please manually open: chrome://inspect/#devices
)

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Useful ADB commands:
echo   adb devices              - List connected devices
echo   adb shell                - Open device shell
echo   adb logcat               - View device logs
echo.
pause

