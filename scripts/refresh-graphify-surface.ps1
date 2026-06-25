# Refresh local Graphify AST graphs on Surface (no LLM cost). Run after DGX sync or meaningful code changes.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$surfaceRoot = $env:SURFACE_ROOT
if (-not $surfaceRoot) { $surfaceRoot = 'C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio' }

if (-not (Get-Command graphify -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        Write-Host 'Installing uv...' -ForegroundColor Yellow
        irm https://astral.sh/uv/install.ps1 | iex
        $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
    }
    Write-Host 'Installing graphify...' -ForegroundColor Yellow
    uv tool install graphifyy
    $env:Path = "$env:USERPROFILE\.local\bin;$env:USERPROFILE\.cargo\bin;$env:Path"
}

$repos = @(
    $surfaceRoot
)

foreach ($repo in $repos) {
    if (-not (Test-Path $repo)) {
        Write-Warning "Skipping missing repo: $repo"
        continue
    }
    Write-Host "=== graphify update: $repo ===" -ForegroundColor Cyan
    Push-Location $repo
    try {
        graphify update . --no-cluster
        if ($LASTEXITCODE -ne 0) { throw "graphify update failed for $repo" }
    } finally {
        Pop-Location
    }
}

Write-Host 'Done. Query: cd <repo> && graphify query "your question"' -ForegroundColor Green
