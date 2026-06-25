# Bidirectional SessionMem team sync: Surface <-> DGX via .sessionmem-team/
# Run ON SURFACE after coding sessions. Safe to re-run.
#
# Usage (on Surface, in repo root):
#   .\scripts\sync-sessionmem-team.ps1
#   .\scripts\sync-sessionmem-team.ps1 -Remote   # use DGX-Remote instead of DGX-Local

param(
    [switch]$Remote,
    [string]$HostAlias = '',
    [string]$RemoteRoot = '/home/sifr/CharacterStudio'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$teamDir = Join-Path $repoRoot '.sessionmem-team'

if ($HostAlias) {
    $sshHost = $HostAlias
} elseif ($Remote) {
    $sshHost = 'DGX-Remote'
} else {
    $sshHost = 'DGX-Local'
}

if (-not (Get-Command sessionmem -ErrorAction SilentlyContinue)) {
    Write-Error 'sessionmem not installed. Run: npm install -g sessionmem'
}

if (-not (Test-Path $teamDir)) {
    New-Item -ItemType Directory -Force -Path $teamDir | Out-Null
}

Write-Host ''
Write-Host '=== SessionMem team sync (Surface <-> DGX) ===' -ForegroundColor Cyan
Write-Host "Surface repo: $repoRoot"
Write-Host "DGX:          ${sshHost}:${RemoteRoot}"
Write-Host ''

Write-Host '[1/5] Surface sessionmem sync ...' -ForegroundColor Gray
sessionmem sync

Write-Host '[2/5] Push .sessionmem-team/ -> DGX ...' -ForegroundColor Gray
ssh -o ConnectTimeout=15 $sshHost "mkdir -p ${RemoteRoot}/.sessionmem-team"
scp -r "${teamDir}/." "${sshHost}:${RemoteRoot}/.sessionmem-team/"

Write-Host '[3/5] DGX sessionmem sync ...' -ForegroundColor Gray
ssh -o ConnectTimeout=15 $sshHost "export PATH=`"`$HOME/.nvm/versions/node/v22.22.2/bin:`$HOME/.local/bin:`$PATH`"; cd $RemoteRoot && sessionmem sync"

Write-Host '[4/5] Pull .sessionmem-team/ <- DGX ...' -ForegroundColor Gray
scp -r "${sshHost}:${RemoteRoot}/.sessionmem-team/." $teamDir

Write-Host '[5/5] Surface sessionmem sync (merge DGX) ...' -ForegroundColor Gray
sessionmem sync

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
sessionmem team status
