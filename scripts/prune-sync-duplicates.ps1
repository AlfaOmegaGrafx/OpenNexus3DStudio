# Remove accidental nested folders after scp sync accidents. Safe to re-run on Surface or DGX (via SSH).
# Usage (Surface): .\scripts\prune-sync-duplicates.ps1
# Never deletes MONETIZATION_ROADMAP.md at repo root.

param(
    [switch]$Remote,
    [string]$HostAlias = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$nestedPaths = @(
    'Pitch Deck/Pitch Deck',
    'docs/docs/docs',
    'docs/docs/docs/docs',
    'scripts/scripts',
    'scripts/scripts/scripts',
    'src/components/components',
    'src/pages/pages',
    'src/pages/pages/pages',
    'src/library/library',
    'src/context/context',
    'src/services/services',
    'src/__tests__/__tests__',
    'memory-bank/memory-bank'
)

function Invoke-PruneAtRoot {
    param([string]$Root)
    $removed = 0
    Write-Host "=== Prune sync duplicates ===" -ForegroundColor Cyan
    Write-Host "Root: $Root"
    foreach ($rel in $nestedPaths) {
        $full = Join-Path $Root $rel
        if (Test-Path $full) {
            Remove-Item -LiteralPath $full -Recurse -Force
            Write-Host "  removed: $rel" -ForegroundColor Yellow
            $removed++
        }
    }
    if ($removed -eq 0) {
        Write-Host 'Nothing to prune.'
    } else {
        Write-Host "Done. Removed $removed path(s)." -ForegroundColor Green
    }
}

if ($Remote -or $HostAlias) {
    if ($HostAlias) { $sshHost = $HostAlias }
    else { $sshHost = 'DGX-Remote' }
    ssh -o ConnectTimeout=15 $sshHost 'bash /home/sifr/OpenNexus3DStudio/scripts/prune-sync-duplicates.sh'
} else {
    Set-Location $repoRoot
    Invoke-PruneAtRoot -Root $repoRoot
}
