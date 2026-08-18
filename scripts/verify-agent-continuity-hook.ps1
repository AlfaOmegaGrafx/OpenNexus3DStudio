# Cursor sessionStart hook (Surface) — verify continuity and emit JSON context
$ErrorActionPreference = 'Continue'
try { $null = [Console]::In.ReadToEnd() } catch {}
$root = 'C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio'
$verify = Join-Path $root 'scripts\verify-agent-continuity.ps1'
$status = 'fail'
$summary = 'verify script missing'
if (Test-Path $verify) {
  Push-Location $root
  $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $verify 2>&1 | Out-String
  Pop-Location
  if ($LASTEXITCODE -eq 0) { $status = 'pass' } else { $status = 'fail' }
  $lines = $out -split "`n"
  $summary = ($lines | Select-Object -Last 80) -join "`n"
}
$ctx = @"
## Agent continuity (auto-verified at session start)

Status: **$status**

Mandatory: load RepoResident (`.agent/STATE.md`), MindLink (`.brain/`), memory-bank; sync after edits.

### Verify tail
``````
$summary
``````
"@
$payload = @{
  env = @{
    OPENNEXUS_CONTINUITY_STATUS = $status
    OPENNEXUS_CONTINUITY_VERIFIED = '1'
  }
  additional_context = $ctx
} | ConvertTo-Json -Compress -Depth 5
[Console]::Out.Write($payload)
exit 0
