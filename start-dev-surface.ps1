$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Runner = Join-Path $PSScriptRoot 'run-vite-surface.cmd'
$ViteCache = Join-Path $Repo 'node_modules\.vite'

Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'vite\\bin\\vite\.js' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if (Test-Path $ViteCache) { Remove-Item -Recurse -Force $ViteCache }

$cmd = "cmd.exe /c cd /d `"$Repo`" && node node_modules\vite\bin\vite.js --host 10.0.0.32 >> logs\vite-dev.log 2>&1"
$null = ([wmiclass]'Win32_Process').Create($cmd)
exit 0
