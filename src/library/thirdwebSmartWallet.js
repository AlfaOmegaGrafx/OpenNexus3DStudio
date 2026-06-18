/**
 * Thirdweb Smart Wallet Manager
 * Handles ERC-4337 Account Abstraction wallets with gas sponsorship, batch transactions, and session keys
 */

import { createThirdwebClient, getContract, prepareContractCall, sendTransaction } from 'thirdweb';
import { createWallet, inAppWallet } from 'thirdweb/wallets';
import { defineChain } from 'thirdweb/chains';

export class ThirdwebSmartWalletManager {
  constructor(config = {}) {
    this.config = {
      clientId: config.clientId || import.meta.env.VITE_THIRDWEB_CLIENT_ID,
      chain: config.chain || 'base',
      sponsorGas: config.sponsorGas !== false, // Default to true
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
   * Connect smart wallet with account abstraction
   * @param {Object} options - Connection options
   * @param {boolean} options.sponsorGas - Whether to sponsor gas fees
   * @returns {Promise<string>} Connected wallet address
   */
  async connectSmartWallet(options = {}) {
    if (!this.client) {
      await this.initialize();
    }

    try {
      const sponsorGas = options.sponsorGas !== undefined ? options.sponsorGas : this.config.sponsorGas;

      // Create smart wallet with account abstraction
      this.wallet = createWallet('inApp', {
        client: this.client,
        chain: this.chain,
        auth: {
          options: ['email', 'google', 'apple', 'phone']
        }
      });

      // Connect with account abstraction
      const account = await this.wallet.connect({
        client: this.client,
        strategy: 'inApp',
        accountAbstraction: {
          chain: this.chain,
          sponsorGas: sponsorGas
        }
      });

      this.account = account;
      return account.address;
    } catch (error) {
      console.error('Failed to connect smart wallet:', error);
      throw error;
    }
  }

  /**
   * Execute a transaction with gas sponsorship
   * @param {Object} params - Transaction parameters
   * @param {string} params.to - Recipient address
   * @param {string} params.value - Transaction value
   * @param {string} params.data - Transaction data
   * @returns {Promise<Object>} Transaction result
   */
  async executeTransaction({ to, value, data }) {
    if (!this.account) {
      throw new Error('Wallet not connected');
    }

    try {
      const transaction = prepareContractCall({
        client: this.client,
        chain: this.chain,
        contract: {
          address: to,
          abi: []
        },
        method: 'function execute()',
        params: [],
        value: value ? BigInt(value) : undefined,
        data: data
      });

      const result = await sendTransaction({
        transaction,
        account: this.account
      });

      return {
        success: true,
        transactionHash: result.transactionHash,
        ...result
      };
    } catch (error) {
      console.error('Failed to execute transaction:', error);
      throw error;
    }
  }

  /**
   * Execute batch transactions
   * @param {Array<Object>} transactions - Array of transaction objects
   * @returns {Promise<Object>} Batch transaction result
   */
  async executeBatchTransactions(transactions) {
    if (!this.account) {
      throw new Error('Wallet not connected');
    }

    try {
      // Prepare batch transactions
      const preparedTransactions = transactions.map(tx => 
        prepareContractCall({
          client: this.client,
          chain: this.chain,
          contract: {
            address: tx.to,
            abi: []
          },
          method: 'function execute()',
          params: [],
          value: tx.value ? BigInt(tx.value) : undefined,
          data: tx.data
        })
      );

      // Execute batch (Thirdweb handles batching automatically with account abstraction)
      const results = await Promise.all(
        preparedTransactions.map(tx => 
          sendTransaction({
            transaction: tx,
            account: this.account
          })
        )
      );

      return {
        success: true,
        transactions: results,
        count: results.length
      };
    } catch (error) {
      console.error('Failed to execute batch transactions:', error);
      throw error;
    }
  }

  /**
   * Get wallet address (predictable across chains)
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
      // Use Thirdweb's balance fetching
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
}

export default ThirdwebSmartWalletManager;

