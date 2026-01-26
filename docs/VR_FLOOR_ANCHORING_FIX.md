# VR Floor Anchoring Fix (Consolidated)

This document has been **consolidated** into:

- `docs/XR_MODE_FLOOR_ANCHORING_AND_BACKGROUNDS.md`

That document reflects the current correct VR behavior:
- Floor alignment uses floor-aligned reference spaces (`bounded-floor` preferred on Galaxy XR)
- Wrapper positioning uses **X=0**, **Z=-0.5**, **Y computed from model bounding box**
- VR background is virtual/opaque (not pass-through)

### Reference Space Types
- **`bounded-floor`** (PRIORITY): Uses Galaxy XR's configured boundary and floor level settings. Y=0 is physical floor as configured in device settings. This is the preferred option for Galaxy XR (same as AR mode).
- **`local-floor`**: Floor-aligned, Y=0 is physical floor (no boundaries). Fallback if bounded-floor isn't available.
- **`local`**: Not floor-aligned, origin is at headset position. Fallback if floor-aligned spaces aren't supported.
- **`viewer`**: Not floor-aligned, origin follows headset. Last resort fallback.

### Galaxy XR Floor Level Settings
When using `bounded-floor` reference space:
- **Galaxy XR floor level adjustment is automatically applied**
- The virtual floor (Y=0) aligns with the physical floor as configured in Galaxy XR device settings
- Device boundary settings are also used for play area definition
- Console logs will show: "Galaxy XR floor level settings are ACTIVE"
- **VR mode uses the same floor-aligned reference space as AR mode** for consistency

### Floor Alignment
When `hasFloorAlignment` is true (using `bounded-floor` or `local-floor`):
- Y=0 in the reference space = physical floor level
- When using `bounded-floor`, Y=0 uses Galaxy XR's configured floor level from device settings
- Model's bottom is anchored to Y=0 (floor level) via bounding box calculation
- The position is fixed in the reference space (doesn't move with headset)
- Camera in VR should be at head height (~1.6-1.8m) above the floor, so model appears correctly

### Position Calculation
```javascript
// Model's bottom in local space of vrSceneOffset
const modelBottomY = boundingBox.min.y;

// Adjustment needed to align bottom with floor (Y=0)
const floorAlignmentY = -modelBottomY;

// Final Y position (model bottom at floor level)
const finalY = floorAlignmentY;
```

### Current Position (Per Implementation)
- **X = 0**: Center horizontally
- **Y = calculated from bounding box**: Model bottom anchored to floor (Y=0)
- **Z = -0.5**: Scene content moved back 0.5 units from camera starting position

**Note**: The Y position is automatically calculated from the model's bounding box to anchor the model's bottom to the floor (Y=0). The floor alignment comes from using `bounded-floor` or `local-floor` reference space, which ensures Y=0 is at the physical floor level (from Galaxy XR settings when using bounded-floor).

## Implementation Details

### Reference Space Setup
The code now properly:
1. Requests `bounded-floor` first to use Galaxy XR floor level settings (same as AR mode)
2. Sets the reference space on Three.js renderer: `xrRenderer.xr.referenceSpace = referenceSpace`
3. Sets the reference space type on Three.js XR manager: `xrRenderer.xr.setReferenceSpaceType(refSpaceType)`
4. Stores reference space in `this.xrReferenceSpace` for consistency with AR mode

### Position Preservation
The VR render loop ensures the fixed position is preserved:
- Checks if `vrSceneOffset.userData.isFixedInReferenceSpace` is true
- Resets position if it was changed (keeps it fixed in reference space)
- Prevents accidental position updates during VR session

### Consistency with AR Mode
VR mode now uses the same floor-aligned reference space approach as AR mode:
- Both prioritize `bounded-floor` for Galaxy XR floor level settings
- Both use the same reference space handling
- Both align Y=0 with physical floor from Galaxy XR settings
- Ensures consistent behavior between VR and AR modes

## Testing

### Automatic Fix
1. Load a 3D model in the app
2. Click the VR button (🥽) to enter VR mode
3. Check console logs for:
   - `📐 Attempting to use bounded-floor - this will use Galaxy XR floor level settings`
   - `📐 ✅ Using bounded-floor reference space - Galaxy XR floor level settings are ACTIVE`
   - `✅ Reference space set on Three.js renderer - Galaxy XR floor level is now active`
   - `📐 Model bounding box calculated for VR:`
   - `📐 VR scene offset Y position adjusted for floor anchoring:`
4. Verify model is anchored to physical floor in VR view
5. The model should align with the physical floor using Galaxy XR's configured floor level
6. Camera should be at head height above the floor, making the model appear correctly positioned

### Expected Console Output
```
📐 Attempting to use bounded-floor - this will use Galaxy XR floor level settings
📐 Galaxy XR floor level adjustment will be applied automatically (same as AR mode)
✅ Successfully using bounded-floor reference space for VR
📐 ✅ Using bounded-floor reference space - Galaxy XR floor level settings are ACTIVE
📐 The virtual floor (Y=0) is now aligned with the physical floor from Galaxy XR settings
✅ Reference space set on Three.js renderer - Galaxy XR floor level is now active
✅ Set Three.js reference space type to: bounded-floor (floor-aligned, same as AR mode)
📐 Model bounding box calculated for VR: { min: {...}, max: {...}, size: {...}, center: {...}, modelBottomY: -0.5 }
📐 VR scene offset Y position adjusted for floor anchoring: {
  modelBottomY: -0.5,
  floorAlignmentY: 0.5,
  finalY: 0.5,
  finalPosition: { x: 0, y: 0.5, z: -0.5 },
  explanation: 'Model bottom aligned with floor (Y=0). Camera should be at head height above floor in VR mode.'
}
```

## Related Documentation
- `docs/VR_POSITIONING.md` - Default VR positioning configuration
- `docs/AR_FLOOR_ANCHORING_FIX.md` - Similar fix for AR mode
- `src/library/sceneManager.js` - VR mode implementation

## Similarities and Differences from AR Mode

### Similarities
- **Both use `bounded-floor` reference space** to access Galaxy XR floor level settings
- **Both prioritize Galaxy XR's configured floor level** from device settings
- **Both use the same reference space handling** and setup process
- **Both align Y=0 with physical floor** from Galaxy XR settings when using bounded-floor

### Differences
- **AR Mode**: Model bottom anchored to Y=0 (floor level) after bounding box adjustment
- **VR Mode**: Model bottom anchored to Y=0 (floor level) after bounding box adjustment (same as AR)
- **Reason**: Both modes anchor model to floor for proper alignment. Camera in VR is at head height, so model appears correctly positioned relative to user's viewpoint

## Troubleshooting

### Model Still Not at Correct Height
1. **Check if bounded-floor is being used**: Look for console log "Galaxy XR floor level settings are ACTIVE"
2. **Verify Galaxy XR floor level settings**: Ensure floor level is properly configured in Galaxy XR device settings
3. Check console for reference space setup errors
4. Verify reference space type supports floor alignment (should be `bounded-floor` or `local-floor`)
5. Check if model has valid geometry (not empty or invalid)
6. Verify `vrSceneOffset.userData.fixedPosition` is set correctly (Y value calculated from bounding box to anchor model bottom to floor)

### Bounded-Floor Not Available
If `bounded-floor` reference space is not available:
- The code will automatically fall back to `local-floor`
- Floor alignment will still work, but Galaxy XR boundary settings won't be used
- Check console logs to see which reference space type was successfully obtained

### Model Position Resets
- The render loop should preserve the fixed position
- Check if `vrSceneOffset.userData.isFixedInReferenceSpace` is true
- Verify `userData.fixedPosition` is updated correctly

### Model Appears Too High or Too Low
- The Y position is calculated from the model's bounding box to anchor the bottom to the floor
- If the model appears incorrectly positioned, check the bounding box calculation in console logs
- The floor alignment comes from using `bounded-floor` reference space with Galaxy XR settings
- Camera should be at head height in VR mode - if camera appears below floor, check reference space setup

## Future Improvements
- Add visual floor plane indicator in VR mode
- Allow user to manually adjust model height in VR mode
- Save/restore model position preferences
- Support for different height presets (standing, sitting, etc.)
