# Link public/loot-assets to sibling ../loot-assets (Windows junction).
# Run from repo root on Surface after moving or cloning loot-assets externally.
param(
    [string]$ExternalDir = '',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

if (-not $ExternalDir) {
    $ExternalDir = Join-Path (Split-Path -Parent $repoRoot) 'loot-assets'
}
$ExternalDir = [System.IO.Path]::GetFullPath($ExternalDir)
$linkPath = Join-Path $repoRoot 'public\loot-assets'

if (-not (Test-Path (Join-Path $ExternalDir 'manifest.json'))) {
    Write-Error "manifest.json not found in $ExternalDir - clone loot-assets there first (npm run get-assets)."
}

if (Test-Path $linkPath) {
    $item = Get-Item $linkPath -Force
    if ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink') {
        if ($item.Target -contains $ExternalDir -or $item.Target -eq $ExternalDir) {
            Write-Host "Already linked: $linkPath -> $ExternalDir" -ForegroundColor Green
            exit 0
        }
        if (-not $Force) {
            Write-Error "public/loot-assets exists as link to $($item.Target). Use -Force to replace."
        }
        Remove-Item $linkPath -Force -Recurse
    } elseif ($Force) {
        Remove-Item $linkPath -Force -Recurse
    } else {
        Write-Error "public/loot-assets is a real folder. Move it to $ExternalDir, then re-run with -Force."
    }
}

New-Item -ItemType Directory -Force -Path (Split-Path $linkPath) | Out-Null
cmd /c mklink /J "$linkPath" "$ExternalDir"
Write-Host "Linked $linkPath -> $ExternalDir" -ForegroundColor Green
