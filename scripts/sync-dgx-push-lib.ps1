# Shared scp helpers for Surface -> DGX sync scripts.
# Dot-source from sync-to-dgx.ps1 / sync-changes-to-dgx.ps1 (do not run directly).

function Initialize-SyncDgxPushContext {
    param(
        [string]$RepoRoot,
        [string]$SshHost,
        [string]$RemoteRoot,
        [int]$ConnectTimeoutSec = 15,
        [int]$MaxRetriesPerItem = 3
    )
    $script:SyncRepoRoot = $RepoRoot
    $script:SyncSshHost = $SshHost
    $script:SyncRemoteRoot = $RemoteRoot
    $script:SyncConnectTimeout = $ConnectTimeoutSec
    $script:SyncMaxRetries = $MaxRetriesPerItem
    $script:SyncFailedItems = [System.Collections.Generic.List[string]]::new()
}

function Test-DgxSyncLock {
    param([switch]$Force)
    if ($Force) { return }
    $out = ssh -o "ConnectTimeout=$script:SyncConnectTimeout" $script:SyncSshHost `
        "test -f ${script:SyncRemoteRoot}/.sync-lock-dgx && cat ${script:SyncRemoteRoot}/.sync-lock-dgx || echo NO_LOCK"
    if ($out -notmatch 'NO_LOCK') {
        throw "DGX src/ is locked. Wait for unlock or use -Force.`n$out"
    }
}

function Invoke-ScpWithRetry {
    param(
        [string[]]$ScpArgs,
        [string]$Label
    )
    for ($attempt = 1; $attempt -le $script:SyncMaxRetries; $attempt++) {
        try {
            & scp @ScpArgs
            if ($LASTEXITCODE -ne 0) { throw "scp exit $LASTEXITCODE" }
            return $true
        } catch {
            if ($attempt -ge $script:SyncMaxRetries) {
                Write-Host "  FAIL $Label (after $attempt tries): $_" -ForegroundColor Red
                $script:SyncFailedItems.Add($Label) | Out-Null
                return $false
            }
            Write-Host "  retry $attempt/$($script:SyncMaxRetries) $Label" -ForegroundColor Yellow
            Start-Sleep -Seconds ([Math]::Min(8, 2 * $attempt))
        }
    }
    return $false
}

function Push-RemoteDir {
    param([string]$Rel)
    $local = Join-Path $script:SyncRepoRoot $Rel
    if (-not (Test-Path $local)) {
        Write-Host "  skip (missing): $Rel" -ForegroundColor DarkYellow
        return $true
    }
    ssh -o "ConnectTimeout=$script:SyncConnectTimeout" $script:SyncSshHost `
        "mkdir -p ${script:SyncRemoteRoot}/$($Rel -replace '\\','/')" | Out-Null
    $ok = Invoke-ScpWithRetry -ScpArgs @('-r', "${local}/.", "${script:SyncSshHost}:${script:SyncRemoteRoot}/$($Rel -replace '\\','/')/") -Label $Rel
    if ($ok) { Write-Host "  OK $Rel" -ForegroundColor Green }
    return $ok
}

function Push-RemoteFile {
    param([string]$Rel)
    $local = Join-Path $script:SyncRepoRoot $Rel
    if (-not (Test-Path $local)) {
        Write-Host "  skip (missing): $Rel" -ForegroundColor DarkYellow
        return $true
    }
    $parent = Split-Path $Rel -Parent
    if ($parent -and $parent -ne '.') {
        ssh -o "ConnectTimeout=$script:SyncConnectTimeout" $script:SyncSshHost `
            "mkdir -p ${script:SyncRemoteRoot}/$($parent -replace '\\','/')" | Out-Null
    }
    $ok = Invoke-ScpWithRetry -ScpArgs @($local, "${script:SyncSshHost}:${script:SyncRemoteRoot}/$($Rel -replace '\\','/')") -Label $Rel
    if ($ok) { Write-Host "  OK $Rel" -ForegroundColor Green }
    return $ok
}

function Get-SurfaceSyncSkipScripts {
    return @(
        'sync-to-dgx.ps1', 'sync-from-dgx.ps1', 'sync-dgx.ps1',
        'sync-to-pc.sh', 'ensure-dgx-sync-ready.sh'
    )
}

function Test-PitchDeckGitChanged {
    param([string]$RepoRoot)
    Push-Location $RepoRoot
    try {
        $status = git status --porcelain -u -- 'Pitch Deck' 2>$null
        return [bool]($status -match '\S')
    } finally {
        Pop-Location
    }
}

function Invoke-PitchDeckSyncToDgxIfChanged {
    param(
        [string]$RepoRoot,
        [switch]$Remote,
        [string]$HostAlias = ''
    )
    if (-not (Test-PitchDeckGitChanged -RepoRoot $RepoRoot)) { return $true }
    Write-Host ''
    Write-Host 'Pitch Deck git changes — flat sync to DGX ...' -ForegroundColor Cyan
    $pitchScript = Join-Path $RepoRoot 'scripts\sync-pitch-deck-to-dgx.ps1'
    $invokeArgs = @()
    if ($Remote) { $invokeArgs += '-Remote' }
    if ($HostAlias) { $invokeArgs += @('-HostAlias', $HostAlias) }
    & $pitchScript @invokeArgs
    return ($LASTEXITCODE -eq 0)
}

function Test-SurfaceOwnedSyncPath {
    param(
        [string]$Rel,
        [switch]$IncludeDocs,
        [switch]$IncludeAgentContext,
        [switch]$Full
    )
    $rel = $Rel -replace '\\', '/'
    if ($rel -match '^(graphify-out|\.env|uploads/|Pitch Deck/)') { return $false }
    if ($rel -eq 'MONETIZATION_ROADMAP.md' -or $rel -eq 'OpenNexus3DStudio.code-workspace') { return $true }
    if ($rel -match '^src/sound(/|$)' -and -not $Full) { return $false }
    if ($rel -match '^src/') { return $true }
    if ($rel -match '^memory-bank/') { return $true }
    if ($rel -match '^\.cursor/rules/') { return $true }
    if ($rel -match '^native/') { return $true }
    if ($rel -match '^tests/') { return $true }
    if ($rel -match '^\.sessionmem-team/') { return $true }
    if ($IncludeAgentContext -and $rel -match '^graphify-out/') { return $true }
    if ($IncludeDocs -and $rel -match '^docs/') { return $true }
    if ($rel -match '^scripts/') {
        $name = Split-Path $rel -Leaf
        if ((Get-SurfaceSyncSkipScripts) -contains $name) { return $false }
        return $true
    }
    return $false
}

function Get-GitChangedPaths {
    param([string]$RepoRoot)
    Push-Location $RepoRoot
    try {
        $raw = @()
        $status = git status --porcelain -u 2>$null
        if (-not $status) { return @() }
        foreach ($line in $status) {
            if ($line.Length -lt 4) { continue }
            $path = $line.Substring(3).Trim()
            if ($path -match ' -> ') {
                $parts = $path -split ' -> '
                $path = $parts[-1].Trim()
            }
            $raw += ($path -replace '\\', '/')
        }
        return $raw | Select-Object -Unique
    } finally {
        Pop-Location
    }
}

function Get-ChangedSurfaceSyncPaths {
    param(
        [string]$RepoRoot,
        [switch]$IncludeDocs,
        [switch]$IncludeAgentContext,
        [switch]$Full,
        [string[]]$OnlyPaths = @()
    )
    $candidates = Get-GitChangedPaths -RepoRoot $RepoRoot
    if ($OnlyPaths.Count -gt 0) {
        $prefixes = $OnlyPaths | ForEach-Object { ($_ -replace '\\', '/').TrimEnd('/') }
        $candidates = $candidates | Where-Object {
            $p = $_
            $prefixes | Where-Object { $p -eq $_ -or $p.StartsWith("$_/") } | Select-Object -First 1
        }
    }
    $files = [System.Collections.Generic.List[string]]::new()
    foreach ($rel in $candidates) {
        if (-not (Test-SurfaceOwnedSyncPath -Rel $rel -IncludeDocs:$IncludeDocs -IncludeAgentContext:$IncludeAgentContext -Full:$Full)) {
            continue
        }
        $absPath = Join-Path $RepoRoot $rel
        if (-not (Test-Path -LiteralPath $absPath)) { continue }
        if (Test-Path -LiteralPath $absPath -PathType Container) { continue }
        $files.Add($rel) | Out-Null
    }
    return $files | Sort-Object -Unique
}

function Invoke-RetryFailedSyncItems {
    param(
        [string[]]$Items,
        [int]$MaxRounds = 5,
        [switch]$RetryUntilComplete
    )
    $pending = [System.Collections.Generic.List[string]]::new()
    $pending.AddRange($Items)
    $round = 0
    while ($pending.Count -gt 0) {
        $round++
        if ($round -gt $MaxRounds) {
            Write-Host "Stopped after $MaxRounds rounds; $($pending.Count) item(s) still failed." -ForegroundColor Red
            break
        }
        if ($round -gt 1) {
            Write-Host "Retry round $round/$MaxRounds ($($pending.Count) item(s)) ..." -ForegroundColor Yellow
        }
        $script:SyncFailedItems.Clear()
        foreach ($rel in $pending) {
            $absPath = Join-Path $script:SyncRepoRoot $rel
            if (Test-Path -LiteralPath $absPath -PathType Container) {
                Push-RemoteDir $rel | Out-Null
            } else {
                Push-RemoteFile $rel | Out-Null
            }
        }
        if ($script:SyncFailedItems.Count -eq 0) { return @() }
        if (-not $RetryUntilComplete) { return $script:SyncFailedItems.ToArray() }
        $pending.Clear()
        $pending.AddRange($script:SyncFailedItems)
        Start-Sleep -Seconds 2
    }
    return $script:SyncFailedItems.ToArray()
}
