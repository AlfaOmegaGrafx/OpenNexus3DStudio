/**
 * Vana Data Collection Manager
 * 
 * Integrates with Vana's decentralized data collection protocol for motion capture tracking data.
 * Vana enables users to own, control, and monetize their data while providing a marketplace
 * for AI training data.
 * 
 * Documentation: https://docs.vana.org/docs/home
 * Website: https://www.vana.org/
 * Gelato Relay: https://docs.vana.org/docs/gelato-relay
 */

export class VanaDataManager {
  constructor(config = {}) {
    this.apiKey = config.apiKey || import.meta.env.VITE_VANA_API_KEY;
    this.apiUrl = config.apiUrl || 'https://api.vana.org/v1';
    this.gelatoRelayUrl = config.gelatoRelayUrl || 'https://relay.gelato.network';
    this.walletAddress = config.walletAddress;
    console.log("VanaDataManager initialized.");
  }

  /**
   * Initialize connection to Vana protocol
   */
  async initialize() {
    try {
      // Connect to Vana data marketplace
      // This would involve wallet connection and protocol setup
      console.log("Initializing Vana data collection protocol...");
      return { success: true, message: "Vana protocol initialized." };
    } catch (error) {
      console.error("Error initializing Vana:", error);
      throw error;
    }
  }

  /**
   * Create a data collection pool for motion capture tracking data
   * @param {Object} poolConfig - Configuration for the data pool
   * @param {string} poolConfig.name - Name of the data pool
   * @param {string} poolConfig.description - Description of the data pool
   * @param {string} poolConfig.dataType - Type of data (e.g., 'motion-capture', 'imu-tracking')
   * @param {Object} poolConfig.metadata - Additional metadata
   */
  async createDataPool(poolConfig) {
    try {
      const response = await fetch(`${this.apiUrl}/pools`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(poolConfig),
      });

      if (!response.ok) {
        throw new Error(`Failed to create data pool: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Data pool created:", data);
      return data;
    } catch (error) {
      console.error("Error creating data pool:", error);
      throw error;
    }
  }

  /**
   * Submit motion capture tracking data to Vana
   * @param {Object} trackingData - Motion capture data from Mbient Labs sensors
   * @param {string} poolId - ID of the data pool to submit to
   * @param {Object} metadata - Additional metadata about the data
   */
  async submitTrackingData(trackingData, poolId, metadata = {}) {
    try {
      const payload = {
        poolId,
        data: trackingData,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          source: 'motion-capture-system',
          sensorCount: 9, // 9 body IMUs: 6 Mbient Labs + 1 XR HMD IMU + 2 Tap Strap 2 thumb IMUs
          fingerAccelerometers: 10, // 10 finger accelerometers: 5 per hand from Tap Strap 2
          dataFormat: 'json',
        },
      };

      const response = await fetch(`${this.apiUrl}/data/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to submit data: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Tracking data submitted to Vana:", data);
      return data;
    } catch (error) {
      console.error("Error submitting tracking data:", error);
      throw error;
    }
  }

  /**
   * List available data pools for motion capture data
   */
  async listDataPools() {
    try {
      const response = await fetch(`${this.apiUrl}/pools`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to list data pools: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error listing data pools:", error);
      throw error;
    }
  }

  /**
   * Query data from a specific pool
   * @param {string} poolId - ID of the data pool
   * @param {Object} queryParams - Query parameters (filters, pagination, etc.)
   */
  async queryDataPool(poolId, queryParams = {}) {
    try {
      const queryString = new URLSearchParams(queryParams).toString();
      const response = await fetch(`${this.apiUrl}/pools/${poolId}/data?${queryString}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to query data pool: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error querying data pool:", error);
      throw error;
    }
  }

  /**
   * Use Gelato Relay for gasless transactions (if needed for blockchain operations)
   * @param {Object} transaction - Transaction data
   */
  async relayTransaction(transaction) {
    try {
      const response = await fetch(`${this.gelatoRelayUrl}/relay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transaction),
      });

      if (!response.ok) {
        throw new Error(`Failed to relay transaction: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error relaying transaction:", error);
      throw error;
    }
  }

  /**
   * Get user's data ownership and earnings
   */
  async getUserDataStats() {
    try {
      const response = await fetch(`${this.apiUrl}/user/stats`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get user stats: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error getting user stats:", error);
      throw error;
    }
  }
}

