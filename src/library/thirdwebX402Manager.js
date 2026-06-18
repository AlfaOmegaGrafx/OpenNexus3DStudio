/**
 * Thirdweb x402 Protocol Manager
 * Handles x402 micropayments via Thirdweb's facilitator service
 * Supports both Solana and EVM chains (170+ chains including Base)
 */

const THIRDWEB_API_BASE = 'https://api.thirdweb.com/v1';

export class ThirdwebX402Manager {
  constructor(config = {}) {
    this.config = {
      secretKey: config.secretKey || import.meta.env.VITE_THIRDWEB_SECRET_KEY,
      chain: config.chain || 'base', // Default to Base
      ...config
    };
    this.facilitatorWallet = null;
  }

  /**
   * Create or get facilitator wallet for Solana
   * @param {string} label - Wallet label
   * @returns {Promise<Object>} Wallet information
   */
  async createSolanaFacilitatorWallet(label = 'spacetime-solana-facilitator') {
    try {
      const response = await fetch(
        `${THIRDWEB_API_BASE}/solana/wallets`,
        {
          method: 'POST',
          headers: {
            'x-secret-key': this.config.secretKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ label }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create Solana wallet: ${response.statusText}`);
      }

      const data = await response.json();
      this.facilitatorWallet = data.result;
      return this.facilitatorWallet;
    } catch (error) {
      console.error('Failed to create Solana facilitator wallet:', error);
      throw error;
    }
  }

  /**
   * Get payment quote using /v1/payments/x402/accepts
   * @param {Object} paymentRequirements - Payment requirements
   * @returns {Promise<Object>} Payment quote
   */
  async getPaymentQuote(paymentRequirements) {
    try {
      const response = await fetch(
        `${THIRDWEB_API_BASE}/payments/x402/accepts`,
        {
          method: 'POST',
          headers: {
            'x-secret-key': this.config.secretKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(paymentRequirements),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get payment quote: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get payment quote:', error);
      throw error;
    }
  }

  /**
   * Verify payment payload using /v1/payments/x402/verify
   * @param {Object} params - Verification parameters
   * @param {Object} params.paymentPayload - Signed payment payload
   * @param {Object} params.paymentRequirements - Payment requirements
   * @returns {Promise<Object>} Verification result
   */
  async verifyPayment({ paymentPayload, paymentRequirements }) {
    try {
      const response = await fetch(
        `${THIRDWEB_API_BASE}/payments/x402/verify`,
        {
          method: 'POST',
          headers: {
            'x-secret-key': this.config.secretKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentPayload,
            paymentRequirements,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to verify payment: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        isValid: data.isValid || false,
        details: data
      };
    } catch (error) {
      console.error('Failed to verify payment:', error);
      return { isValid: false, error: error.message };
    }
  }

  /**
   * Settle payment transaction using /v1/payments/x402/settle
   * @param {Object} params - Settlement parameters
   * @param {Object} params.paymentPayload - Signed payment payload
   * @param {Object} params.paymentRequirements - Payment requirements
   * @param {string} params.waitUntil - 'submitted' or 'confirmed'
   * @returns {Promise<Object>} Settlement result
   */
  async settlePayment({ paymentPayload, paymentRequirements, waitUntil = 'submitted' }) {
    try {
      const response = await fetch(
        `${THIRDWEB_API_BASE}/payments/x402/settle`,
        {
          method: 'POST',
          headers: {
            'x-secret-key': this.config.secretKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentPayload,
            paymentRequirements,
            waitUntil,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to settle payment: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        transaction: data.transaction,
        signature: data.transaction?.signature || data.transactionHash,
        ...data
      };
    } catch (error) {
      console.error('Failed to settle payment:', error);
      throw error;
    }
  }

  /**
   * Fetch protected resource with x402 payment
   * @param {string} resourceUrl - URL of protected resource
   * @param {Object} paymentPayload - Signed payment payload
   * @returns {Promise<Response>} Resource response
   */
  async fetchProtectedResource(resourceUrl, paymentPayload) {
    try {
      const response = await fetch(
        `${THIRDWEB_API_BASE}/payments/x402/fetch`,
        {
          method: 'POST',
          headers: {
            'x-secret-key': this.config.secretKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: resourceUrl,
            paymentPayload,
          }),
        }
      );

      return response;
    } catch (error) {
      console.error('Failed to fetch protected resource:', error);
      throw error;
    }
  }

  /**
   * Handle HTTP 402 response from API
   * @param {Response} response - HTTP response with 402 status
   * @returns {Promise<Object>} Payment requirements
   */
  async handle402Response(response) {
    if (response.status !== 402) {
      throw new Error('Response is not a 402 Payment Required');
    }

    try {
      const paymentRequirements = await response.json();
      return {
        amount: paymentRequirements.amount,
        recipient: paymentRequirements.recipient,
        token: paymentRequirements.token || 'USDC',
        chain: paymentRequirements.chain || this.config.chain,
        description: paymentRequirements.description,
        ...paymentRequirements
      };
    } catch (error) {
      console.error('Failed to parse 402 response:', error);
      throw error;
    }
  }

  /**
   * Create payment request for AI service
   * @param {Object} params - Payment parameters
   * @param {string} params.service - Service identifier (e.g., 'text-to-3d', 'image-to-3d')
   * @param {string} params.amount - Payment amount
   * @param {string} params.chain - Target chain
   * @returns {Promise<Object>} Payment requirements
   */
  async createPaymentRequest({ service, amount, chain = this.config.chain }) {
    const paymentRequirements = {
      amount,
      chain,
      token: 'USDC',
      description: `Payment for ${service} service`,
      metadata: {
        service,
        timestamp: Date.now()
      }
    };

    // Get quote from Thirdweb
    const quote = await this.getPaymentQuote(paymentRequirements);
    
    return {
      ...paymentRequirements,
      quote,
      paymentId: `tw-x402-${Date.now()}`
    };
  }
}

export default ThirdwebX402Manager;

