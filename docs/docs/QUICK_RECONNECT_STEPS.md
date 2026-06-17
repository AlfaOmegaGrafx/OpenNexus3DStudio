# Quick Reconnect Steps for Galaxy XR Debugging

## After Power Loss or Disconnection

### Step 1: On Galaxy XR Device
1. **Settings → Developer options**
2. **Tap "Revoke USB debugging authorizations"**
3. **Disconnect USB cable**
4. **Reconnect USB cable**

### Step 2: On PC - Run Reconnection Script

**Option A: PowerShell (Recommended)**
```powershell
.\scripts\reconnect-galaxy-xr-debug.ps1
```

**Option B: Batch File**
Double-click: `scripts\reconnect-galaxy-xr-debug.bat`

**Option C: Manual Commands**
```powershell
# If ADB is installed:
adb kill-server
adb start-server
adb devices

# Then manually open Chrome:
# Navigate to: chrome://inspect/#devices
```

### Step 3: Authorize on Device
- When popup appears, tap **"Allow"**
- Optionally check **"Always allow from this computer"**

### Step 4: Open Chrome DevTools
1. Script will auto-open `chrome://inspect/#devices`
2. Wait for device: **"OpenNexus3DStudio: SPACE-TIME EDITION"** at `https://10.0.0.32:3002/`
3. Click **"inspect"** link

### Step 5: Start Debugging
- DevTools opens connected to Galaxy XR
- Open **Console** tab
- Click AR button (📱) in app
- Watch console for logs

## If ADB is Not Installed

Run the helper script:
```powershell
.\scripts\find-or-install-adb.ps1
```

Or download manually:
- **Download**: https://developer.android.com/studio/releases/platform-tools
- Extract and add to PATH, or use full path to `adb.exe`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Device shows "unauthorized" | Check device screen for popup, tap "Allow" |
| Device shows "offline" | Run `adb kill-server && adb start-server` |
| Device not detected | Check USB cable, port, and USB debugging enabled |
| Chrome doesn't show device | Wait a few seconds, refresh page, verify app is running |

## Network Target (if needed)

If device doesn't appear automatically:
1. In `chrome://inspect`, click **"Configure..."**
2. Add: `10.0.0.32:3002`
3. Click **"Done"**







