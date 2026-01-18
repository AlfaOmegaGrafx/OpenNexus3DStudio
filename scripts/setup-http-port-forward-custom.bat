@echo off
REM Custom port forwarding setup using specific ADB path
REM ADB Path: C:\Users\alfao\Desktop\platform-tools\adb.exe

set ADB_PATH=C:\Users\alfao\Desktop\platform-tools\adb.exe

echo.
echo ========================================
echo   HTTP/HTTPS Port Forwarding Setup
echo   (Custom ADB Path)
echo ========================================
echo.

REM Check if ADB exists
if not exist "%ADB_PATH%" (
    echo ERROR: ADB not found at: %ADB_PATH%
    echo Please update the ADB_PATH in this script.
    pause
    exit /b 1
)

echo Using ADB at: %ADB_PATH%
echo.

REM Step 1: Reset ADB connection
echo [1/4] Resetting ADB connection...
echo   Stopping ADB server...
"%ADB_PATH%" kill-server >nul 2>&1
timeout /t 2 /nobreak >nul

echo   Starting ADB server...
"%ADB_PATH%" start-server >nul 2>&1
timeout /t 2 /nobreak >nul
echo SUCCESS: ADB server reset
echo.

REM Step 2: Check for devices
echo [2/4] Checking for connected devices...
echo   (This should trigger the USB debugging popup on your device)
echo.
"%ADB_PATH%" devices
echo.

REM Check device status
"%ADB_PATH%" devices | findstr /C:"device" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo SUCCESS: Device is authorized!
    set DEVICE_AUTHORIZED=1
) else (
    echo WARNING: Device is not authorized yet
    echo.
    echo Please check your Galaxy XR device screen for:
    echo   - "Allow USB debugging?" popup
    echo   - Tap "Allow" or "OK"
    echo   - Optionally check "Always allow from this computer"
    echo.
    echo If no popup appears, try:
    echo   1. Disconnect and reconnect USB cable
    echo   2. On device: Settings ^> Developer options ^> Revoke USB debugging authorizations
    echo   3. Disconnect USB, wait 5 seconds, reconnect USB
    echo   4. Run this script again
    echo.
    set DEVICE_AUTHORIZED=0
)

echo.
echo [3/4] Removing existing port forwards...
"%ADB_PATH%" forward --remove-all >nul 2>&1
echo.

REM Step 3: Set up port forwarding (only if device is authorized)
if "%DEVICE_AUTHORIZED%"=="1" (
    echo [4/4] Setting up port forwarding...
    echo.
    
    REM Forward HTTPS port (3000 -> 3000)
    echo   Forwarding HTTPS port: localhost:3000 -^> device:3000
    "%ADB_PATH%" forward tcp:3000 tcp:3000
    if %ERRORLEVEL% EQU 0 (
        echo   SUCCESS: HTTPS port forwarded
    ) else (
        echo   ERROR: HTTPS port forward failed
    )
    
    REM Forward HTTP port (3001 -> 3000) for non-secure access
    echo   Forwarding HTTP port: localhost:3001 -^> device:3000
    "%ADB_PATH%" forward tcp:3001 tcp:3000
    if %ERRORLEVEL% EQU 0 (
        echo   SUCCESS: HTTP port forwarded
    ) else (
        echo   ERROR: HTTP port forward failed
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
    echo   "%ADB_PATH%" forward --list
    echo.
) else (
    echo [4/4] Skipping port forwarding (device not authorized)
    echo.
    echo Please authorize the device first, then run this script again.
    echo.
)

pause





