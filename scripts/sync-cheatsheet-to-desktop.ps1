# Copy memory-bank/scripts-cheatsheet.md to Desktop quick-reference files (run ON Surface).
param(
    [string]$DesktopDir = "$env:USERPROFILE\Desktop\DGX"
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$source = Join-Path $repoRoot 'memory-bank\scripts-cheatsheet.md'

if (-not (Test-Path $source)) {
    Write-Error "Cheatsheet not found: $source"
}

New-Item -ItemType Directory -Force -Path $DesktopDir | Out-Null

$targets = @(
    (Join-Path $DesktopDir 'DGX Terminal Commands.md'),
    (Join-Path $DesktopDir 'DGX Terminal Commands.txt')
)

Write-Host ''
Write-Host '=== Cheatsheet -> Desktop ===' -ForegroundColor Cyan
Write-Host "Source: $source"
Write-Host "Target: $DesktopDir"
Write-Host ''

foreach ($dest in $targets) {
    Copy-Item -Path $source -Destination $dest -Force
    Write-Host "  OK $(Split-Path $dest -Leaf)" -ForegroundColor Green
}

Write-Host 'Done.' -ForegroundColor Green
