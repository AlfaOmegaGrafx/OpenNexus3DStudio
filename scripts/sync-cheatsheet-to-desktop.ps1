# Copy DGX quick-reference docs to Desktop (run ON Surface).
param(
    [string]$DesktopDir = "$env:USERPROFILE\Desktop\DGX",
    [switch]$Remote
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cheatsheet = Join-Path $repoRoot 'docs\scripts-cheatsheet.md'

if (-not (Test-Path $cheatsheet)) {
    Write-Error "Cheatsheet not found: $cheatsheet"
}

if ($Remote) { $sshHost = 'DGX-Remote' }
else { $sshHost = 'DGX-Local' }

New-Item -ItemType Directory -Force -Path $DesktopDir | Out-Null

$targets = @(
    (Join-Path $DesktopDir 'DGX Terminal Commands.md'),
    (Join-Path $DesktopDir 'DGX Terminal Commands.txt')
)

Write-Host ''
Write-Host '=== DGX quick refs -> Desktop ===' -ForegroundColor Cyan
Write-Host "Cheatsheet: $cheatsheet"
Write-Host "Target: $DesktopDir"
Write-Host ''

foreach ($dest in $targets) {
    Copy-Item -Path $cheatsheet -Destination $dest -Force
    Write-Host "  OK $(Split-Path $dest -Leaf)" -ForegroundColor Green
}

$xrRemote = "sifr@${sshHost}:/home/sifr/3DAIGC-API/mcp/docs/XR_VOICE_COMMANDS.md"
$xrLocal = Join-Path $DesktopDir 'XR_VOICE_COMMANDS.md'
scp $xrRemote $xrLocal
Write-Host "  OK XR_VOICE_COMMANDS.md  (from DGX via $sshHost)" -ForegroundColor Green

Write-Host 'Done.' -ForegroundColor Green
