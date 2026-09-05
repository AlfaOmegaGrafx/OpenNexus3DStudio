# Ensure Galaxy XR can reach OpenNexus on Surface LAN (:3000 / :8464).
# Wi-Fi often lands as Public, which blocks headset→PC even when Surface browser works.
$ErrorActionPreference = 'Continue'
Write-Output '=== Wi-Fi profile ==='
$wifi = Get-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -ErrorAction SilentlyContinue
if ($wifi) {
  Write-Output "Before: $($wifi.Name) $($wifi.NetworkCategory)"
  if ($wifi.NetworkCategory -ne 'Private') {
    Set-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -NetworkCategory Private
    Write-Output 'SET_PRIVATE_OK'
  } else {
    Write-Output 'ALREADY_PRIVATE'
  }
} else {
  Write-Output 'NO_WIFI_PROFILE'
}
Get-NetConnectionProfile | ForEach-Object { Write-Output "$($_.InterfaceAlias) $($_.NetworkCategory)" }

Write-Output '=== firewall allow :3000 / :8464 ==='
foreach ($spec in @(
  @{ Name = 'OpenNexus Galaxy LAN 3000'; Port = 3000 },
  @{ Name = 'OpenNexus Galaxy LAN 8464'; Port = 8464 },
  @{ Name = 'Vite Dev Server'; Port = 3000 },
  @{ Name = 'OpenNexus Companion Proxy 8464'; Port = 8464 }
)) {
  $existing = Get-NetFirewallRule -DisplayName $spec.Name -ErrorAction SilentlyContinue
  if (-not $existing) {
    New-NetFirewallRule -DisplayName $spec.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $spec.Port -Profile Any | Out-Null
    Write-Output "CREATED $($spec.Name)"
  } else {
    Set-NetFirewallRule -DisplayName $spec.Name -Enabled True -Profile Any -Action Allow -ErrorAction SilentlyContinue
    Write-Output "UPDATED $($spec.Name)"
  }
}

Write-Output '=== listen check ==='
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 3000, 8464 } |
  ForEach-Object { Write-Output "$($_.LocalAddress):$($_.LocalPort)" }
Write-Output 'DONE'
