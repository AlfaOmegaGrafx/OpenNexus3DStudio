# Migrate SessionMem team folder from legacy CharacterStudio project ID to OpenNexus3DStudio.
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
if (-not $py) {
    Write-Error 'Python not found. Install Python 3 or run from a machine with python3.'
    exit 1
}

& $py.Source (Join-Path $PSScriptRoot 'migrate-sessionmem-project-id.py')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Done.' -ForegroundColor Green
