$ErrorActionPreference = 'Continue'
Write-Output '=== ping Galaxy 10.0.0.224 ==='
try {
  $p = Test-Connection -ComputerName 10.0.0.224 -Count 2 -ErrorAction Stop
  Write-Output "PING_OK count=$($p.Count)"
} catch {
  Write-Output "PING_FAIL $($_.Exception.Message)"
}

Write-Output '=== Surface 10.* addrs ==='
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -like '10.*' -or $_.IPAddress -like '192.168.*' } |
  ForEach-Object { Write-Output "$($_.IPAddress) $($_.InterfaceAlias)" }

Write-Output '=== listen 3000/8464 ==='
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 3000,8464,5173 } |
  ForEach-Object { Write-Output "$($_.LocalAddress):$($_.LocalPort) pid=$($_.OwningProcess)" }

Write-Output '=== firewall inbound allow for 3000/8464 ==='
$filters = Get-NetFirewallPortFilter -ErrorAction SilentlyContinue | Where-Object {
  $_.LocalPort -eq 3000 -or $_.LocalPort -eq 8464 -or $_.LocalPort -eq '3000' -or $_.LocalPort -eq '8464'
}
foreach ($f in $filters) {
  $r = Get-NetFirewallRule -AssociatedNetFirewallPortFilter $f -ErrorAction SilentlyContinue
  foreach ($rule in $r) {
    Write-Output "port=$($f.LocalPort) proto=$($f.Protocol) name=$($rule.DisplayName) en=$($rule.Enabled) act=$($rule.Action) dir=$($rule.Direction) profile=$($rule.Profile)"
  }
}

Write-Output '=== node.exe firewall ==='
Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue |
  Where-Object { $_.Program -match 'node|vite' } |
  ForEach-Object {
    $r = Get-NetFirewallRule -AssociatedNetFirewallApplicationFilter $_ -ErrorAction SilentlyContinue
    foreach ($rule in $r) {
      Write-Output "app=$($_.Program) name=$($rule.DisplayName) en=$($rule.Enabled) act=$($rule.Action) dir=$($rule.Direction)"
    }
  }

Write-Output '=== profiles ==='
Get-NetConnectionProfile | ForEach-Object { Write-Output "$($_.Name) $($_.NetworkCategory) $($_.InterfaceAlias)" }
