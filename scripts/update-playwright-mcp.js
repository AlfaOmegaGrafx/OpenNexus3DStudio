// Update Playwright MCP Extension Configuration
// This script updates the MCP configuration to use the extension with token authentication

const fs = require('fs');
const path = require('path');
const os = require('os');

const configPath = path.join(os.homedir(), '.cursor', 'mcp.json');

console.log(`Reading MCP configuration from: ${configPath}`);

let config;
if (fs.existsSync(configPath)) {
  const configContent = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configContent);
} else {
  console.log('Creating new MCP configuration file...');
  config = { mcpServers: {} };
}

// Remove old Playwright entry if it exists
if (config.mcpServers.Playwright) {
  console.log("Removing old 'Playwright' entry...");
  delete config.mcpServers.Playwright;
}

// Add/Update playwright-extension configuration (token from env — never hardcode)
const token = process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN;
if (!token) {
  console.error('Set PLAYWRIGHT_MCP_EXTENSION_TOKEN in your environment, then re-run this script.');
  process.exit(1);
}
config.mcpServers['playwright-extension'] = {
  command: 'npx',
  args: [
    '@playwright/mcp@latest',
    '--extension'
  ],
  env: {
    PLAYWRIGHT_MCP_EXTENSION_TOKEN: token
  }
};

// Save the updated configuration
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

console.log('✅ Playwright MCP Extension configuration updated successfully!');
console.log(`   Configuration saved to: ${configPath}`);
console.log('');
console.log('📋 Next steps:');
console.log('   1. Restart Cursor IDE to load the new configuration');
console.log('   2. The connection approval dialog should now be bypassed');
