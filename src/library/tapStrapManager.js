/**
 * Tap Strap 2 Manager
 * 
 * Manages integration with Tap Strap 2 devices for finger-level motion capture tracking.
 * Provides raw accelerometer data for each finger (thumb, index, middle, ring, pinky)
 * and IMU data (accelerometer + gyro) from the thumb sensor.
 * 
 * Documentation:
 * - Android SDK: https://github.com/TapWithUs/tap-android-sdk
 * - Python SDK: https://github.com/TapWithUs/tap-python-sdk
 * - BLE API: https://www.tapwithus.com/wp-content/uploads/2018/08/TapBLEAPIdocumentation_1_0_0_20180408-1.pdf
 * - Product: https://www.tapwithus.com/product/tap-strap-2/
 * 
 * Hardware Support:
 * - Tap Strap 2: 5 finger rings with accelerometers + thumb IMU
 * - TapXR: Extended XR support with spatial control (optional)
 * 
 * Integration:
 * - Complements 7-sensor body tracking system (6 Mbient Labs + 1 XR HMD IMU)
 * - Provides finger-level detail for hand tracking
 * - Enables gesture recognition and UI navigation
 */

export class TapStrapManager {
  constructor(config = {}) {
    this.taps = new Map(); // Map of tap device identifiers to tap objects
    this.maxTaps = config.maxTaps || 2; // Typically 2 straps (left and right hands)
    this.samplingRate = config.samplingRate || 25; // Hz (matches body tracking)
    this.connectionMode = config.connectionMode || 'bluetooth'; // 'bluetooth', 'web'
    this.rawSensorMode = config.rawSensorMode !== false; // Enable raw sensor mode by default
    this.deviceAccelerometerSensitivity = config.deviceAccelerometerSensitivity || 0; // 0-4, default 0
    this.imuGyroSensitivity = config.imuGyroSensitivity || 0; // 0-4, default 0
    this.imuAccelerometerSensitivity = config.imuAccelerometerSensitivity || 0; // 0-5, default 0
    this.webhookUrl = config.webhookUrl;
    this.uiNavigationEnabled = config.uiNavigationEnabled || false; // Enable UI navigation mode
    console.log("TapStrapManager initialized.");
  }

  /**
   * Initialize connection to Tap Strap devices
   */
  async initialize() {
    try {
      console.log("Initializing Tap Strap 2 devices...");
      
      if (this.connectionMode === 'web') {
        await this.initializeWebConnection();
      } else {
        await this.initializeBluetoothConnection();
      }

      return { success: true, message: "Tap Strap devices initialized." };
    } catch (error) {
      console.error("Error initializing Tap Strap devices:", error);
      throw error;
    }
  }

  /**
   * Initialize Bluetooth connection (Android/PC)
   */
  async initializeBluetoothConnection() {
    try {
      // For Android: Use Tap Android SDK
      // For PC/Web: Use Web Bluetooth API or native Bluetooth
      console.log("Initializing Bluetooth connection for Tap Strap devices...");
      
      if (navigator.bluetooth) {
        console.log("Web Bluetooth API available for Tap Strap");
        // Web Bluetooth implementation would go here
      } else {
        console.log("Native Bluetooth required for Tap Strap");
        // Native Bluetooth implementation would go here
      }
    } catch (error) {
      console.error("Error initializing Bluetooth connection:", error);
      throw error;
    }
  }

  /**
   * Initialize Web connection (for webhooks/HTTP API)
   */
  async initializeWebConnection() {
    try {
      console.log("Initializing web connection for Tap Strap devices...");
      // Web-based connection via HTTP/WebSocket would go here
      return { success: true };
    } catch (error) {
      console.error("Error initializing web connection:", error);
      throw error;
    }
  }

  /**
   * Scan for available Tap Strap devices
   * @returns {Promise<Array>} Array of discovered Tap devices
   */
  async scanForTaps() {
    try {
      console.log("Scanning for Tap Strap devices...");
      // Implementation would use Tap SDK scanning
      // Returns array of { identifier, name, isLeft, isRight }
      return [];
    } catch (error) {
      console.error("Error scanning for Tap devices:", error);
      throw error;
    }
  }

  /**
   * Connect to a specific Tap Strap device
   * @param {string} tapIdentifier - Identifier of the Tap device
   * @param {Object} config - Device configuration
   */
  async connectTap(tapIdentifier, config = {}) {
    try {
      if (this.taps.size >= this.maxTaps) {
        throw new Error(`Maximum number of Tap devices (${this.maxTaps}) already connected`);
      }

      const tapConfig = {
        identifier: tapIdentifier,
        isLeft: config.isLeft || false,
        isRight: config.isRight || false,
        rawSensorMode: config.rawSensorMode !== false ? this.rawSensorMode : false,
        deviceAccelerometerSensitivity: config.deviceAccelerometerSensitivity || this.deviceAccelerometerSensitivity,
        imuGyroSensitivity: config.imuGyroSensitivity || this.imuGyroSensitivity,
        imuAccelerometerSensitivity: config.imuAccelerometerSensitivity || this.imuAccelerometerSensitivity,
        ...config,
      };

      this.taps.set(tapIdentifier, tapConfig);
      console.log(`Tap device ${tapIdentifier} connected`);

      // Start raw sensor mode if enabled
      if (tapConfig.rawSensorMode) {
        await this.startRawSensorMode(tapIdentifier, tapConfig);
      }

      return { success: true, tapIdentifier };
    } catch (error) {
      console.error(`Error connecting Tap device ${tapIdentifier}:`, error);
      throw error;
    }
  }

  /**
   * Start raw sensor mode for a Tap device
   * Provides continuous raw accelerometer data from all 5 fingers
   * @param {string} tapIdentifier - Identifier of the Tap device
   * @param {Object} config - Sensor sensitivity configuration
   */
  async startRawSensorMode(tapIdentifier, config = {}) {
    try {
      const tap = this.taps.get(tapIdentifier);
      if (!tap) {
        throw new Error(`Tap device ${tapIdentifier} not connected`);
      }

      const deviceAccelSensitivity = config.deviceAccelerometerSensitivity || tap.deviceAccelerometerSensitivity || 0;
      const imuGyroSensitivity = config.imuGyroSensitivity || tap.imuGyroSensitivity || 0;
      const imuAccelSensitivity = config.imuAccelerometerSensitivity || tap.imuAccelerometerSensitivity || 0;

      console.log(`Starting raw sensor mode for Tap ${tapIdentifier}`);
      // Implementation would call Tap SDK:
      // tapSdk.startRawSensorMode(tapIdentifier, deviceAccelSensitivity, imuGyroSensitivity, imuAccelSensitivity);

      tap.rawSensorModeActive = true;
      return { success: true };
    } catch (error) {
      console.error(`Error starting raw sensor mode for ${tapIdentifier}:`, error);
      throw error;
    }
  }

  /**
   * Stop raw sensor mode for a Tap device
   * @param {string} tapIdentifier - Identifier of the Tap device
   */
  async stopRawSensorMode(tapIdentifier) {
    try {
      const tap = this.taps.get(tapIdentifier);
      if (!tap) {
        throw new Error(`Tap device ${tapIdentifier} not connected`);
      }

      console.log(`Stopping raw sensor mode for Tap ${tapIdentifier}`);
      tap.rawSensorModeActive = false;
      return { success: true };
    } catch (error) {
      console.error(`Error stopping raw sensor mode for ${tapIdentifier}:`, error);
      throw error;
    }
  }

  /**
   * Start streaming raw sensor data from all connected Tap devices
   * @param {Function} onDataCallback - Callback function for received data
   */
  async startStreaming(onDataCallback) {
    try {
      console.log("Starting raw sensor data streaming from Tap Strap devices...");

      // Set up data listeners for each connected Tap
      for (const [tapIdentifier, tap] of this.taps) {
        await this.startTapStreaming(tapIdentifier, tap, onDataCallback);
      }

      return { success: true };
    } catch (error) {
      console.error("Error starting data streaming:", error);
      throw error;
    }
  }

  /**
   * Start streaming from a specific Tap device
   */
  async startTapStreaming(tapIdentifier, tap, onDataCallback) {
    try {
      // Implementation would set up Tap SDK listeners
      // Raw sensor data callback structure:
      // - Device data: 5 accelerometers (thumb, index, middle, ring, pinky)
      // - IMU data: Accelerometer + gyro from thumb sensor
      
      console.log(`Starting streaming from Tap ${tapIdentifier}`);
      
      // Placeholder for actual Tap SDK integration
      // tapSdk.registerTapListener({
      //   onRawSensorInputReceived: (identifier, rawSensorData) => {
      //     this.processRawSensorData(identifier, rawSensorData, onDataCallback);
      //   }
      // });
    } catch (error) {
      console.error(`Error starting streaming from Tap ${tapIdentifier}:`, error);
      throw error;
    }
  }

  /**
   * Process raw sensor data from Tap device
   * @param {string} tapIdentifier - Tap device identifier
   * @param {Object} rawSensorData - Raw sensor data from Tap SDK
   * @param {Function} onDataCallback - Callback function
   */
  processRawSensorData(tapIdentifier, rawSensorData, onDataCallback) {
    try {
      const tap = this.taps.get(tapIdentifier);
      if (!tap) return;

      const processedData = {
        tapIdentifier,
        timestamp: rawSensorData.timestamp || Date.now(),
        hand: tap.isLeft ? 'left' : tap.isRight ? 'right' : 'unknown',
        dataType: rawSensorData.dataType, // 'Device' or 'IMU'
      };

      if (rawSensorData.dataType === 'Device') {
        // Finger accelerometer data (5 fingers)
        processedData.fingers = {
          thumb: this.extractFingerData(rawSensorData, 'thumb'),
          index: this.extractFingerData(rawSensorData, 'index'),
          middle: this.extractFingerData(rawSensorData, 'middle'),
          ring: this.extractFingerData(rawSensorData, 'ring'),
          pinky: this.extractFingerData(rawSensorData, 'pinky'),
        };
      } else if (rawSensorData.dataType === 'IMU') {
        // IMU data from thumb sensor (accelerometer + gyro)
        processedData.imu = {
          accelerometer: this.extractIMUData(rawSensorData, 'accelerometer'),
          gyro: this.extractIMUData(rawSensorData, 'gyro'),
        };
      }

      onDataCallback(processedData);
    } catch (error) {
      console.error("Error processing raw sensor data:", error);
    }
  }

  /**
   * Extract finger accelerometer data
   */
  extractFingerData(rawSensorData, fingerName) {
    // Map finger names to Tap SDK indexes
    const fingerIndexMap = {
      thumb: 0, // RawSensorData.iDEV_THUMB
      index: 1, // RawSensorData.iDEV_INDEX
      middle: 2, // RawSensorData.iDEV_MIDDLE
      ring: 3, // RawSensorData.iDEV_RING
      pinky: 4, // RawSensorData.iDEV_PINKY
    };

    const index = fingerIndexMap[fingerName];
    if (index === undefined) return null;

    // Extract point data (x, y, z) for the finger
    // This would use rawSensorData.getPoint(index)
    return {
      x: 0, // rawSensorData.getPoint(index).x
      y: 0, // rawSensorData.getPoint(index).y
      z: 0, // rawSensorData.getPoint(index).z
    };
  }

  /**
   * Extract IMU data (accelerometer or gyro)
   */
  extractIMUData(rawSensorData, sensorType) {
    // Map sensor types to Tap SDK indexes
    const imuIndexMap = {
      gyro: 0, // RawSensorData.iIMU_GYRO
      accelerometer: 1, // RawSensorData.iIMU_ACCELEROMETER
    };

    const index = imuIndexMap[sensorType];
    if (index === undefined) return null;

    // Extract point data (x, y, z) for the IMU sensor
    return {
      x: 0, // rawSensorData.getPoint(index).x
      y: 0, // rawSensorData.getPoint(index).y
      z: 0, // rawSensorData.getPoint(index).z
    };
  }

  /**
   * Stop streaming data from all Tap devices
   */
  async stopStreaming() {
    try {
      console.log("Stopping data streaming from Tap Strap devices...");

      for (const [tapIdentifier] of this.taps) {
        await this.stopTapStreaming(tapIdentifier);
      }

      return { success: true };
    } catch (error) {
      console.error("Error stopping data streaming:", error);
      throw error;
    }
  }

  /**
   * Stop streaming from a specific Tap device
   */
  async stopTapStreaming(tapIdentifier) {
    try {
      const tap = this.taps.get(tapIdentifier);
      if (!tap) return;

      if (tap.rawSensorModeActive) {
        await this.stopRawSensorMode(tapIdentifier);
      }

      console.log(`Stopped streaming from Tap ${tapIdentifier}`);
    } catch (error) {
      console.error(`Error stopping streaming from Tap ${tapIdentifier}:`, error);
      throw error;
    }
  }

  /**
   * Enable UI navigation mode
   * Combines finger tracking with gesture recognition for UI control
   */
  async enableUINavigation() {
    try {
      this.uiNavigationEnabled = true;
      console.log("UI navigation mode enabled");
      
      // Could switch to controller mode or enable gesture recognition
      return { success: true };
    } catch (error) {
      console.error("Error enabling UI navigation:", error);
      throw error;
    }
  }

  /**
   * Disable UI navigation mode
   */
  async disableUINavigation() {
    try {
      this.uiNavigationEnabled = false;
      console.log("UI navigation mode disabled");
      return { success: true };
    } catch (error) {
      console.error("Error disabling UI navigation:", error);
      throw error;
    }
  }

  /**
   * Send haptic feedback to Tap device
   * @param {string} tapIdentifier - Tap device identifier
   * @param {Array<number>} durations - Array of haptic durations [haptic, pause, haptic, pause...]
   */
  async vibrate(tapIdentifier, durations) {
    try {
      if (!this.taps.has(tapIdentifier)) {
        throw new Error(`Tap device ${tapIdentifier} not connected`);
      }

      // Implementation would call Tap SDK:
      // tapSdk.vibrate(tapIdentifier, durations);
      console.log(`Sending haptic feedback to Tap ${tapIdentifier}`);
      return { success: true };
    } catch (error) {
      console.error(`Error sending haptic to Tap ${tapIdentifier}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect a specific Tap device
   */
  async disconnectTap(tapIdentifier) {
    try {
      await this.stopTapStreaming(tapIdentifier);
      this.taps.delete(tapIdentifier);
      console.log(`Tap device ${tapIdentifier} disconnected`);
      return { success: true };
    } catch (error) {
      console.error(`Error disconnecting Tap ${tapIdentifier}:`, error);
      throw error;
    }
  }

  /**
   * Get all connected Tap devices
   */
  getConnectedTaps() {
    return Array.from(this.taps.keys());
  }

  /**
   * Get Tap device configuration
   */
  getTapConfig(tapIdentifier) {
    return this.taps.get(tapIdentifier);
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
   * Cleanup and disconnect all Tap devices
   */
  async cleanup() {
    try {
      await this.stopStreaming();
      
      for (const [tapIdentifier] of this.taps) {
        await this.disconnectTap(tapIdentifier);
      }

      this.taps.clear();
      console.log("Tap Strap manager cleaned up");
    } catch (error) {
      console.error("Error during cleanup:", error);
      throw error;
    }
  }
}

