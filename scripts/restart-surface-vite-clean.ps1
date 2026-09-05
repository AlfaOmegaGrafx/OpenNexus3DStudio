#!/usr/bin/env pwsh
# Kill stale OpenNexus Vite/node processes and clear dep cache.
# Usage:
#   .\scripts\restart-surface-vite-clean.ps1          # cleanup only
#   .\scripts\restart-surface-vite-clean.ps1 -Start   # cleanup + npm run dev on :3000
param([switch]$Start)

$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio'

Write-Host '==> Stopping stale node processes (OpenNexus / vite :300x)...'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object {
    $_.CommandLine -like '*OpenNexus3DStudio*' -or
    ($_.CommandLine -like '*vite*' -and $_.CommandLine -match ':300[0-9]')
  } |
  ForEach-Object {
    Write-Host "  stop PID $($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
Start-Sleep -Seconds 2

Write-Host '==> Clearing node_modules/.vite cache...'
if (Test-Path 'node_modules\.vite') { Remove-Item -Recurse -Force 'node_modules\.vite' }

if (-not $Start) {
  Write-Host ''
  Write-Host 'Cleanup done. Start ONE dev server:'
  Write-Host '  npm run dev -- --force --host --port 3000 --strictPort'
  Write-Host 'Then hard-refresh Galaxy on https://10.0.0.32:3000/spacetime-xr?...'
  exit 0
}

Write-Host '==> Starting Vite on https://10.0.0.32:3000 (strictPort)...'
npm run dev -- --force --host --port 3000 --strictPort
