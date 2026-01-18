// Update Playwright MCP Extension Token
// Run this script with: node scripts/update-playwright-token.js <your-token>

const fs = require('fs');
const path = require('path');
const os = require('os');

const newToken = process.argv[2];

if (!newToken) {
  console.log('❌ Error: Please provide the token as an argument');
  console.log('');
  console.log('Usage: node scripts/update-playwright-token.js <your-token>');
  console.log('');
  console.log('To find your token:');
  console.log('1. Open Chrome/Edge');
  console.log('2. Click the Playwright MCP Bridge extension icon');
  console.log('3. Copy the PLAYWRIGHT_MCP_EXTENSION_TOKEN value');
  console.log('4. Run this script with that token');
  process.exit(1);
}

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

// Update or create playwright-extension configuration
if (!config.mcpServers['playwright-extension']) {
  config.mcpServers['playwright-extension'] = {
    command: 'npx',
    args: ['@playwright/mcp@latest', '--extension'],
    env: {}
  };
}

// Update the token
config.mcpServers['playwright-extension'].env.PLAYWRIGHT_MCP_EXTENSION_TOKEN = newToken;

// Save the updated configuration
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

console.log('✅ Playwright MCP Extension token updated successfully!');
console.log(`   Configuration saved to: ${configPath}`);
console.log('');
console.log('📋 Next steps:');
console.log('   1. Restart Cursor IDE to load the new configuration');
console.log('   2. The connection should now work with the new token');
