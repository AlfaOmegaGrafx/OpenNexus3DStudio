# Install OpenSSH Server on this Surface so DGX can SSH in (alfao@10.0.0.32).
# MUST run as Administrator:
#   cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio
#   .\scripts\install-surface-openssh-server.ps1

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot
. (Join-Path $scriptDir 'dgx-device-map.ps1')

$surfaceUser = $env:USERNAME
$surfaceSshDir = Join-Path $env:USERPROFILE '.ssh'
$authorizedKeys = Join-Path $surfaceSshDir 'authorized_keys'
$adminAuthorizedKeys = Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'
$sshdConfig = Join-Path $env:ProgramData 'ssh\sshd_config'
$surfaceIsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

Write-Host ''
Write-Host '=== Install OpenSSH Server (Surface) ===' -ForegroundColor Cyan
Write-Host "  Incoming SSH user: $surfaceUser" -ForegroundColor White
Write-Host ''

$cap = Get-WindowsCapability -Online | Where-Object { $_.Name -like 'OpenSSH.Server*' }
if ($cap.State -ne 'Installed') {
    Write-Host 'Installing OpenSSH.Server capability...' -ForegroundColor Yellow
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
    Write-Host '  Installed.' -ForegroundColor Green
} else {
    Write-Host 'OpenSSH.Server already installed.' -ForegroundColor Green
}

if (-not (Test-Path $surfaceSshDir)) {
    New-Item -ItemType Directory -Path $surfaceSshDir -Force | Out-Null
}
if (-not (Test-Path $authorizedKeys)) {
    New-Item -ItemType File -Path $authorizedKeys -Force | Out-Null
}
if ($surfaceIsAdmin -and -not (Test-Path $adminAuthorizedKeys)) {
    New-Item -ItemType File -Path $adminAuthorizedKeys -Force | Out-Null
    Write-Host 'Created administrators_authorized_keys (admin SSH user).' -ForegroundColor Green
}

# Fix ACL on authorized_keys (OpenSSH on Windows is strict).
function Set-StrictSshKeyAcl {
    param([string]$Path, [string[]]$AllowedPrincipals)
    $acl = Get-Acl $Path
    $acl.SetAccessRuleProtection($true, $false)
    $acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) | Out-Null }
    foreach ($principal in $AllowedPrincipals) {
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $principal, 'FullControl', 'Allow'
        )
        $acl.AddAccessRule($rule)
    }
    Set-Acl $Path $acl
}

Set-StrictSshKeyAcl -Path $authorizedKeys -AllowedPrincipals @($surfaceUser, 'SYSTEM')
if ($surfaceIsAdmin) {
    Set-StrictSshKeyAcl -Path $adminAuthorizedKeys -AllowedPrincipals @('BUILTIN\Administrators', 'SYSTEM')
}

if (Test-Path $sshdConfig) {
    $raw = Get-Content $sshdConfig -Raw
    $changed = $false
    if ($raw -notmatch '(?m)^PubkeyAuthentication\s+yes') {
        Add-Content $sshdConfig "`nPubkeyAuthentication yes"
        $changed = $true
    }
    if ($raw -match '(?m)^PasswordAuthentication\s+no') {
        # keep password off if already set
    } elseif ($raw -notmatch '(?m)^PasswordAuthentication') {
        Add-Content $sshdConfig "PasswordAuthentication yes"
        $changed = $true
    }
    if ($changed) { Write-Host 'Updated sshd_config (pubkey auth).' -ForegroundColor Green }
}

$fw = Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue
if (-not $fw) {
    New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' `
        -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -Profile Any | Out-Null
    Write-Host 'Firewall rule added (TCP 22, all profiles).' -ForegroundColor Green
} else {
    Set-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -Enabled True -Profile Any | Out-Null
    Write-Host 'Firewall rule OpenSSH-Server-In-TCP enabled (all profiles).' -ForegroundColor Green
}

Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
Write-Host 'sshd started (Automatic).' -ForegroundColor Green

Write-Host ''
Write-Host 'Next: add DGX public key and test from Spark:' -ForegroundColor Yellow
Write-Host "  .\scripts\allow-dgx-ssh-to-surface.ps1" -ForegroundColor White
Write-Host "  ssh ${surfaceUser}@<surface-lan-ip>   # from DGX" -ForegroundColor Gray
Write-Host ''
