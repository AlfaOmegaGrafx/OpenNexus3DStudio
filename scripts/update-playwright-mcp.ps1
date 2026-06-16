# Update Playwright MCP Extension Configuration
# This script updates the MCP configuration to use the extension with token authentication

$configPath = "$env:USERPROFILE\.cursor\mcp.json"

if (-not (Test-Path $configPath)) {
    Write-Host "Creating new MCP configuration file at: $configPath"
    $config = @{
        mcpServers = @{}
    }
} else {
    Write-Host "Reading existing MCP configuration from: $configPath"
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
}

# Remove old Playwright entry if it exists
if ($config.mcpServers.Playwright) {
    Write-Host "Removing old 'Playwright' entry..."
    $config.mcpServers.PSObject.Properties.Remove('Playwright')
}

# Add/Update playwright-extension configuration (token from env — never hardcode)
$token = $env:PLAYWRIGHT_MCP_EXTENSION_TOKEN
if (-not $token) {
    Write-Error "Set PLAYWRIGHT_MCP_EXTENSION_TOKEN in your environment, then re-run this script."
    exit 1
}
$config.mcpServers.'playwright-extension' = @{
    command = 'npx'
    args = @(
        '@playwright/mcp@latest',
        '--extension'
    )
    env = @{
        PLAYWRIGHT_MCP_EXTENSION_TOKEN = $token
    }
}

# Save the updated configuration
$config | ConvertTo-Json -Depth 10 | Set-Content $configPath

Write-Host "✅ Playwright MCP Extension configuration updated successfully!"
Write-Host "   Configuration saved to: $configPath"
Write-Host ""
Write-Host "📋 Next steps:"
Write-Host "   1. Restart Cursor IDE to load the new configuration"
Write-Host "   2. The connection approval dialog should now be bypassed"
