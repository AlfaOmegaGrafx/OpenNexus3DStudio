/**
 * Mbient Labs MetaWear Manager
 * 
 * Manages integration with Mbient Labs MetaWear IMU sensors for motion capture tracking.
 * Supports connection to 6 Mbient Labs sensors (chest, waist, wrists, ankles) for full-body motion capture.
 * Total system: 7 sensors (6 Mbient Labs + 1 XR HMD IMU for head via Android XR SDK).
 * Data streaming and integration with Raspberry Pi, Android, and web platforms.
 * 
 * Documentation:
 * - Java/Android: https://mbientlab.com/tutorials/JaAndroid.html#java-tutorials
 * - Android Docs: https://mbientlab.com/androiddocs/latest/
 * - API Docs: https://mbientlab.com/documents/metawear/android/latest/
 * - GitHub: https://github.com/orgs/mbientlab/repositories
 * 
 * Hardware Support:
 * - MetaMotionRL (MMRL)
 * - MetaMotionS (MMS)
 * - 6 sensors for full-body tracking: chest, waist, left/right wrists, left/right ankles
 * - XR HMD IMU (head) via Android XR SDK (to be integrated separately)
 */

export class MbientLabsManager {
  constructor(config = {}) {
    this.sensors = new Map(); // Map of sensor MAC addresses to sensor objects
    this.maxSensors = config.maxSensors || 6; // Mbient Labs sensors: chest, waist, wrists (2), ankles (2) = 6 sensors
    this.totalSensors = 9; // Total body IMUs: 6 Mbient Labs + 1 XR HMD IMU (head) + 2 Tap Strap 2 thumb IMUs
    this.samplingRate = config.samplingRate || 25; // Hz
    this.connectionMode = config.connectionMode || 'bluetooth'; // 'bluetooth', 'raspberry-pi', 'web'
    this.raspberryPiUrl = config.raspberryPiUrl || 'http://localhost:8080';
    this.webhookUrl = config.webhookUrl;
    this.xrHmdImuEnabled = config.xrHmdImuEnabled || false; // XR HMD IMU integration (Android XR SDK - future)
    console.log("MbientLabsManager initialized.");
  }

  /**
   * Initialize connection to Mbient Labs sensors
   * Supports multiple connection modes: Bluetooth (Android/PC), Raspberry Pi gateway, Web
   */
  async initialize() {
    try {
      console.log("Initializing Mbient Labs MetaWear sensors...");
      
      if (this.connectionMode === 'raspberry-pi') {
        // Connect via Raspberry Pi gateway
        await this.initializeRaspberryPiConnection();
      } else if (this.connectionMode === 'web') {
        // Connect via Web Bluetooth API (if available)
        await this.initializeWebConnection();
      } else {
        // Default: Bluetooth connection (Android/PC)
        await this.initializeBluetoothConnection();
      }

      return { success: true, message: "Mbient Labs sensors initialized." };
    } catch (error) {
      console.error("Error initializing Mbient Labs sensors:", error);
      throw error;
    }
  }

  /**
   * Initialize Bluetooth connection (Android/PC)
   */
  async initializeBluetoothConnection() {
    try {
      // For Android: Use MetaWear Android SDK
      // For PC/Web: Use Web Bluetooth API or native Bluetooth stack
      console.log("Initializing Bluetooth connection for MetaWear sensors...");
      
      // Check if Web Bluetooth is available
      if (navigator.bluetooth) {
        console.log("Web Bluetooth API available");
        // Web Bluetooth implementation would go here
      } else {
        console.log("Web Bluetooth not available, using native Bluetooth");
        // Native Bluetooth implementation would go here
      }
    } catch (error) {
      console.error("Error initializing Bluetooth connection:", error);
      throw error;
    }
  }

  /**
   * Initialize Raspberry Pi gateway connection
   * Raspberry Pi acts as a gateway between sensors and the application
   */
  async initializeRaspberryPiConnection() {
    try {
      console.log("Initializing Raspberry Pi gateway connection...");
      
      // Connect to Raspberry Pi gateway service
      const response = await fetch(`${this.raspberryPiUrl}/api/sensors/status`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Failed to connect to Raspberry Pi gateway: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Raspberry Pi gateway connected:", data);
      return data;
    } catch (error) {
      console.error("Error connecting to Raspberry Pi gateway:", error);
      throw error;
    }
  }

  /**
   * Initialize Web connection (for webhooks/HTTP API)
   */
  async initializeWebConnection() {
    try {
      console.log("Initializing web connection for MetaWear sensors...");
      // Web-based connection via HTTP/WebSocket would go here
      return { success: true };
    } catch (error) {
      console.error("Error initializing web connection:", error);
      throw error;
    }
  }

  /**
   * Scan for available MetaWear sensors
   * @returns {Promise<Array>} Array of discovered sensors
   */
  async scanForSensors() {
    try {
      if (this.connectionMode === 'raspberry-pi') {
        // Query Raspberry Pi for available sensors
        const response = await fetch(`${this.raspberryPiUrl}/api/sensors/scan`, {
          method: 'POST',
        });
        const data = await response.json();
        return data.sensors || [];
      } else {
        // Bluetooth scan for sensors
        console.log("Scanning for MetaWear sensors...");
        // Implementation would use Bluetooth scanning
        return [];
      }
    } catch (error) {
      console.error("Error scanning for sensors:", error);
      throw error;
    }
  }

  /**
   * Connect to a specific MetaWear sensor
   * @param {string} sensorId - MAC address or identifier of the sensor
   * @param {Object} config - Sensor configuration
   */
  async connectSensor(sensorId, config = {}) {
    try {
      if (this.sensors.size >= this.maxSensors) {
        throw new Error(`Maximum number of Mbient Labs sensors (${this.maxSensors}) already connected. Total body IMUs: ${this.totalSensors} (6 Mbient Labs + 1 XR HMD IMU + 2 Tap Strap 2 thumb IMUs)`);
      }

      const sensorConfig = {
        id: sensorId,
        samplingRate: config.samplingRate || this.samplingRate,
        accelerometer: config.accelerometer !== false,
        gyroscope: config.gyroscope !== false,
        magnetometer: config.magnetometer !== false,
        ...config,
      };

      if (this.connectionMode === 'raspberry-pi') {
        // Connect via Raspberry Pi
        const response = await fetch(`${this.raspberryPiUrl}/api/sensors/${sensorId}/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sensorConfig),
        });
        const data = await response.json();
        this.sensors.set(sensorId, data);
      } else {
        // Direct Bluetooth connection
        this.sensors.set(sensorId, sensorConfig);
      }

      console.log(`Sensor ${sensorId} connected`);
      return { success: true, sensorId };
    } catch (error) {
      console.error(`Error connecting sensor ${sensorId}:`, error);
      throw error;
    }
  }

  /**
   * Start streaming data from all connected sensors
   * @param {Function} onDataCallback - Callback function for received data
   */
  async startStreaming(onDataCallback) {
    try {
      console.log("Starting data streaming from MetaWear sensors...");

      if (this.connectionMode === 'raspberry-pi') {
        // Set up WebSocket or polling connection to Raspberry Pi
        await this.startRaspberryPiStreaming(onDataCallback);
      } else {
        // Direct sensor streaming
        for (const [sensorId, sensor] of this.sensors) {
          await this.startSensorStreaming(sensorId, sensor, onDataCallback);
        }
      }

      return { success: true };
    } catch (error) {
      console.error("Error starting data streaming:", error);
      throw error;
    }
  }

  /**
   * Start streaming from Raspberry Pi gateway
   */
  async startRaspberryPiStreaming(onDataCallback) {
    try {
      // Set up WebSocket connection or HTTP polling
      const ws = new WebSocket(`ws://${this.raspberryPiUrl.replace('http://', '')}/ws/sensors`);
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        onDataCallback(data);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      // Store WebSocket connection
      this.raspberryPiWebSocket = ws;
    } catch (error) {
      console.error("Error starting Raspberry Pi streaming:", error);
      throw error;
    }
  }

  /**
   * Start streaming from a specific sensor
   */
  async startSensorStreaming(sensorId, sensor, onDataCallback) {
    try {
      // Configure sensor modules (accelerometer, gyroscope, etc.)
      // Start data routes and subscribe to data streams
      console.log(`Starting streaming from sensor ${sensorId}`);
      
      // Implementation would set up data routes and subscribers
      // This is a placeholder for the actual MetaWear SDK integration
    } catch (error) {
      console.error(`Error starting streaming from sensor ${sensorId}:`, error);
      throw error;
    }
  }

  /**
   * Stop streaming data from all sensors
   */
  async stopStreaming() {
    try {
      console.log("Stopping data streaming...");

      if (this.raspberryPiWebSocket) {
        this.raspberryPiWebSocket.close();
        this.raspberryPiWebSocket = null;
      }

      // Stop all sensor streams
      for (const [sensorId] of this.sensors) {
        await this.stopSensorStreaming(sensorId);
      }

      return { success: true };
    } catch (error) {
      console.error("Error stopping data streaming:", error);
      throw error;
    }
  }

  /**
   * Stop streaming from a specific sensor
   */
  async stopSensorStreaming(sensorId) {
    try {
      if (this.connectionMode === 'raspberry-pi') {
        const response = await fetch(`${this.raspberryPiUrl}/api/sensors/${sensorId}/stop`, {
          method: 'POST',
        });
        return await response.json();
      } else {
        // Stop direct sensor streaming
        console.log(`Stopping streaming from sensor ${sensorId}`);
      }
    } catch (error) {
      console.error(`Error stopping streaming from sensor ${sensorId}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect a specific sensor
   */
  async disconnectSensor(sensorId) {
    try {
      if (this.connectionMode === 'raspberry-pi') {
        const response = await fetch(`${this.raspberryPiUrl}/api/sensors/${sensorId}/disconnect`, {
          method: 'POST',
        });
        await response.json();
      }

      this.sensors.delete(sensorId);
      console.log(`Sensor ${sensorId} disconnected`);
      return { success: true };
    } catch (error) {
      console.error(`Error disconnecting sensor ${sensorId}:`, error);
      throw error;
    }
  }

  /**
   * Get current sensor data (for polling-based access)
   */
  async getSensorData(sensorId) {
    try {
      if (this.connectionMode === 'raspberry-pi') {
        const response = await fetch(`${this.raspberryPiUrl}/api/sensors/${sensorId}/data`, {
          method: 'GET',
        });
        return await response.json();
      } else {
        // Get data from local sensor cache
        return this.sensors.get(sensorId)?.lastData || null;
      }
    } catch (error) {
      console.error(`Error getting sensor data for ${sensorId}:`, error);
      throw error;
    }
  }

  /**
   * Send data to webhook endpoint (for web-based integration)
   */
  async sendToWebhook(data) {
    try {
      if (!this.webhookUrl) {
        throw new Error("Webhook URL not configured");
      }

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error sending data to webhook:", error);
      throw error;
    }
  }

  /**
   * Configure sensor placement for full-body tracking
   * 9 body IMUs total: 6 Mbient Labs MetaWear sensors + 1 XR HMD IMU (head) + 2 Tap Strap 2 thumb IMUs
   * Mbient Labs sensors: chest, waist, left/right wrists, left/right ankles
   * XR HMD IMU: head (via Android XR SDK - to be integrated)
   * Tap Strap 2 thumb IMUs: left/right hands (via Tap Strap 2 SDK)
   */
  configureFullBodyTracking() {
    const placements = [
      { id: 'head', position: 'head', sensorId: null, type: 'xr-hmd-imu', source: 'android-xr-sdk' }, // XR HMD IMU (future)
      { id: 'chest', position: 'chest', sensorId: null, type: 'mbient-metawea', source: 'mbient-labs' },
      { id: 'waist', position: 'waist', sensorId: null, type: 'mbient-metawea', source: 'mbient-labs' },
      { id: 'left_wrist', position: 'left_wrist', sensorId: null, type: 'mbient-metawea', source: 'mbient-labs' },
      { id: 'right_wrist', position: 'right_wrist', sensorId: null, type: 'mbient-metawea', source: 'mbient-labs' },
      { id: 'left_ankle', position: 'left_ankle', sensorId: null, type: 'mbient-metawea', source: 'mbient-labs' },
      { id: 'right_ankle', position: 'right_ankle', sensorId: null, type: 'mbient-metawea', source: 'mbient-labs' },
      { id: 'left_hand_thumb', position: 'left_hand_thumb', sensorId: null, type: 'tap-strap-imu', source: 'tap-strap-2' }, // Tap Strap 2 thumb IMU
      { id: 'right_hand_thumb', position: 'right_hand_thumb', sensorId: null, type: 'tap-strap-imu', source: 'tap-strap-2' }, // Tap Strap 2 thumb IMU
    ];

    this.sensorPlacements = placements;
    return placements;
  }

  /**
   * Get all connected sensors
   */
  getConnectedSensors() {
    return Array.from(this.sensors.keys());
  }

  /**
   * Cleanup and disconnect all sensors
   */
  async cleanup() {
    try {
      await this.stopStreaming();
      
      for (const [sensorId] of this.sensors) {
        await this.disconnectSensor(sensorId);
      }

      this.sensors.clear();
      console.log("Mbient Labs manager cleaned up");
    } catch (error) {
      console.error("Error during cleanup:", error);
      throw error;
    }
  }
}

