# Run once: adds a login task that repairs ~/.ssh/config after reboot.
$script = Join-Path $PSScriptRoot "ensure-dgx-ssh-config.ps1"
$startup = [Environment]::GetFolderPath("Startup")
$shortcut = Join-Path $startup "Ensure-DGX-SSH.lnk"

$wsh = New-Object -ComObject WScript.Shell
$link = $wsh.CreateShortcut($shortcut)
$link.TargetPath = "powershell.exe"
$link.Arguments = "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$script`""
$link.WorkingDirectory = $PSScriptRoot
$link.Description = "Keep DGX Spark SSH config valid after reboot"
$link.Save()

Write-Host "Startup guard installed: $shortcut" -ForegroundColor Green
