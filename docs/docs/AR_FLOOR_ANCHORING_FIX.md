# AR Floor Anchoring Fix (Consolidated)

This document has been **consolidated** into:

- `docs/XR_MODE_FLOOR_ANCHORING_AND_BACKGROUNDS.md`

That document reflects the current correct AR behavior:
- **Pass-through** is enforced by keeping `scene.background = null` and `renderer.setClearColor(..., 0)`
- The XR wrapper is **floor-anchored** and **X is always 0** (centered)

#### Step 3: Create and Position Scene Wrapper
1. Creates `ARSceneWrapper` group (only wraps 3D models, not lights/cameras)
2. Moves all 3D models into the wrapper
3. Calculates bounding box of the model
4. Finds the model's bottom Y coordinate (`modelBottomY`)
5. Adjusts wrapper position Y by `-modelBottomY` to align model bottom with floor (Y=0)
6. Locks the position using `userData.anchorPosition` to prevent movement

#### Step 4: Lock Position in Render Loop
1. The XR render loop checks if wrapper position has changed
2. If position changed, restores it to the anchor position
3. Ensures wrapper stays fixed in world space (reference space coordinates)
4. Camera moves, but wrapper (and models) stay anchored to floor

## Technical Details

### Reference Space Types
- **`bounded-floor`** (PRIORITY): Uses Galaxy XR's configured boundary and floor level settings. Y=0 is physical floor as configured in device settings. This is the preferred option for Galaxy XR (same as VR mode).
- **`local-floor`**: Floor-aligned, Y=0 is physical floor (no boundaries). Fallback if bounded-floor isn't available.
- **`local`**: Not floor-aligned, origin is at headset position. Fallback if floor-aligned spaces aren't supported.
- **`viewer`**: Not floor-aligned, origin follows headset. Last resort fallback.

### Galaxy XR Floor Level Settings
When using `bounded-floor` reference space:
- **Galaxy XR floor level adjustment is automatically applied**
- The virtual floor (Y=0) aligns with the physical floor as configured in Galaxy XR device settings
- Device boundary settings are also used for play area definition
- Console logs will show: "Using Android XR floor level from boundaries settings"
- **AR mode uses the same floor-aligned reference space as VR mode** for consistency

### Floor Alignment
When using `bounded-floor` or `local-floor`:
- Y=0 in the reference space = physical floor level
- When using `bounded-floor`, Y=0 uses Galaxy XR's configured floor level from device settings
- Model's bottom is anchored to Y=0 (floor level) via bounding box calculation
- The position is fixed in the reference space (doesn't move with headset/camera)
- Models appear correctly positioned relative to the physical floor

### AR Pass-Through
AR pass-through enables the physical background to be visible:
- Renderer clear color set to transparent: `setClearColor(0x000000, 0)`
- Scene background removed: `scene.background = null`
- Physical world (camera feed) shows through transparent areas
- Original background stored and restored when AR session ends

### Position Calculation
```javascript
// Model's bottom in local space
const modelBottomY = boundingBox.min.y;

// Adjustment needed to align bottom with floor (Y=0)
const floorAlignmentY = -modelBottomY;

// Final Y position (model bottom at floor level)
const finalY = floorAlignmentY !== 0 ? floorAlignmentY : 0.5;

// Position wrapper at reference space origin (floor level)
this.vrSceneWrapper.position.set(0, finalY, -0.5);

// Lock position to prevent movement
this.vrSceneWrapper.userData.isAnchored = true;
this.vrSceneWrapper.userData.anchorPosition = position.clone();
```

### Current Position (Per Implementation)
- **X = 0**: Center horizontally
- **Y = calculated from bounding box**: Model bottom anchored to floor (Y=0)
- **Z = -0.5**: Scene content moved back 0.5 units from camera starting position

**Note**: The Y position is automatically calculated from the model's bounding box to anchor the model's bottom to the floor (Y=0). The floor alignment comes from using `bounded-floor` or `local-floor` reference space, which ensures Y=0 is at the physical floor level (from Galaxy XR settings when using bounded-floor).

## Implementation Details

### Reference Space Setup
The code now properly:
1. Requests `bounded-floor` first to use Galaxy XR floor level settings (same as VR mode)
2. Sets the reference space on Three.js renderer: `renderer.xr.referenceSpace = referenceSpace`
3. Sets the reference space type on Three.js XR manager: `renderer.xr.setReferenceSpaceType(refSpaceType)`
4. Stores reference space in `this.xrReferenceSpace` for consistency with VR mode

### AR Pass-Through Setup
The code enables pass-through by:
1. Setting renderer clear color to transparent: `renderer.setClearColor(0x000000, 0)`
2. Removing scene background: `scene.background = null`
3. Storing original background: `this.originalSceneBackground = scene.background`
4. Restoring background on session end

### Position Locking
The AR render loop ensures the fixed position is preserved:
- Checks if `vrSceneWrapper.userData.isAnchored` is true
- Verifies position matches `userData.anchorPosition`
- Restores position if it was changed (keeps it fixed in reference space)
- Prevents accidental position updates during AR session
- Updates matrix world to ensure proper rendering

### Consistency with VR Mode
AR mode now uses the same floor-aligned reference space approach as VR mode:
- Both prioritize `bounded-floor` for Galaxy XR floor level settings
- Both use the same reference space handling
- Both align Y=0 with physical floor from Galaxy XR settings
- Both use the same wrapper positioning logic
- Ensures consistent behavior between VR and AR modes

## Testing

### Automatic Fix
1. Load a 3D model in the app
2. Click the AR button (📱) to enter AR mode
3. Check console logs for:
   - `📱 Setting up AR pass-through and floor anchoring...`
   - `✅ AR pass-through enabled - background set to transparent`
   - `📐 Using Android XR floor level from boundaries settings`
   - `✅ Successfully using bounded-floor reference space for AR`
   - `📐 Model bottom Y: X, floor alignment Y: Y`
   - `🔒 Wrapper position locked - will NOT move with head movement`
   - `📱 AR pass-through active - physical background visible`
4. Verify physical background is visible (pass-through working)
5. Verify model is anchored to physical floor in AR view
6. Move head around - model should stay fixed, not move with head
7. The model should align with the physical floor using Galaxy XR's configured floor level

### Expected Console Output
```
📱 AR session starting...
🔄 Requesting bounded-floor reference space for AR...
✅ Successfully using bounded-floor reference space for AR
📐 Using Android XR floor level from boundaries settings
✅ AR pass-through enabled - background set to transparent
✅ Created AR scene wrapper
📦 Wrapped X objects for floor anchoring
📐 Model bottom Y: -0.5, floor alignment Y: 0.5
📐 Floor plane anchored to Android XR physical floor level (Y=0)
✅ AR scene wrapper position set to: Vector3 { x: 0, y: 0.5, z: -0.5 }
📐 AR models anchored to floor plane at reference space origin
🔒 Wrapper position locked - will NOT move with head movement
📱 AR pass-through active - physical background visible
🔍 AR wrapper position verification: { position: {...}, worldPosition: {...}, isAnchored: true }
```

## Related Documentation
- `docs/VR_POSITIONING.md` - Default VR positioning configuration
- `docs/VR_FLOOR_ANCHORING_FIX.md` - Similar fix for VR mode
- `docs/ANDROID_XR_FLOOR_ANCHORING.md` - Android XR floor level integration
- `src/library/sceneManager.js` - AR mode implementation

## Similarities and Differences from VR Mode

### Similarities
- **Both use `bounded-floor` reference space** to access Galaxy XR floor level settings
- **Both prioritize Galaxy XR's configured floor level** from device settings
- **Both use the same reference space handling** and setup process
- **Both align Y=0 with physical floor** from Galaxy XR settings when using bounded-floor
- **Both use the same wrapper positioning logic** and floor alignment calculation
- **Both lock wrapper position** to prevent movement with head/camera

### Differences
- **AR Mode**: 
  - Enables video pass-through (transparent background)
  - Physical background visible through camera feed
  - Models appear overlaid on real world
- **VR Mode**: 
  - Opaque background (immersive virtual environment)
  - No physical background visible
  - Fully virtual environment

### Reason for Same Floor Alignment
Both modes anchor model to floor for proper alignment:
- In AR: Model appears to sit on physical floor, visible through pass-through
- In VR: Model appears to sit on virtual floor (which matches physical floor via Galaxy XR settings)
- Camera/head movement doesn't affect model position in either mode
- Both use the same reference space for consistency

## Troubleshooting

### Model Still Moving with Head
1. **Check if bounded-floor is being used**: Look for console log "Using Android XR floor level from boundaries settings"
2. **Verify wrapper is anchored**: Check console for "Wrapper position locked - will NOT move with head movement"
3. **Check anchor position**: Verify `vrSceneWrapper.userData.isAnchored` is true
4. **Check render loop**: Look for warnings about position being restored
5. Verify reference space type supports floor alignment (should be `bounded-floor` or `local-floor`)
6. Check if model has valid geometry (not empty or invalid)

### AR Pass-Through Not Working
1. **Check renderer clear color**: Should be `setClearColor(0x000000, 0)` (transparent)
2. **Check scene background**: Should be `null`
3. **Verify session is AR**: Check console for "AR session starting"
4. **Check device support**: Some devices may not support AR pass-through
5. Look for console logs: "AR pass-through enabled - background set to transparent"

### Model Still Not at Correct Height
1. **Check if bounded-floor is being used**: Look for console log "Using Android XR floor level from boundaries settings"
2. **Verify Galaxy XR floor level settings**: Ensure floor level is properly configured in Galaxy XR device settings
3. Check console for reference space setup errors
4. Verify reference space type supports floor alignment (should be `bounded-floor` or `local-floor`)
5. Check if model has valid geometry (not empty or invalid)
6. Verify `vrSceneWrapper.userData.anchorPosition` is set correctly (Y value calculated from bounding box)

### Bounded-Floor Not Available
If `bounded-floor` reference space is not available:
- The code will automatically fall back to `local-floor`
- Floor alignment will still work, but Galaxy XR boundary settings won't be used
- Check console logs to see which reference space type was successfully obtained

### Model Position Resets
- The render loop should preserve the fixed position
- Check if `vrSceneWrapper.userData.isAnchored` is true
- Verify `userData.anchorPosition` is updated correctly
- Check console for warnings about position being restored

### Model Appears Too High or Too Low
- The Y position is calculated from the model's bounding box to anchor the bottom to the floor
- If the model appears incorrectly positioned, check the bounding box calculation in console logs
- The floor alignment comes from using `bounded-floor` reference space with Galaxy XR settings
- Verify Galaxy XR floor level is correctly configured in device settings

## Future Improvements
- Add visual floor plane indicator in AR mode
- Allow user to manually adjust model height in AR mode
- Save/restore model position preferences
- Support for different height presets (standing, sitting, etc.)
- Enhanced pass-through quality settings
- Support for occlusion (models behind real objects)
