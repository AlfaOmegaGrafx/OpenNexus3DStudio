@echo off
REM Manual port forwarding setup script
REM Use this if ADB is not in PATH or you want to specify ADB location

echo.
echo ========================================
echo   HTTP/HTTPS Port Forwarding Setup
echo   (Manual ADB Path)
echo ========================================
echo.

REM Check for ADB in common locations
set ADB_PATH=
if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
    set ADB_PATH=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe
) else if exist "%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
    set ADB_PATH=%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe
) else if exist "C:\platform-tools\adb.exe" (
    set ADB_PATH=C:\platform-tools\adb.exe
) else if exist "%ProgramFiles%\Android\android-sdk\platform-tools\adb.exe" (
    set ADB_PATH=%ProgramFiles%\Android\android-sdk\platform-tools\adb.exe
)

if defined ADB_PATH (
    echo Found ADB at: %ADB_PATH%
    echo.
) else (
    echo ADB not found in common locations.
    echo.
    echo Please provide the full path to adb.exe:
    echo   Example: C:\platform-tools\adb.exe
    echo   Example: %USERPROFILE%\Downloads\platform-tools\adb.exe
    echo.
    set /p ADB_PATH="Enter ADB path (or press Enter to skip): "
    if "%ADB_PATH%"=="" (
        echo.
        echo ADB path not provided. Please install Android SDK Platform Tools:
        echo Download: https://developer.android.com/studio/releases/platform-tools
        echo.
        echo After installation, either:
        echo   1. Add platform-tools to your PATH, OR
        echo   2. Run this script again and provide the full path to adb.exe
        pause
        exit /b 1
    )
    if not exist "%ADB_PATH%" (
        echo ERROR: ADB not found at: %ADB_PATH%
        pause
        exit /b 1
    )
)

echo [1/3] Checking for connected devices...
"%ADB_PATH%" devices
echo.

REM Check if any device is connected
"%ADB_PATH%" devices | findstr /C:"device" >nul 2>&1
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

echo [2/3] Removing existing port forwards...
"%ADB_PATH%" forward --remove-all >nul 2>&1
echo.

echo [3/3] Setting up port forwarding...
echo.

REM Forward HTTPS port (3000 -> 3000)
echo   Forwarding HTTPS port: localhost:3000 -^> device:3000
"%ADB_PATH%" forward tcp:3000 tcp:3000
if %ERRORLEVEL% EQU 0 (
    echo   SUCCESS: HTTPS port forwarded
) else (
    echo   WARNING: HTTPS port forward failed
)

REM Forward HTTP port (3001 -> 3000) for non-secure access
echo   Forwarding HTTP port: localhost:3001 -^> device:3000
"%ADB_PATH%" forward tcp:3001 tcp:3000
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
echo   "%ADB_PATH%" forward --list
echo.
pause





