$ErrorActionPreference = 'Continue'
$Root = 'C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio'
$Log = Join-Path $Root 'logs\vite-dev.log'
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'logs') | Out-Null

Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'vite\\bin\\vite|vite\.js' } |
  ForEach-Object {
    Write-Output "stop vite pid=$($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
Start-Sleep -Seconds 2

$cmd = "cmd.exe /c cd /d `"$Root`" && set VITE_USE_POLLING=1&& node node_modules\vite\bin\vite.js --host 0.0.0.0 --port 3000 >> `"$Log`" 2>&1"
$r = ([wmiclass]'Win32_Process').Create($cmd)
Write-Output "Vite Create Return=$($r.ReturnValue) Pid=$($r.ProcessId)"
Start-Sleep -Seconds 10
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 3000, 8464 } |
  ForEach-Object { Write-Output "LISTEN $($_.LocalAddress):$($_.LocalPort) pid=$($_.OwningProcess)" }
Write-Output '--- vite log ---'
Get-Content $Log -Tail 15 -ErrorAction SilentlyContinue
