/**
 * Unified x402 Payment Handler
 * Integrates Base x402 and Thirdweb x402 for seamless micropayments
 * Supports both Base network and Thirdweb's multi-chain x402 facilitator
 */

import BaseX402Manager from './baseX402Manager';
import ThirdwebX402Manager from './thirdwebX402Manager';

export class X402PaymentHandler {
  constructor(config = {}) {
    this.config = {
      defaultProvider: config.defaultProvider || 'thirdweb', // 'base' or 'thirdweb'
      chain: config.chain || 'base',
      ...config
    };
    
    this.baseManager = new BaseX402Manager({ network: this.config.chain });
    this.thirdwebManager = new ThirdwebX402Manager({ chain: this.config.chain });
    this.currentProvider = null;
  }

  /**
   * Initialize the payment handler
   */
  async initialize() {
    try {
      if (this.config.defaultProvider === 'base') {
        await this.baseManager.initialize();
        this.currentProvider = this.baseManager;
      } else {
        // Thirdweb is the default
        this.currentProvider = this.thirdwebManager;
      }
      return true;
    } catch (error) {
      console.error('Failed to initialize x402 payment handler:', error);
      return false;
    }
  }

  /**
   * Create payment request for AI service
   * @param {Object} params - Payment parameters
   * @param {string} params.service - Service identifier
   * @param {string} params.amount - Payment amount
   * @param {string} params.provider - Provider ('base' or 'thirdweb')
   * @returns {Promise<Object>} Payment request
   */
  async createPaymentRequest({ service, amount, provider = null }) {
    const useProvider = provider || this.config.defaultProvider;
    
    if (useProvider === 'base') {
      return await this.baseManager.createPaymentRequest({
        amount,
        recipient: this.config.recipient || '0x0000000000000000000000000000000000000000',
        description: `Payment for ${service} service`
      });
    } else {
      return await this.thirdwebManager.createPaymentRequest({
        service,
        amount,
        chain: this.config.chain
      });
    }
  }

  /**
   * Verify payment payload
   * @param {Object} paymentPayload - Signed payment payload
   * @param {Object} paymentRequirements - Payment requirements
   * @param {string} provider - Provider ('base' or 'thirdweb')
   * @returns {Promise<Object>} Verification result
   */
  async verifyPayment(paymentPayload, paymentRequirements = null, provider = null) {
    const useProvider = provider || this.config.defaultProvider;
    
    if (useProvider === 'base') {
      return await this.baseManager.verifyPayment(paymentPayload);
    } else {
      return await this.thirdwebManager.verifyPayment({
        paymentPayload,
        paymentRequirements: paymentRequirements || paymentPayload
      });
    }
  }

  /**
   * Settle payment transaction
   * @param {Object} paymentPayload - Signed payment payload
   * @param {Object} paymentRequirements - Payment requirements
   * @param {string} provider - Provider ('base' or 'thirdweb')
   * @returns {Promise<Object>} Settlement result
   */
  async settlePayment(paymentPayload, paymentRequirements = null, provider = null) {
    const useProvider = provider || this.config.defaultProvider;
    
    if (useProvider === 'base') {
      return await this.baseManager.settlePayment(paymentPayload);
    } else {
      return await this.thirdwebManager.settlePayment({
        paymentPayload,
        paymentRequirements: paymentRequirements || paymentPayload,
        waitUntil: 'confirmed'
      });
    }
  }

  /**
   * Handle HTTP 402 response from API
   * @param {Response} response - HTTP response
   * @returns {Promise<Object>} Payment requirements
   */
  async handle402Response(response) {
    if (response.status !== 402) {
      throw new Error('Response is not a 402 Payment Required');
    }

    // Try Thirdweb first (more comprehensive)
    try {
      return await this.thirdwebManager.handle402Response(response);
    } catch (error) {
      // Fallback to Base
      return await this.baseManager.handle402Response(response);
    }
  }

  /**
   * Process payment for AI service call
   * @param {Object} params - Payment parameters
   * @param {string} params.service - Service identifier
   * @param {string} params.amount - Payment amount
   * @param {Function} params.onPaymentRequired - Callback when payment is required
   * @returns {Promise<Object>} Payment result
   */
  async processServicePayment({ service, amount, onPaymentRequired }) {
    try {
      // Create payment request
      const paymentRequest = await this.createPaymentRequest({ service, amount });
      
      // Notify that payment is required
      if (onPaymentRequired) {
        await onPaymentRequired(paymentRequest);
      }

      // Return payment request for client to sign
      return {
        success: true,
        paymentRequest,
        message: 'Payment required for service access'
      };
    } catch (error) {
      console.error('Failed to process service payment:', error);
      throw error;
    }
  }

  /**
   * Complete payment flow for API call
   * @param {Object} params - Payment parameters
   * @param {Object} params.signedPayload - Signed payment payload from client
   * @param {Object} params.paymentRequirements - Original payment requirements
   * @returns {Promise<Object>} Payment completion result
   */
  async completePayment({ signedPayload, paymentRequirements }) {
    try {
      // Verify payment first
      const verification = await this.verifyPayment(signedPayload, paymentRequirements);
      
      if (!verification.isValid) {
        throw new Error('Payment verification failed');
      }

      // Settle payment
      const settlement = await this.settlePayment(signedPayload, paymentRequirements);
      
      return {
        success: true,
        verification,
        settlement,
        transactionHash: settlement.transactionHash || settlement.transaction?.signature
      };
    } catch (error) {
      console.error('Failed to complete payment:', error);
      throw error;
    }
  }
}

export default X402PaymentHandler;

