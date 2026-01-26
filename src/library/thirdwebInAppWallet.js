/**
 * Thirdweb In-App Wallet Manager
 * Handles wallet creation and authentication using email, phone, social logins, and passkeys
 * Simplifies onboarding by eliminating need for external wallet extensions
 */

import { createThirdwebClient } from 'thirdweb';
import { createWallet, inAppWallet } from 'thirdweb/wallets';
import { defineChain } from 'thirdweb/chains';

export class ThirdwebInAppWalletManager {
  constructor(config = {}) {
    this.config = {
      clientId: config.clientId || import.meta.env.VITE_THIRDWEB_CLIENT_ID,
      chain: config.chain || 'base',
      authOptions: config.authOptions || ['email', 'google', 'apple', 'phone', 'passkey'],
      ...config
    };
    this.client = null;
    this.wallet = null;
    this.account = null;
  }

  /**
   * Initialize Thirdweb client
   */
  async initialize() {
    try {
      this.client = createThirdwebClient({
        clientId: this.config.clientId
      });

      // Define Base chain
      const baseChain = defineChain({
        id: 8453,
        name: 'Base',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpc: 'https://mainnet.base.org'
      });

      this.chain = baseChain;
      return true;
    } catch (error) {
      console.error('Failed to initialize Thirdweb client:', error);
      return false;
    }
  }

  /**
   * Create in-app wallet with email authentication
   * @param {string} email - User email
   * @returns {Promise<string>} Wallet address
   */
  async createWalletWithEmail(email) {
    if (!this.client) {
      await this.initialize();
    }

    try {
      this.wallet = createWallet('inApp', {
        client: this.client,
        chain: this.chain
      });

      const account = await this.wallet.connect({
        client: this.client,
        strategy: 'email',
        email: email
      });

      this.account = account;
      return account.address;
    } catch (error) {
      console.error('Failed to create wallet with email:', error);
      throw error;
    }
  }

  /**
   * Create in-app wallet with social login
   * @param {string} provider - Social provider ('google', 'apple', etc.)
   * @returns {Promise<string>} Wallet address
   */
  async createWalletWithSocial(provider) {
    if (!this.client) {
      await this.initialize();
    }

    try {
      this.wallet = createWallet('inApp', {
        client: this.client,
        chain: this.chain
      });

      const account = await this.wallet.connect({
        client: this.client,
        strategy: provider
      });

      this.account = account;
      return account.address;
    } catch (error) {
      console.error('Failed to create wallet with social login:', error);
      throw error;
    }
  }

  /**
   * Create in-app wallet with phone number
   * @param {string} phoneNumber - User phone number
   * @returns {Promise<string>} Wallet address
   */
  async createWalletWithPhone(phoneNumber) {
    if (!this.client) {
      await this.initialize();
    }

    try {
      this.wallet = createWallet('inApp', {
        client: this.client,
        chain: this.chain
      });

      const account = await this.wallet.connect({
        client: this.client,
        strategy: 'phone',
        phoneNumber: phoneNumber
      });

      this.account = account;
      return account.address;
    } catch (error) {
      console.error('Failed to create wallet with phone:', error);
      throw error;
    }
  }

  /**
   * Create in-app wallet with passkey
   * @returns {Promise<string>} Wallet address
   */
  async createWalletWithPasskey() {
    if (!this.client) {
      await this.initialize();
    }

    try {
      this.wallet = createWallet('inApp', {
        client: this.client,
        chain: this.chain
      });

      const account = await this.wallet.connect({
        client: this.client,
        strategy: 'passkey'
      });

      this.account = account;
      return account.address;
    } catch (error) {
      console.error('Failed to create wallet with passkey:', error);
      throw error;
    }
  }

  /**
   * Show in-app wallet connection modal
   * @param {Object} options - Connection options
   * @returns {Promise<string>} Wallet address
   */
  async showConnectionModal(options = {}) {
    if (!this.client) {
      await this.initialize();
    }

    try {
      this.wallet = createWallet('inApp', {
        client: this.client,
        chain: this.chain,
        auth: {
          options: options.authOptions || this.config.authOptions
        }
      });

      const account = await this.wallet.connect({
        client: this.client,
        strategy: 'inApp'
      });

      this.account = account;
      return account.address;
    } catch (error) {
      console.error('Failed to show connection modal:', error);
      throw error;
    }
  }

  /**
   * Get wallet address
   * @returns {string|null} Wallet address
   */
  getAddress() {
    return this.account?.address || null;
  }

  /**
   * Check if wallet is connected
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.account !== null;
  }

  /**
   * Disconnect wallet
   */
  async disconnect() {
    if (this.wallet) {
      await this.wallet.disconnect();
      this.wallet = null;
      this.account = null;
    }
  }

  /**
   * Get wallet balance
   * @returns {Promise<string>} Balance in ETH
   */
  async getBalance() {
    if (!this.account) {
      throw new Error('Wallet not connected');
    }

    try {
      const balance = await this.client.getBalance({
        address: this.account.address,
        chain: this.chain
      });

      return balance.toString();
    } catch (error) {
      console.error('Failed to get balance:', error);
      throw error;
    }
  }

  /**
   * Check if user has existing wallet
   * @param {string} identifier - Email, phone, or user identifier
   * @returns {Promise<boolean>} Whether wallet exists
   */
  async hasExistingWallet(identifier) {
    if (!this.client) {
      await this.initialize();
    }

    try {
      // Thirdweb handles wallet recovery automatically
      // This is a placeholder for checking wallet existence
      return false;
    } catch (error) {
      console.error('Failed to check wallet existence:', error);
      return false;
    }
  }
}

export default ThirdwebInAppWalletManager;

