$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$EnvFile = Join-Path $Repo '.env'
$LogsDir = Join-Path $Repo 'logs'
$LogFile = Join-Path $LogsDir 'spark-proxies.log'

if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null }

if (-not (Select-String -Path $EnvFile -Pattern '^VITE_MSF_PUBLIC_URL=' -Quiet -ErrorAction SilentlyContinue)) {
  Add-Content -Path $EnvFile -Value @"

VITE_MSF_PUBLIC_URL=https://10.0.0.32:8453
VITE_RP1_FABRIC_MSF_URL=https://10.0.0.32:8453/fabric/sneeze.msf?root=1
"@
  Write-Host 'Added VITE_MSF_PUBLIC_URL to .env (restart Vite to pick up)'
}

$listening = Get-NetTCPConnection -LocalPort 8453 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host 'MSF proxy already listening on :8453'
  exit 0
}

$cmd = "cmd.exe /c cd /d `"$Repo`" && set MSF_SPARK_URL=https://10.0.0.158:8443&& set XR_SPARK_HUB_URL=https://10.0.0.158:8088&& npm run dev:spark-proxies >> `"$LogFile`" 2>&1"
$null = ([wmiclass]'Win32_Process').Create($cmd)
Write-Host "Started dev:spark-proxies (log: logs\spark-proxies.log)"
Start-Sleep -Seconds 5
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 8453, 8443 } |
  Select-Object LocalPort |
  Format-Table -AutoSize
