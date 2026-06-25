# Sync local @iwsdk/* tgz into OpenNexus3DStudio (Windows-native).
# Usage: .\scripts\link-iwsdk-local.ps1
#        .\scripts\link-iwsdk-local.ps1 -Rebuild

param([switch]$Rebuild)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$IwsdkRoot = Join-Path (Split-Path -Parent $Root) "immersive-web-sdk"

if (-not (Test-Path (Join-Path $IwsdkRoot "packages\core"))) {
    Write-Host "Cloning immersive-web-sdk..."
    git clone https://github.com/AlfaOmegaGrafx/immersive-web-sdk.git $IwsdkRoot
}

Set-Location $IwsdkRoot
Write-Host "Building IWSDK tgz packages..."
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm install
    npm run build:tgz:skip-reference-assets
} else {
    npm install
    npm run build:tgz:skip-reference-assets
}

Set-Location $Root
Write-Host "Installing local @iwsdk/* into OpenNexus3DStudio..."
npm install
Write-Host "Done."
