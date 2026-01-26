@echo off
REM All-in-one startup script for Galaxy XR development
REM This script:
REM 1. Sets up ADB port forwarding
REM 2. Starts the development server
REM 3. Opens Chrome DevTools for remote debugging

set ADB_PATH=C:\Users\alfao\Desktop\platform-tools\adb.exe

echo.
echo ========================================
echo   Galaxy XR Development Startup
echo ========================================
echo.

REM Step 1: Check ADB
if not exist "%ADB_PATH%" (
    echo ERROR: ADB not found at: %ADB_PATH%
    echo Please update ADB_PATH in this script.
    pause
    exit /b 1
)

REM Step 2: Reset and check ADB connection
echo [1/3] Setting up ADB connection...
"%ADB_PATH%" kill-server >nul 2>&1
timeout /t 1 /nobreak >nul
"%ADB_PATH%" start-server >nul 2>&1
timeout /t 2 /nobreak >nul

echo   Checking for devices...
"%ADB_PATH%" devices
echo.

REM Check if device is authorized
"%ADB_PATH%" devices | findstr /C:"device" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Device not authorized or not connected
    echo Please:
    echo   1. Check device screen for "Allow USB debugging?" prompt
    echo   2. Tap "Allow" on the device
    echo   3. Run this script again
    echo.
    pause
    exit /b 1
)

REM Step 3: Set up port forwarding
echo [2/3] Setting up port forwarding...
"%ADB_PATH%" forward --remove-all >nul 2>&1
"%ADB_PATH%" forward tcp:3000 tcp:3000
set FORWARD1_ERROR=%ERRORLEVEL%
"%ADB_PATH%" forward tcp:3001 tcp:3000
set FORWARD2_ERROR=%ERRORLEVEL%

if %FORWARD1_ERROR% EQU 0 (
    if %FORWARD2_ERROR% EQU 0 (
        echo   SUCCESS: Port forwarding configured
        echo   - HTTPS: https://localhost:3000/
        echo   - HTTP:  http://localhost:3001/
    ) else (
        echo   PARTIAL: HTTPS port forwarded, HTTP port failed
        echo   - HTTPS: https://localhost:3000/
    )
) else (
    echo   WARNING: Port forwarding failed - device may not be authorized
    echo   Please check device screen for USB debugging prompt
)
echo.

REM Step 4: Start development server
echo [3/3] Starting development server...
echo.
echo   Server will start in a new window...
echo   Access from Galaxy XR: https://localhost:3000/
echo.
echo   Press Ctrl+C in the server window to stop
echo.

REM Start dev server and API server in new windows
start "Character Studio Dev Server" cmd /k "npm run dev"
timeout /t 2 /nobreak >nul
start "Character Studio API Server" cmd /k "npm run mock-api"

REM Wait a moment for server to start
timeout /t 3 /nobreak >nul

REM Optional: Open Chrome DevTools
echo Opening Chrome DevTools for remote debugging...
set "CHROME_PATH="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
)
if not defined CHROME_PATH (
    if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
        set "CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    )
)
if not defined CHROME_PATH (
    if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
        set "CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
    )
)

if defined CHROME_PATH (
    start "" "%CHROME_PATH%" "chrome://inspect/#devices"
    echo   Chrome DevTools opened
) else (
    echo   Chrome not found - manually open: chrome://inspect/#devices
)

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Next steps:
echo   1. Wait for dev server and API server to start (check windows)
echo   2. On Galaxy XR: Open Chrome
echo   3. Navigate to: https://localhost:3000/
echo   4. Accept certificate warning if prompted
echo.
echo Servers running:
echo   - Dev server: https://localhost:3000/
echo   - API server: http://localhost:7842/
echo.
echo To stop: Close the server windows
echo.
pause

