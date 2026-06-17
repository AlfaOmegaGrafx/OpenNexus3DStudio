# Let DGX (user sifr) SSH to this Surface via key auth.
#
#   cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio
#   .\scripts\install-surface-openssh-server.ps1   # Admin once
#   .\scripts\allow-dgx-ssh-to-surface.ps1

$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot
. (Join-Path $scriptDir 'dgx-device-map.ps1')

$surfaceUser = $env:USERNAME
$surfaceSshDir = Join-Path $env:USERPROFILE '.ssh'
$authorizedKeys = Join-Path $surfaceSshDir 'authorized_keys'
$adminAuthorizedKeys = Get-AdminAuthorizedKeysPath
$surfaceIsAdmin = Test-SurfaceUserIsAdmin
$targetAuthorizedKeys = if ($surfaceIsAdmin) { $adminAuthorizedKeys } else { $authorizedKeys }
$dgxKeyOnSpark = "/home/$DgxUser/.ssh/id_ed25519.pub"
$dgxKeyAlt = "/home/$DgxUser/.ssh/id_rsa.pub"

function Get-SurfaceLanIp {
    $wifi = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notmatch '^127\.' -and
            $_.IPAddress -notmatch '^169\.254\.' -and
            $_.PrefixOrigin -ne 'WellKnown'
        } |
        Sort-Object -Property @{ Expression = { $_.InterfaceAlias -match 'Wi-Fi|WLAN' }; Descending = $true }, SkipAsSource |
        Select-Object -First 1
    if ($wifi) { return $wifi.IPAddress }
    return '10.0.0.32'
}

$surfaceLanIp = Get-SurfaceLanIp

function Get-AdminAuthorizedKeysPath {
    Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'
}

function Test-SurfaceUserIsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Repair-AdminAuthorizedKeysAcl {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    $acl = Get-Acl $Path
    $acl.SetAccessRuleProtection($true, $false)
    $acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) | Out-Null }
    $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        'BUILTIN\Administrators', 'FullControl', 'Allow'
    )
    $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        'SYSTEM', 'FullControl', 'Allow'
    )
    $acl.AddAccessRule($adminRule)
    $acl.AddAccessRule($systemRule)
    Set-Acl $Path $acl
}

function Repair-AuthorizedKeysAcl {
    param([string]$Path, [string]$OwnerUser)
    if (-not (Test-Path $Path)) { return }
    $acl = Get-Acl $Path
    $acl.SetAccessRuleProtection($true, $false)
    $acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) | Out-Null }
    $userRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $OwnerUser, 'FullControl', 'Allow'
    )
    $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        'SYSTEM', 'FullControl', 'Allow'
    )
    $acl.AddAccessRule($userRule)
    $acl.AddAccessRule($systemRule)
    Set-Acl $Path $acl
}

function Add-KeyLine {
    param([string]$Line, [string]$Path)
    if (-not $Line -or $Line -notmatch '^ssh-') { return $false }
    $existing = if (Test-Path $Path) { Get-Content $Path -Raw } else { '' }
    $fingerprint = ($Line -split '\s+')[1]
    if ($existing -and $existing.Contains($fingerprint)) {
        Write-Host "  DGX key already in $Path." -ForegroundColor DarkYellow
        return $true
    }
    $parent = Split-Path $Path -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    if (-not (Test-Path $Path)) { New-Item -ItemType File -Path $Path -Force | Out-Null }
    Add-Content -Path $Path -Value $Line.Trim()
    Write-Host "  Added DGX public key to $Path." -ForegroundColor Green
    return $true
}

Write-Host ''
Write-Host '=== Allow DGX -> Surface SSH ===' -ForegroundColor Cyan

if (-not (Test-Path $surfaceSshDir)) {
    New-Item -ItemType Directory -Path $surfaceSshDir -Force | Out-Null
}
if ($surfaceIsAdmin) {
    Write-Host '  Surface user is Administrator: keys go to ProgramData administrators_authorized_keys.' -ForegroundColor Gray
}

Write-Host "Surface LAN IP: $surfaceLanIp" -ForegroundColor Gray
Write-Host "Fetching public key from $DgxAliasLocal ($DgxUser)..." -ForegroundColor Gray
$remoteKeyCmd = "test -f ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N '' -C DGX-to-Surface; cat ~/.ssh/id_ed25519.pub 2>/dev/null || cat ~/.ssh/id_rsa.pub 2>/dev/null"
$keyLine = ssh -o BatchMode=yes -o ConnectTimeout=12 $DgxAliasLocal $remoteKeyCmd 2>&1

if ($LASTEXITCODE -ne 0 -or -not ($keyLine -match '^ssh-')) {
    Write-Host 'Could not read a key from DGX. On the Spark run:' -ForegroundColor Yellow
    Write-Host '  ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""' -ForegroundColor White
    Write-Host '  cat ~/.ssh/id_ed25519.pub' -ForegroundColor White
    Write-Host 'Then paste into:' -ForegroundColor Yellow
    Write-Host "  $targetAuthorizedKeys" -ForegroundColor White
    exit 1
}

$keyLine = ($keyLine | Select-Object -First 1).ToString().Trim()
if ($keyLine -notmatch 'DGX-to-Surface') {
    $keyLine = "$keyLine DGX-to-Surface"
}
Add-KeyLine -Line $keyLine -Path $targetAuthorizedKeys | Out-Null
try {
    if ($surfaceIsAdmin) {
        Repair-AdminAuthorizedKeysAcl -Path $targetAuthorizedKeys
    } else {
        Repair-AuthorizedKeysAcl -Path $targetAuthorizedKeys -OwnerUser $surfaceUser
    }
    Write-Host '  Repaired authorized_keys ACL for OpenSSH.' -ForegroundColor Green
} catch {
    Write-Host '  Could not repair authorized_keys ACL (run install script as Admin if sshd rejects keys).' -ForegroundColor DarkYellow
}

# Suggested ssh config block for DGX (also merged on Spark below).
$dgxConfigSnippet = @"

# Paste on DGX in ~/.ssh/config (ssh Surface from Spark)
Host Surface-PC
    HostName $surfaceLanIp
    User $surfaceUser
    Port 22
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    StrictHostKeyChecking accept-new

"@

$snippetPath = Join-Path $surfaceSshDir 'dgx-to-surface.config.snippet'
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($snippetPath, $dgxConfigSnippet.TrimStart(), $utf8)

$dgxConfigMarker = 'Host Surface-PC'
$remoteTmp = '/tmp/surface-pc-ssh.snippet'
scp -o BatchMode=yes -o ConnectTimeout=12 $snippetPath "${DgxAliasLocal}:${remoteTmp}" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    ssh -o BatchMode=yes -o ConnectTimeout=12 $DgxAliasLocal "grep -q '$dgxConfigMarker' ~/.ssh/config 2>/dev/null || cat $remoteTmp >> ~/.ssh/config; rm -f $remoteTmp" 2>&1 | Out-Null
}

$sshd = Get-Service sshd -ErrorAction SilentlyContinue
Write-Host ''
Write-Host "Surface listens: ssh ${surfaceUser}@${surfaceLanIp}" -ForegroundColor Green
Write-Host "DGX config snippet: $snippetPath" -ForegroundColor Gray
if ($sshd -and $sshd.Status -eq 'Running') {
    Write-Host ''
    Write-Host 'Test from DGX:' -ForegroundColor Yellow
    Write-Host '  ssh Surface-PC hostname' -ForegroundColor White
} else {
    Write-Host ''
    Write-Host 'OpenSSH Server not running on Surface yet. Run as Administrator:' -ForegroundColor Yellow
    Write-Host '  .\scripts\install-surface-openssh-server.ps1' -ForegroundColor White
    Write-Host 'Then test from DGX: ssh Surface-PC hostname' -ForegroundColor Gray
}
Write-Host ''
