$ErrorActionPreference = "Continue"
Write-Output "---listen 8464---"
Get-NetTCPConnection -LocalPort 8464 -State Listen -ErrorAction SilentlyContinue |
  Format-Table LocalAddress,LocalPort,OwningProcess -AutoSize | Out-String
$pid8464 = (Get-NetTCPConnection -LocalPort 8464 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
if ($pid8464) {
  Get-CimInstance Win32_Process -Filter "ProcessId=$pid8464" |
    Select-Object ProcessId,Name,CommandLine | Format-List | Out-String
}
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
foreach ($url in @("https://127.0.0.1:8464/","https://10.0.0.32:8464/")) {
  try {
    $req = [System.Net.WebRequest]::Create($url)
    $req.Timeout = 4000
    $resp = $req.GetResponse()
    Write-Output ("OK " + $url + " status=" + [int]$resp.StatusCode)
    $resp.Close()
  } catch {
    Write-Output ("FAIL " + $url + " " + $_.Exception.Message)
  }
}
