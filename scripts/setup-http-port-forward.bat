@echo off
REM Script to set up HTTP/HTTPS port forwarding for Galaxy XR device
REM This forwards the local dev server to the device via ADB

echo.
echo ========================================
echo   HTTP/HTTPS Port Forwarding Setup
echo ========================================
echo.

REM Step 1: Check if ADB is available
echo [1/3] Checking ADB availability...
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

REM Step 2: Check for connected devices
echo [2/3] Checking for connected devices...
adb devices
echo.

REM Check if any device is connected
adb devices | findstr /C:"device" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: No authorized device found
    echo Please:
    echo   1. Connect your Galaxy XR via USB
    echo   2. Enable USB debugging on the device
    echo   3. Accept the USB debugging prompt on the device
    echo   4. Run this script again
    pause
    exit /b 1
)

REM Step 3: Set up port forwarding
echo [3/3] Setting up port forwarding...
echo.

REM Remove existing port forwards (if any)
echo   Removing existing port forwards...
adb forward --remove-all >nul 2>&1

REM Forward HTTPS port (3000 -> 3000)
echo   Forwarding HTTPS port: localhost:3000 -> device:3000
adb forward tcp:3000 tcp:3000
if %ERRORLEVEL% EQU 0 (
    echo   SUCCESS: HTTPS port forwarded
) else (
    echo   WARNING: HTTPS port forward failed
)

REM Forward HTTP port (3001 -> 3000) for non-secure access
echo   Forwarding HTTP port: localhost:3001 -> device:3000
adb forward tcp:3001 tcp:3000
if %ERRORLEVEL% EQU 0 (
    echo   SUCCESS: HTTP port forwarded
) else (
    echo   WARNING: HTTP port forward failed
)

echo.
echo ========================================
echo   Port Forwarding Complete!
echo ========================================
echo.
echo Access your dev server from Galaxy XR:
echo   HTTPS: https://localhost:3000/
echo   HTTP:  http://localhost:3001/
echo.
echo Note: WebXR requires HTTPS, so use port 3000 for AR/VR features
echo.
echo To verify port forwarding:
echo   adb forward --list
echo.
echo To remove port forwarding:
echo   adb forward --remove-all
echo.
pause





