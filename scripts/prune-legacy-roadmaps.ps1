# Remove legacy MONETIZATION_ROADMAP copies. Keeps only repo-root MONETIZATION_ROADMAP.md.
# Run from Surface repo root:
#   .\scripts\prune-legacy-roadmaps.ps1

param(
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$canonical = Join-Path $repoRoot 'MONETIZATION_ROADMAP.md'

if (-not (Test-Path $canonical)) {
    Write-Warning "Canonical MONETIZATION_ROADMAP.md missing at repo root."
}

$skipDirs = @('node_modules', '.git', 'build', 'dist')
$removed = 0

Write-Host ''
Write-Host '=== Prune legacy monetization roadmaps (Surface) ===' -ForegroundColor Cyan

Get-ChildItem -Path $repoRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Name -like 'MONETIZATION_ROADMAP*' -and
        $_.FullName -ne $canonical -and
        ($skipDirs | ForEach-Object { $_.FullName -match "[\\/]$_([\\/]|$)" }) -notcontains $true
    } |
    ForEach-Object {
        if ($WhatIf) {
            Write-Host "  would remove: $($_.FullName.Replace($repoRoot + '\', ''))" -ForegroundColor Yellow
        } else {
            Remove-Item -LiteralPath $_.FullName -Force
            Write-Host "  removed: $($_.FullName.Replace($repoRoot + '\', ''))" -ForegroundColor Green
        }
        $removed++
    }

# Nested sync accidents that often carry duplicate roadmap tooling/docs.
$nestedDirs = @(
    'scripts\scripts',
    'scripts\scripts\scripts',
    'docs\docs\docs',
    'docs\docs\docs\docs'
)

foreach ($rel in $nestedDirs) {
    $path = Join-Path $repoRoot $rel
    if (-not (Test-Path $path)) { continue }
    if ($WhatIf) {
        Write-Host "  would remove dir: $rel" -ForegroundColor Yellow
    } else {
        Remove-Item -LiteralPath $path -Recurse -Force
        Write-Host "  removed dir: $rel" -ForegroundColor Green
    }
    $removed++
}

Write-Host ''
if ($removed -eq 0) {
    Write-Host 'Nothing to prune — canonical MONETIZATION_ROADMAP.md only.' -ForegroundColor Gray
} else {
    Write-Host "Done. Removed $removed path(s)." -ForegroundColor Green
}
