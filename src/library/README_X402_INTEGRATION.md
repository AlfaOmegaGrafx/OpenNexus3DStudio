# x402 Protocol & Thirdweb Wallet Integration

This document describes the integrated x402 payment protocol and Thirdweb wallet solutions in Character Studio.

## Overview

Character Studio now supports:
1. **Base x402 Protocol** - Native Base network micropayments ($0.001-0.005 per request)
2. **Thirdweb x402 Facilitator** - Multi-chain micropayments (170+ EVM chains + Solana)
3. **Thirdweb Smart Wallets** - ERC-4337 Account Abstraction with gas sponsorship
4. **Thirdweb In-App Wallets** - Seamless onboarding (email, social, phone, passkey)

## Architecture

### Base x402 Manager (`baseX402Manager.js`)
- Handles native Base network x402 payments
- Uses `@coinbase/x402-sdk` (when available)
- Supports USDC micropayments with EIP-3009 gasless transactions
- XMTP agent integration for autonomous payments

### Thirdweb x402 Manager (`thirdwebX402Manager.js`)
- Multi-chain x402 facilitator service
- Supports Base, Ethereum, Polygon, Solana, and 170+ EVM chains
- Unified APIs: `/accepts`, `/verify`, `/settle`, `/fetch`
- Facilitator wallet management for server-side payments

### Unified Payment Handler (`x402PaymentHandler.js`)
- Integrates both Base and Thirdweb x402 solutions
- Provides unified interface for payment processing
- Handles HTTP 402 responses from APIs
- Supports both native Base and multi-chain payments

### Thirdweb Smart Wallet (`thirdwebSmartWallet.js`)
- ERC-4337 Account Abstraction implementation
- Gas sponsorship for user transactions
- Batch transaction support
- Session keys for enhanced security
- Predictable addresses across chains

### Thirdweb In-App Wallet (`thirdwebInAppWallet.js`)
- Email authentication
- Social login (Google, Apple, etc.)
- Phone number authentication
- Passkey support
- No external wallet extensions required

## Usage Examples

### Connecting with Thirdweb Smart Wallet

```javascript
import { connectWallet } from './library/mint-utils';

// Connect with Smart Wallet (gas sponsored)
const address = await connectWallet('base', 'thirdweb-smart');
```

### Connecting with In-App Wallet

```javascript
// Connect with In-App Wallet (email/social)
const address = await connectWallet('base', 'thirdweb-inapp');
```

### Creating x402 Payment Request

```javascript
import X402PaymentHandler from './library/x402PaymentHandler';

const handler = new X402PaymentHandler({
  defaultProvider: 'thirdweb', // or 'base'
  chain: 'base'
});

await handler.initialize();

const paymentRequest = await handler.createPaymentRequest({
  service: 'text-to-3d',
  amount: '0.001'
});
```

### Processing x402 Payment

```javascript
// Handle 402 response from API
const response = await fetch('https://api.example.com/premium-endpoint');
if (response.status === 402) {
  const requirements = await handler.handle402Response(response);
  
  // Get user to sign payment
  const signedPayload = await signPayment(requirements);
  
  // Verify and settle
  const result = await handler.completePayment({
    signedPayload,
    paymentRequirements: requirements
  });
}
```

## Environment Variables

Add these to your `.env` file:

```env
# Thirdweb Configuration
VITE_THIRDWEB_CLIENT_ID=your_client_id
VITE_THIRDWEB_SECRET_KEY=your_secret_key

# Base x402 Configuration
VITE_BASE_X402_API_KEY=your_base_api_key

# Existing variables
VITE_OPENSEA_KEY=your_opensea_key
VITE_HELIUS_KEY=your_helius_key
```

## Integration Points

### AccountContext
- `walletType`: Tracks wallet type ('metamask', 'thirdweb-smart', 'thirdweb-inapp', 'phantom')
- `chain`: Current blockchain network
- `x402Enabled`: Whether x402 is available for current chain
- `smartWalletFeatures`: Gas sponsorship, batch transactions, session keys status

### mint-utils.js
- Updated `connectWallet()` to support Base network and Thirdweb wallets
- Updated `fetchOwnedNFTs()` to support Base network

### Contract.jsx
- Added Base and Base Sepolia chain configurations

## Benefits

1. **Lower Micropayment Costs**: Base x402 enables $0.001-0.005 payments vs $0.10-1.00
2. **Multi-Chain Support**: Thirdweb facilitator supports 170+ chains
3. **Better UX**: Smart wallets sponsor gas, In-App wallets eliminate extension requirements
4. **Autonomous Agents**: x402 enables machine-to-machine payments
5. **Seamless Onboarding**: In-App wallets use familiar authentication methods

## Next Steps

1. Implement x402 payment flows for AI services (text-to-3D, image-to-3D)
2. Add x402 payment requirements to ComfyUI workflows
3. Integrate x402 for premium content access
4. Test on Base testnet before mainnet deployment
5. Add UI components for wallet selection and payment flows

## Resources

- [Base x402 Documentation](https://docs.base.org/base-app/agents/x402-agents)
- [Thirdweb x402 Documentation](https://portal.thirdweb.com/x402)
- [Thirdweb Smart Wallets](https://portal.thirdweb.com/typescript/v5/smartWallet)
- [Thirdweb In-App Wallets](https://thirdweb.com/connect)

