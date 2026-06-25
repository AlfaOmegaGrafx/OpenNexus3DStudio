# Push only git-changed Surface-owned files to DGX (fast incremental sync).
# Retries failed files; use -RetryUntilComplete for agent/automation runs.
param(
    [switch]$Remote,
    [string]$HostAlias = '',
    [string]$RemoteRoot = '/home/sifr/OpenNexus3DStudio',
    [string[]]$Paths = @(),
    [switch]$IncludeDocs,
    [switch]$IncludeAgentContext,
    [switch]$Force,
    [switch]$RetryUntilComplete,
    [int]$MaxRounds = 8,
    [int]$MaxRetriesPerFile = 3
)

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

if ($HostAlias) { $sshHost = $HostAlias }
elseif ($Remote) { $sshHost = 'DGX-Remote' }
else { $sshHost = 'DGX-Local' }

. (Join-Path $repoRoot 'scripts\sync-dgx-push-lib.ps1')
Initialize-SyncDgxPushContext -RepoRoot $repoRoot -SshHost $sshHost -RemoteRoot $RemoteRoot -MaxRetriesPerItem $MaxRetriesPerFile

Write-Host ''
Write-Host '=== Surface -> DGX (changes only) ===' -ForegroundColor Cyan
Write-Host "Surface: $repoRoot"
Write-Host "DGX:     ${sshHost}:${RemoteRoot}"
Write-Host ''

try {
    Test-DgxSyncLock -Force:$Force
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

$changed = Get-ChangedSurfaceSyncPaths -RepoRoot $repoRoot -IncludeDocs:$IncludeDocs `
    -IncludeAgentContext:$IncludeAgentContext -OnlyPaths $Paths

if ($changed.Count -eq 0) {
    Write-Host 'No Surface-owned git changes to push.' -ForegroundColor DarkGray
    $pitchOnly = Invoke-PitchDeckSyncToDgxIfChanged -RepoRoot $repoRoot -Remote:$Remote -HostAlias $HostAlias
    if (-not $pitchOnly) { exit 1 }
    exit 0
}

Write-Host "Pushing $($changed.Count) changed file(s) ..." -ForegroundColor Gray
$failed = Invoke-RetryFailedSyncItems -Items $changed -MaxRounds $MaxRounds -RetryUntilComplete:$RetryUntilComplete

if ($failed.Count -gt 0) {
    Write-Host ''
    Write-Host "Failed ($($failed.Count)):" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host ''
    Write-Host 'Re-run: .\scripts\sync-changes-to-dgx.ps1 -RetryUntilComplete' -ForegroundColor Yellow
    exit 1
}

Write-Host ''
Write-Host 'Done (changes -> DGX).' -ForegroundColor Green

$pitchOk = Invoke-PitchDeckSyncToDgxIfChanged -RepoRoot $repoRoot -Remote:$Remote -HostAlias $HostAlias
if (-not $pitchOk) { exit 1 }
