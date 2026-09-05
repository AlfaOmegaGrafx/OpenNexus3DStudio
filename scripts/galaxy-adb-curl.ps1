$ErrorActionPreference = 'Continue'
$adbCandidates = @(
  'C:\Users\alfao\Desktop\Android Developer Bridge platform-tools\adb.exe',
  'C:\Users\alfao\AppData\Local\Android\Sdk\platform-tools\adb.exe',
  'C:\Android\platform-tools\adb.exe'
)
$adb = $null
foreach ($c in $adbCandidates) {
  if (Test-Path $c) { $adb = $c; break }
}
if (-not $adb) {
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($cmd) { $adb = $cmd.Source }
}
if (-not $adb) {
  Write-Output 'NO_ADB'
  exit 1
}
Write-Output "adb=$adb"
& $adb disconnect 2>$null | Out-Null
& $adb connect 10.0.0.222:5555
Start-Sleep -Seconds 3
& $adb devices -l
Write-Output '=== model/ip ==='
& $adb shell 'getprop ro.product.model'
& $adb shell 'ip -4 addr show wlan0'
Write-Output '=== curl :3000 ==='
& $adb shell 'curl -sk -o /dev/null -w %{http_code} --connect-timeout 5 https://10.0.0.32:3000/'
Write-Output ''
Write-Output '=== curl :8464 ==='
& $adb shell 'curl -sk -o /dev/null -w %{http_code} --connect-timeout 5 https://10.0.0.32:8464/'
Write-Output ''
Write-Output '=== ping Surface ==='
& $adb shell 'ping -c 2 -W 2 10.0.0.32'
