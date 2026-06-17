# Sign-in guard: Cursor uses cursor-config (2 hosts). Sync uses Include + its own ssh_config.

$ErrorActionPreference = "Stop"
$cursorConfig = Join-Path $env:USERPROFILE ".ssh\cursor-config"
$mainConfig = Join-Path $env:USERPROFILE ".ssh\config"
$cursorTemplate = Join-Path $PSScriptRoot "dgx-spark.ssh.config"
$syncTemplate = Join-Path $PSScriptRoot "nvidia-sync-ssh.config"
$syncSshConfig = "$env:LOCALAPPDATA\NVIDIA Corporation\Sync\config\ssh_config"
$includeLine = 'Include "C:/Users/alfao/AppData/Local/NVIDIA Corporation/Sync/config/ssh_config"'

if (-not (Test-Path $cursorTemplate)) { exit 0 }

$dir = Split-Path $cursorConfig -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
attrib -R $cursorConfig 2>$null | Out-Null
attrib -R $mainConfig 2>$null | Out-Null

Copy-Item -Path $cursorTemplate -Destination $cursorConfig -Force
Set-Content -Path $mainConfig -Value $includeLine -Encoding ASCII

if (Test-Path $syncTemplate) {
    $syncDir = Split-Path $syncSshConfig -Parent
    if (-not (Test-Path $syncDir)) { New-Item -ItemType Directory -Path $syncDir -Force | Out-Null }
    Copy-Item -Path $syncTemplate -Destination $syncSshConfig -Force
}
