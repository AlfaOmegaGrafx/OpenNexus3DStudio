# Motion Capture Integration Documentation

This document describes the integration of Mbient Labs MetaWear IMU sensors and Vana protocol for motion capture tracking data collection and monetization.

## Overview

The motion capture system integrates:
1. **Mbient Labs MetaWear Sensors**: 6-sensor full-body IMU tracking system
2. **XR HMD IMU**: 1 head sensor via Android XR SDK
3. **Tap Strap 2**: 2 devices (left and right hands) for finger-level tracking
4. **Vana Protocol**: Decentralized data collection and marketplace
5. **Raspberry Pi Gateway**: Multi-sensor coordination hub
6. **Multi-Platform Support**: Android XR, smartphones, PC, and web

## Architecture

### Hardware Components

- **6x Mbient Labs MetaWear Sensors** (MetaMotionRL or MetaMotionS)
  - Placement: Chest, waist, left/right wrists, left/right ankles
  - Connectivity: Bluetooth LE
  - Sensors: Accelerometer, gyroscope, magnetometer

- **1x XR HMD IMU** (Head sensor)
  - Source: Android XR SDK (Samsung Galaxy XR headset)
  - Integrated head tracking IMU from XR headset
  - To be integrated via Android XR SDK

- **2x Tap Strap 2 Devices** (Left and Right Hands)
  - 5 finger accelerometers per hand (thumb, index, middle, ring, pinky)
  - IMU (accelerometer + gyro) on thumb sensor per hand
  - Raw sensor mode for continuous finger tracking
  - UI navigation and gesture recognition support
  - Documentation: https://github.com/TapWithUs/tap-android-sdk

- **Total System: 9 Body Sensors (IMUs) + 10 Finger Accelerometers**
  - 9 body IMUs: 6 Mbient Labs + 1 XR HMD IMU + 2 Tap Strap 2 thumb IMUs
  - 10 finger accelerometers: 5 per hand from Tap Strap 2 devices

- **Raspberry Pi Gateway** (optional)
  - Coordinates multiple sensors
  - Provides webhook/HTTP API interface
  - WebSocket support for real-time streaming

### Software Components

- **MbientLabsManager** (`src/library/mbientLabsManager.js`)
  - Sensor connection and management
  - Data streaming and processing
  - Multi-platform support (Android, PC, Web)

- **TapStrapManager** (`src/library/tapStrapManager.js`)
  - Finger-level motion capture
  - Raw sensor mode for continuous accelerometer streaming
  - UI navigation and gesture recognition
  - Left and right hand device management

- **VanaDataManager** (`src/library/vanaDataManager.js`)
  - Decentralized data collection
  - Data pool management
  - Marketplace integration
  - Gelato Relay for gasless transactions

## Integration Guide

### 1. Mbient Labs MetaWear Setup

#### Android Integration

```javascript
import { MbientLabsManager } from './library/mbientLabsManager';

const manager = new MbientLabsManager({
  connectionMode: 'bluetooth',
  maxSensors: 6,
  samplingRate: 25, // Hz
});

// Initialize
await manager.initialize();

// Scan for sensors
const sensors = await manager.scanForSensors();

// Connect Mbient Labs sensors (6 sensors: chest, waist, wrists, ankles)
for (const sensor of sensors.slice(0, 6)) {
  await manager.connectSensor(sensor.id);
}

// Configure full-body tracking (7 sensors total: 6 Mbient Labs + 1 XR HMD IMU)
manager.configureFullBodyTracking();
// Note: XR HMD IMU (head) will be integrated via Android XR SDK separately

// Start streaming
await manager.startStreaming((data) => {
  console.log('Motion data:', data);
  // Process or send to Vana
});
```

#### Raspberry Pi Gateway Setup

```javascript
const manager = new MbientLabsManager({
  connectionMode: 'raspberry-pi',
  raspberryPiUrl: 'http://raspberry-pi.local:8080',
  maxSensors: 6, // Mbient Labs sensors only (chest, waist, wrists, ankles)
  // Total system: 7 sensors (6 Mbient Labs + 1 XR HMD IMU for head)
});

await manager.initialize();
```

#### Web Integration (Webhooks)

```javascript
const manager = new MbientLabsManager({
  connectionMode: 'web',
  webhookUrl: 'https://your-api.com/webhook/motion-data',
});

// Send data to webhook
await manager.sendToWebhook(motionData);
```

### 3. Complete Integration (Body + Finger Tracking)

```javascript
import { MbientLabsManager } from './library/mbientLabsManager';
import { TapStrapManager } from './library/tapStrapManager';
import { VanaDataManager } from './library/vanaDataManager';

class CompleteMotionCaptureSystem {
  constructor() {
    // Body tracking (7 sensors)
    this.mbientManager = new MbientLabsManager({
      connectionMode: 'raspberry-pi',
      raspberryPiUrl: 'http://raspberry-pi.local:8080',
      maxSensors: 6, // Mbient Labs sensors: chest, waist, wrists, ankles
    });
    
    // Finger tracking (2 Tap Strap 2 devices)
    this.tapManager = new TapStrapManager({
      connectionMode: 'bluetooth',
      maxTaps: 2, // Left and right hands
      rawSensorMode: true,
    });
    
    // Data collection
    this.vanaManager = new VanaDataManager({
      apiKey: process.env.VITE_VANA_API_KEY,
    });
    
    this.motionDataBuffer = [];
  }

  async initialize() {
    await this.mbientManager.initialize();
    await this.tapManager.initialize();
    await this.vanaManager.initialize();
    
    // Create or get data pool
    const pools = await this.vanaManager.listDataPools();
    this.dataPool = pools.find(p => p.dataType === 'motion-capture') 
      || await this.vanaManager.createDataPool({
          name: 'Complete Motion Capture Data',
          dataType: 'motion-capture',
        });
  }

  async startCapture() {
    // Start body tracking
    await this.mbientManager.startStreaming((bodyData) => {
      this.motionDataBuffer.push({
        type: 'body',
        ...bodyData,
        timestamp: Date.now(),
      });
    });
    
    // Start finger tracking
    await this.tapManager.startStreaming((fingerData) => {
      this.motionDataBuffer.push({
        type: 'finger',
        ...fingerData,
        timestamp: Date.now(),
      });
      
      // Batch submit every 10 seconds
      if (this.motionDataBuffer.length >= 250) {
        this.submitBatch();
      }
    });
  }

  async submitBatch() {
    if (this.motionDataBuffer.length === 0) return;
    
    const batch = this.motionDataBuffer.splice(0);
    
    await this.vanaManager.submitTrackingData(
      batch,
      this.dataPool.id,
      {
        batchSize: batch.length,
        sensorCount: 9, // 9 body IMUs: 6 Mbient Labs + 1 XR HMD IMU + 2 Tap Strap 2 thumb IMUs
        fingerAccelerometers: 10, // 10 finger accelerometers: 5 per hand
        dataTypes: ['body', 'finger'],
      }
    );
  }

  async stopCapture() {
    await this.mbientManager.stopStreaming();
    await this.tapManager.stopStreaming();
    
    // Submit remaining data
    if (this.motionDataBuffer.length > 0) {
      await this.submitBatch();
    }
  }
}

// Usage
const system = new CompleteMotionCaptureSystem();
await system.initialize();
await system.startCapture();

// ... capture motion (body + fingers) ...

await system.stopCapture();
```

### 4. Vana Protocol Integration

```javascript
import { VanaDataManager } from './library/vanaDataManager';

const vana = new VanaDataManager({
  apiKey: process.env.VITE_VANA_API_KEY,
  walletAddress: userWalletAddress,
});

// Initialize
await vana.initialize();

// Create data pool for motion capture data
const pool = await vana.createDataPool({
  name: 'Motion Capture Data',
  description: 'Full-body motion capture sequences',
  dataType: 'motion-capture',
  metadata: {
    sensorCount: 6,
    samplingRate: 25,
  },
});

// Submit motion capture data
await vana.submitTrackingData(motionData, pool.id, {
  sessionId: 'session-123',
  duration: 60, // seconds
  sensorPlacements: ['head', 'chest', 'left_wrist', 'right_wrist', 'left_ankle', 'right_ankle'],
});
```

### 3. Complete Integration Example

```javascript
import { MbientLabsManager } from './library/mbientLabsManager';
import { VanaDataManager } from './library/vanaDataManager';

class MotionCaptureSystem {
  constructor() {
    this.mbientManager = new MbientLabsManager({
      connectionMode: 'raspberry-pi',
      raspberryPiUrl: 'http://raspberry-pi.local:8080',
      maxSensors: 6, // Mbient Labs sensors: chest, waist, wrists, ankles
      // Total system: 7 sensors (6 Mbient Labs + 1 XR HMD IMU for head)
    });
    
    this.vanaManager = new VanaDataManager({
      apiKey: process.env.VITE_VANA_API_KEY,
    });
    
    this.motionDataBuffer = [];
  }

  async initialize() {
    await this.mbientManager.initialize();
    await this.vanaManager.initialize();
    
    // Create or get data pool
    const pools = await this.vanaManager.listDataPools();
    this.dataPool = pools.find(p => p.dataType === 'motion-capture') 
      || await this.vanaManager.createDataPool({
          name: 'Motion Capture Data',
          dataType: 'motion-capture',
        });
  }

  async startCapture() {
    await this.mbientManager.startStreaming((data) => {
      this.motionDataBuffer.push({
        ...data,
        timestamp: Date.now(),
      });
      
      // Batch submit every 10 seconds
      if (this.motionDataBuffer.length >= 250) { // 25 Hz * 10 seconds
        this.submitBatch();
      }
    });
  }

  async submitBatch() {
    if (this.motionDataBuffer.length === 0) return;
    
    const batch = this.motionDataBuffer.splice(0);
    
    await this.vanaManager.submitTrackingData(
      batch,
      this.dataPool.id,
      {
        batchSize: batch.length,
        duration: batch.length / 25, // seconds
      }
    );
  }

  async stopCapture() {
    await this.mbientManager.stopStreaming();
    
    // Submit remaining data
    if (this.motionDataBuffer.length > 0) {
      await this.submitBatch();
    }
  }
}

// Usage
const system = new MotionCaptureSystem();
await system.initialize();
await system.startCapture();

// ... capture motion ...

await system.stopCapture();
```

## Platform-Specific Notes

### Android XR (Samsung Galaxy XR)
- Use MetaWear Android SDK for 6 Mbient Labs sensors (chest, waist, wrists, ankles)
- XR HMD IMU (head sensor) integrated via Android XR SDK (to be implemented)
- Tap Strap 2 thumb IMUs (left and right hands) via Tap Strap 2 Android SDK
- Direct Bluetooth LE connection for Mbient Labs sensors and Tap Strap 2 devices
- Real-time streaming to XR headset
- Integration with WebXR for avatar movement
- Total: 9 body IMUs (6 Mbient Labs + 1 XR HMD IMU + 2 Tap Strap 2 thumb IMUs) + 10 finger accelerometers

### Raspberry Pi Gateway
- Acts as central hub for 6 Mbient Labs sensors (chest, waist, wrists, ankles)
- XR HMD IMU (head) connects directly via Android XR SDK
- Provides HTTP API and WebSocket interface
- Can run 24/7 for continuous data collection
- Supports webhook forwarding
- Total system: 9 body IMUs (6 Mbient Labs via Pi + 1 XR HMD IMU via Android XR SDK + 2 Tap Strap 2 thumb IMUs) + 10 finger accelerometers

### Web Applications
- Web Bluetooth API (if supported)
- Webhook/HTTP API integration
- Real-time data visualization
- Direct connection to Vana protocol

## Data Format

Motion capture data structure:

```json
{
  "sensorId": "MMRL-12345",
  "placement": "chest",
  "sensorType": "mbient-metawea",
  "timestamp": 1234567890,
  "accelerometer": {
    "x": 0.5,
    "y": -0.2,
    "z": 9.8
  },
  "gyroscope": {
    "x": 0.1,
    "y": 0.05,
    "z": -0.02
  },
  "magnetometer": {
    "x": 20.5,
    "y": 15.2,
    "z": 45.8
  }
}
```

**XR HMD IMU Data Format** (head sensor - Android XR SDK):
```json
{
  "sensorId": "xr-hmd-imu",
  "placement": "head",
  "sensorType": "xr-hmd-imu",
  "source": "android-xr-sdk",
  "timestamp": 1234567890,
  "orientation": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0,
    "w": 1.0
  },
  "angularVelocity": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "linearAcceleration": {
    "x": 0.0,
    "y": 0.0,
    "z": 9.8
  }
}
```

## References

- **Mbient Labs Documentation**: 
  - Android: https://mbientlab.com/tutorials/JaAndroid.html
  - API Docs: https://mbientlab.com/documents/metawear/android/latest/
  - GitHub: https://github.com/orgs/mbientlab/repositories

- **Tap Strap 2 Documentation**:
  - Android SDK: https://github.com/TapWithUs/tap-android-sdk
  - Python SDK: https://github.com/TapWithUs/tap-python-sdk
  - BLE API: https://www.tapwithus.com/wp-content/uploads/2018/08/TapBLEAPIdocumentation_1_0_0_20180408-1.pdf
  - Product: https://www.tapwithus.com/product/tap-strap-2/

- **Vana Protocol Documentation**:
  - Home: https://docs.vana.org/docs/home
  - Gelato Relay: https://docs.vana.org/docs/gelato-relay
  - Website: https://www.vana.org/

## Environment Variables

```env
VITE_VANA_API_KEY=your_vana_api_key
VITE_RASPBERRY_PI_URL=http://raspberry-pi.local:8080
VITE_MOTION_WEBHOOK_URL=https://your-api.com/webhook/motion-data
VITE_TAP_STRAP_WEBHOOK_URL=https://your-api.com/webhook/tap-data
```

