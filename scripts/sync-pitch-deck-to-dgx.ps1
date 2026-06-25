# Push Pitch Deck/ to DGX without nesting Pitch Deck/Pitch Deck.
# Wrong: scp -r "Pitch Deck" host:/repo/     → creates Pitch Deck/Pitch Deck
# Right: scp -r "Pitch Deck/." host:/repo/Pitch Deck/
#
# Usage: .\scripts\sync-pitch-deck-to-dgx.ps1 [-Remote]

param(
    [switch]$Remote,
    [string]$HostAlias = '',
    [string]$RemoteRoot = '/home/sifr/OpenNexus3DStudio'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

if ($HostAlias) { $sshHost = $HostAlias }
elseif ($Remote) { $sshHost = 'DGX-Remote' }
else { $sshHost = 'DGX-Local' }

$localDeck = Join-Path $repoRoot 'Pitch Deck'
if (-not (Test-Path $localDeck)) {
    throw "Missing: $localDeck"
}

$remoteRel = 'Pitch Deck'
$remotePath = "${RemoteRoot}/${remoteRel}"

Write-Host ''
Write-Host '=== Pitch Deck -> DGX (flat) ===' -ForegroundColor Cyan
Write-Host "Surface: $localDeck"
Write-Host "DGX:     ${sshHost}:${remotePath}/"

& (Join-Path $repoRoot 'scripts\prune-sync-duplicates.ps1')

ssh -o ConnectTimeout=15 $sshHost "mkdir -p '${remotePath}' && rm -rf '${remotePath}/Pitch Deck'"
scp -r "${localDeck}/." "${sshHost}:${remotePath}/"
Write-Host '  OK Pitch Deck' -ForegroundColor Green

if ($Remote) {
    ssh -o ConnectTimeout=15 $sshHost "bash ${RemoteRoot}/scripts/prune-sync-duplicates.sh"
} else {
    ssh -o ConnectTimeout=15 $sshHost "bash ${RemoteRoot}/scripts/prune-sync-duplicates.sh" 2>$null
}

Write-Host 'Done.' -ForegroundColor Green
