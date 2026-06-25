$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ViteCache = Join-Path $Repo 'node_modules\.vite'
$LogsDir = Join-Path $Repo 'logs'
$LogFile = Join-Path $LogsDir 'vite-dev.log'

Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'vite\\bin\\vite\.js' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if (Test-Path $ViteCache) { Remove-Item -Recurse -Force $ViteCache }
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null }

$cmd = "cmd.exe /c cd /d `"$Repo`" && set VITE_USE_POLLING=1&& node node_modules\vite\bin\vite.js --host 10.0.0.32 --strictPort false >> `"$LogFile`" 2>&1"
$null = ([wmiclass]'Win32_Process').Create($cmd)
Write-Host "Vite starting with VITE_USE_POLLING=1 (log: logs\vite-dev.log)"
exit 0
