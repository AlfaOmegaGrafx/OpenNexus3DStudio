@echo off
REM Restore Studio UI chrome from backups\ui-chrome-good-state
REM Prefer Git Bash / WSL bash if present; else PowerShell copy.

set ROOT=%~dp0..
cd /d "%ROOT%"

where bash >nul 2>&1
if %ERRORLEVEL%==0 (
  bash scripts/restore-ui-chrome.sh %*
  exit /b %ERRORLEVEL%
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore-ui-chrome.ps1" %*
exit /b %ERRORLEVEL%
