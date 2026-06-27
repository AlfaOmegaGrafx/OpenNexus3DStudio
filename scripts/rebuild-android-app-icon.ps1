# Rebuild OpenNexus XR Face launcher icon from raw/ic_app_icon.svg (no vector conversion).
#
# Edit: native/android-xr-face-bridge/app/src/main/res/raw/ic_app_icon.svg
# Output: native/android-xr-face-bridge/app/src/main/res/drawable/ic_app_icon.png
#
# -Scale is a literal multiplier on the drawn logo size (white 512x512 canvas):
#   1.0 = as large as possible (edge-to-edge fit)
#   0.5 = half that size (50% smaller = literally half)
#   0.9 = 90% of edge-to-edge (10% smaller)
#
# Usage (from repo root):
#   .\scripts\rebuild-android-app-icon.ps1 -Scale 1 -Install
#   .\scripts\rebuild-android-app-icon.ps1 -Scale 0.5 -Install   # half size

param(
    [double]$Scale = 1.0,
    [int]$CanvasSize = 512,
    [switch]$Install
)

$ErrorActionPreference = 'Stop'
$bridgeRoot = Join-Path $PSScriptRoot '..\native\android-xr-face-bridge'
$resRoot = Join-Path $bridgeRoot 'app\src\main\res'
$svgPath = Join-Path $resRoot 'raw\ic_app_icon.svg'
$pngPath = Join-Path $resRoot 'drawable\ic_app_icon.png'

if (-not (Test-Path $svgPath)) {
    throw "Missing source SVG: $svgPath"
}

Add-Type -AssemblyName System.Drawing

$svg = [IO.File]::ReadAllText($svgPath)
if ($svg -notmatch 'href="data:image/png;base64,([^"]+)"') {
    throw "ic_app_icon.svg must contain an embedded PNG (data:image/png;base64,...)."
}

$bytes = [Convert]::FromBase64String($matches[1])
$ms = New-Object IO.MemoryStream(,$bytes)
try {
    $src = [System.Drawing.Bitmap]::FromStream($ms)
} finally {
    $ms.Dispose()
}

$srcW = $src.Width
$srcH = $src.Height
$fit = [Math]::Min($CanvasSize / $srcW, $CanvasSize / $srcH)
$drawScale = $fit * $Scale
$drawW = [int][Math]::Round($srcW * $drawScale)
$drawH = [int][Math]::Round($srcH * $drawScale)
$dx = [int][Math]::Round(($CanvasSize - $drawW) / 2.0)
$dy = [int][Math]::Round(($CanvasSize - $drawH) / 2.0)

$out = New-Object System.Drawing.Bitmap $CanvasSize, $CanvasSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($out)
try {
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle $dx, $dy, $drawW, $drawH), 0, 0, $srcW, $srcH, [System.Drawing.GraphicsUnit]::Pixel)
} finally {
    $g.Dispose()
    $src.Dispose()
}

$out.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()

Write-Host "OK ic_app_icon.png (${CanvasSize}x${CanvasSize} white, Scale=$Scale)"
Write-Host "   source ${srcW}x${srcH} -> draw ${drawW}x${drawH} at ($dx,$dy)"
Write-Host "   $pngPath"

if (-not $Install) {
    Write-Host ""
    Write-Host "Next: cd native\android-xr-face-bridge; .\gradlew.bat :app:assembleDebug"
    Write-Host "      adb uninstall com.opennexus3dstudio.xrfacebridge"
    Write-Host "      adb install app\build\outputs\apk\debug\app-debug.apk"
    exit 0
}

$javaHome = 'C:\Program Files\Android\Android Studio\jbr'
if (-not (Test-Path $javaHome)) { throw "JDK not found at $javaHome" }
$env:JAVA_HOME = $javaHome
if (-not $env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME = 'C:\gradle' }

Push-Location $bridgeRoot
try {
    & .\gradlew.bat :app:assembleDebug --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "Gradle assembleDebug failed ($LASTEXITCODE)" }
} finally {
    Pop-Location
}

$apk = Join-Path $bridgeRoot 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) { throw "APK not found: $apk" }

adb uninstall com.opennexus3dstudio.xrfacebridge | Out-Null
adb install $apk
if ($LASTEXITCODE -ne 0) { throw "adb install failed ($LASTEXITCODE)" }

Write-Host "Installed com.opennexus3dstudio.xrfacebridge (launcher icon should update)."
