# Restore Studio UI chrome from backups/ui-chrome-good-state
param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$Snap = Join-Path $Root 'backups/ui-chrome-good-state'

if (-not (Test-Path $Snap)) {
  Write-Error "Snapshot missing: $Snap — run snapshot-ui-chrome.sh first"
}

$files = Get-ChildItem -Path $Snap -Recurse -File | Where-Object { $_.Name -ne 'MANIFEST.md' }
foreach ($f in $files) {
  $rel = $f.FullName.Substring($Snap.Length).TrimStart('\', '/')
  $dest = Join-Path $Root $rel
  if ($DryRun) {
    Write-Host "would restore  $rel"
    continue
  }
  $destDir = Split-Path $dest -Parent
  if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  }
  Copy-Item -Force $f.FullName $dest
  Write-Host "restore  $rel"
}

if (-not $DryRun) {
  Write-Host ""
  Write-Host "Restored from $Snap"
  Write-Host "Hard-refresh the existing Studio tab (do not open a new tab)."
}
