# Wireless ADB Setup Guide

This guide helps you set up wireless debugging for your Android device using ADB WLAN (Android 11+).

## Prerequisites

1. **Android 11 or higher** on your device
2. **ADB installed** on your computer
3. **Same Wi-Fi network** for both device and computer
4. **Wireless debugging enabled** on device

## Quick Setup

### Option 1: Using QR Code (Recommended if extension supports it)

1. **On your Android device:**
   - Settings → Developer options
   - Enable "Wireless debugging"
   - Tap "Wireless debugging"
   - Tap "Pair device with pairing code"
   - A QR code will appear on your device

2. **In your IDE/Extension:**
   - Use the ADB WLAN extension to scan the QR code
   - The extension will automatically pair and connect

3. **Verify connection:**
   ```bash
   adb devices
   ```
   You should see your device listed with "device" status.

### Option 2: Manual Pairing

1. **On your Android device:**
   - Settings → Developer options
   - Enable "Wireless debugging"
   - Tap "Wireless debugging"
   - Tap "Pair device with pairing code"
   - Note the **IP address and port** (e.g., `192.168.1.100:12345`)
   - Note the **6-digit pairing code**

2. **On your computer:**
   ```bash
   adb pair <IP_ADDRESS:PORT>
   # Example: adb pair 192.168.1.100:12345
   # Enter the 6-digit code when prompted
   ```

3. **Connect to device:**
   - On device, check "Wireless debugging" settings
   - Note the **IP address and port** for connection (different from pairing port)
   - On computer:
     ```bash
     adb connect <IP_ADDRESS:PORT>
     # Example: adb connect 192.168.1.100:XXXXX
     ```

4. **Verify connection:**
   ```bash
   adb devices
   ```

### Option 3: Automated Script

Run the automated setup script:

**PowerShell:**
```powershell
.\scripts\setup-wireless-adb.ps1
```

The script will guide you through:
1. Finding ADB
2. Pairing instructions
3. Device pairing (QR or manual)
4. Connection setup
5. Port forwarding configuration

## Port Forwarding Setup

After connecting wirelessly, set up port forwarding for your dev server:

```bash
# Forward HTTPS port (for WebXR/AR/VR)
adb forward tcp:3000 tcp:3000

# Forward HTTP port (for debugging)
adb forward tcp:3001 tcp:3000

# Verify forwarding
adb forward --list
```

## Accessing Your Dev Server

Once connected and port forwarding is set up:

- **HTTPS (for WebXR):** `https://localhost:3000/`
- **HTTP (for debugging):** `http://localhost:3001/`

## Troubleshooting

### "Unable to connect to device"

**Solutions:**
1. Ensure device and computer are on the same Wi-Fi network
2. Check firewall settings (may need to allow ADB)
3. Try disconnecting and reconnecting:
   ```bash
   adb disconnect
   adb connect <IP_ADDRESS:PORT>
   ```

### "Device shows 'unauthorized'"

**Solutions:**
1. Check device screen for authorization prompt
2. Tap "Allow" or "OK"
3. Optionally check "Always allow from this computer"
4. Run `adb devices` again

### "Pairing code expired"

**Solutions:**
1. Generate a new pairing code on device
2. Try pairing again with the new code
3. Make sure you're using the pairing port, not the connection port

### "ADB not found"

**Solutions:**
1. Install Android SDK Platform Tools:
   - Download: https://developer.android.com/studio/releases/platform-tools
   - Extract and add to PATH
2. Or run: `.\scripts\find-or-install-adb.ps1`

### Connection drops frequently

**Solutions:**
1. Keep device screen on during debugging
2. Disable battery optimization for Developer options
3. Ensure stable Wi-Fi connection
4. Try reconnecting:
   ```bash
   adb disconnect
   adb connect <IP_ADDRESS:PORT>
   ```

## Disconnecting

To disconnect the wireless connection:

```bash
adb disconnect <IP_ADDRESS:PORT>
# Or disconnect all:
adb disconnect
```

## Reconnecting

If you need to reconnect later:

1. **On device:** Check "Wireless debugging" settings for the connection IP:Port
2. **On computer:**
   ```bash
   adb connect <IP_ADDRESS:PORT>
   ```

**Note:** You only need to pair once. After initial pairing, you can connect directly using the connection IP:Port.

## Advantages of Wireless ADB

- ✅ No USB cable needed
- ✅ Works from anywhere on the same network
- ✅ Multiple devices can connect simultaneously
- ✅ No USB debugging authorization prompts
- ✅ Better for XR/AR development

## Security Notes

- Wireless debugging should only be enabled on trusted networks
- Disable wireless debugging when not in use
- The pairing code expires after a short time for security

## Related Documentation

- [ADB Installation Guide](./ADB_INSTALLATION_GUIDE.md)
- [HTTP Port Forwarding Setup](./HTTP_PORT_FORWARDING_SETUP.md)
- [Galaxy XR Debug Reconnect](./GALAXY_XR_DEBUG_RECONNECT.md)
