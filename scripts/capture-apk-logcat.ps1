# Appends a filtered adb logcat dump to logs/apk-logcat.txt (Character Studio Android XR face bridge).
# Requires: adb in PATH, USB debugging or wireless adb paired to the device.
# Usage: .\scripts\capture-apk-logcat.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logDir = Join-Path $repoRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$out = Join-Path $logDir 'apk-logcat.txt'
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
"`n======== $stamp adb logcat -d (CS-JetpackFace, CS-XR-WebView) ========`n" | Out-File -FilePath $out -Append -Encoding utf8

# Last lines only; adjust -t if you need more history.
& adb logcat -d -t 8000 CS-JetpackFace:V CS-FaceKeeper:V CS-FaceBridgeSvc:V CS-FaceHttpRelay:V CS-XR-WebView:V CS-OpenXrNative:V CS-OpenXrFace:V CS-OpenXrEgl:V *:S 2>&1 | Out-File -FilePath $out -Append -Encoding utf8

Write-Host "Appended filtered logcat to $out"
Write-Host "Tip: open the app, reproduce, then run this script again and share logs/apk-logcat.txt (or commit a copy for the assistant to read)."
