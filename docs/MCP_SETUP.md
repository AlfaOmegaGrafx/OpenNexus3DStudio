# MCP Server Setup Guide

This guide explains how to set up and configure MCP (Model Context Protocol) servers for use with Cursor IDE.

## ThirdWeb MCP Server Integration

ThirdWeb provides an MCP server that enables blockchain operations through natural language commands in Cursor.

### Prerequisites

1. A ThirdWeb account
2. A ThirdWeb project with a secret key
3. Cursor IDE installed

### Step 1: Obtain Your ThirdWeb Secret Key

1. Log in to your [ThirdWeb Dashboard](https://thirdweb.com/dashboard)
2. Navigate to your project settings
3. Find your **Project Secret Key**
4. **Important**: Keep this key confidential and never commit it to version control

### Step 2: Configure ThirdWeb MCP Server in Cursor

#### Option A: Using Cursor Settings UI (Recommended)

1. Open Cursor IDE
2. Go to **Settings** (Ctrl+, or Cmd+,)
3. Navigate to **Tools & MCP** section
4. Click **"New MCP Server"** or find **"thirdweb-api"** in the installed servers
5. Add the following configuration:
   - **Name**: `thirdweb-api`
   - **URL**: `https://api.thirdweb.com/mcp?secretKey=YOUR_SECRET_KEY_HERE`
     - Replace `YOUR_SECRET_KEY_HERE` with your actual ThirdWeb secret key

**Important**: If you configure via the UI, you don't need a `.cursor/mcp.json` file. Using both will create duplicate entries.

#### Option B: Using Configuration File (Alternative)

If you prefer file-based configuration, add the following to your `.cursor/mcp.json` file (replace `YOUR_SECRET_KEY_HERE` with your thirdweb secret key):

```json
{
  "mcpServers": {
    "thirdweb-api": {
      "url": "https://api.thirdweb.com/mcp?secretKey=YOUR_SECRET_KEY_HERE"
    }
  }
}
```

**Note**: Use either the UI configuration OR the file-based configuration, not both. If the `.cursor` directory doesn't exist, create it first.

### Step 3: Optional - Specify Specific Tools

By default, all ThirdWeb tools are available. To limit which tools are accessible, append them to the URL:

```
https://api.thirdweb.com/mcp?secretKey=YOUR_SECRET_KEY&tools=fetchWithPayment,getWalletBalance,createWallet
```

### Available ThirdWeb Tools

The ThirdWeb MCP server provides the following tools (as listed in the [official documentation](https://portal.thirdweb.com/ai/mcp)):

- `initiateAuthentication`
- `completeAuthentication`
- `linkAuthentication`
- `unlinkAuthentication`
- `getMyWallet`
- `listUserWallets`
- `createUserWallet`
- `listServerWallets`
- `createServerWallet`
- `getWalletBalance`
- `getWalletTransactions`
- `getWalletTokens`
- `getWalletNFTs`
- `signMessage`
- `signTypedData`
- `sendTokens`
- `listContracts`
- `deployContract`
- `readContract`
- `writeContract`
- `getContractTransactions`
- `getContractEvents`
- `getContractMetadata`
- `getContractSignatures`
- `getTransactionById`
- `listTransactions`
- `sendTransactions`
- `createPayment`
- `paymentsPurchase`
- `getPaymentHistory`
- `fetchWithPayment`
- `listPayableServices`
- `createToken`
- `listTokens`
- `getTokenOwners`
- `getBridgeChains`
- `convertFiatToCrypto`
- `bridgeSwap`
- `chat`

### Step 4: Test the Integration

After configuration, test the integration by asking Cursor to:

1. "List my server wallets"
2. "Create a server wallet called 'treasury'"
3. "What's the balance of treasury wallet?"
4. "List my contracts"
5. "Approve 100 USDC from treasury wallet to executor wallet"

### Security Best Practices

1. **Never commit secrets**: Add `.env` files and configuration files with secrets to `.gitignore`
2. **Use environment variables**: Store secret keys in environment variables rather than hardcoding them
3. **Rotate keys regularly**: Periodically rotate your ThirdWeb secret keys
4. **Limit tool access**: Only enable the tools you actually need

### Troubleshooting

#### MCP Server Not Connecting

1. Verify your secret key is correct
2. Check your internet connection
3. Ensure the URL format is correct (no extra spaces or characters)
4. Check Cursor's MCP logs for error messages

#### Tools Not Available

1. Verify the tools are included in the URL if you specified a tool list
2. Check that your ThirdWeb account has the necessary permissions
3. Ensure your project is active in the ThirdWeb dashboard

### Additional Resources

- [ThirdWeb AI Documentation](https://portal.thirdweb.com/ai/mcp)
- [ThirdWeb Dashboard](https://thirdweb.com/dashboard)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)

### Configuration Template

A configuration template is available at `.cursor/mcp.json`. This matches the format specified in the [official ThirdWeb documentation](https://portal.thirdweb.com/ai/mcp).

**Note**: Make sure to replace `YOUR_SECRET_KEY_HERE` with your actual ThirdWeb secret key. Never commit this file with your real secret key to version control.

