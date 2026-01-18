# VR Positioning Configuration

## Default VR Scene Offset

**Current VR Starting Position: `X = 0, Y = calculated from bounding box, Z = -0.5`**

This document records the VR scene offset position configuration. The Y position is automatically calculated from the model's bounding box to anchor the model's bottom to the physical floor (Y=0).

### Implementation Details

- **Location**: `src/library/sceneManager.js` - `enableVR()` method
- **Property**: `vrSceneOffset.position.set(0, calculatedY, -0.5)` where `calculatedY = -modelBottomY`
- **Effect**: 
  - **Z = -0.5**: Moves all scene content back by 0.5 units from the camera's starting position in VR mode
  - **Y = calculated from bounding box**: Anchors the model's bottom to Y=0 (physical floor level) when using floor-aligned reference spaces
  - The model's bounding box is calculated and the bottom Y coordinate is used to align the model with the floor

### Coordinate System Notes

In Three.js/WebXR:
- **Negative Z** = moves scene back (away from camera)
- **Positive Z** = moves scene forward (toward camera)
- **Positive Y** = moves scene up (raises model)
- **Negative Y** = moves scene down (lowers model)
- The camera is at origin (0, 0, 0) and looks down the negative Z axis
- XR controls the camera position automatically, so we offset the scene content instead
- When using floor-aligned reference spaces (bounded-floor, local-floor), Y=0 is the physical floor level

### Why This Offset Exists

Since WebXR controls the camera position in VR mode, we cannot directly adjust the camera. Instead, we create a `vrSceneOffset` group that wraps all scene content and positions it relative to the reference space. This allows us to:
1. Anchor the model to the physical floor (Y=0) using bounding box calculation
2. Control the initial viewing distance in VR (Z = -0.5)
3. Ensure the model appears correctly positioned relative to the user's viewpoint

### Floor Anchoring

When using floor-aligned reference spaces (`bounded-floor` or `local-floor`):
- Y=0 represents the physical floor level (from Galaxy XR settings when using `bounded-floor`)
- The model's bounding box is calculated to find its bottom Y coordinate
- The VR scene offset Y position is adjusted by `-modelBottomY` to align the model's bottom with Y=0
- This ensures the model sits on the physical floor, and the camera (at head height) views it correctly

### Changing the Position

If you need to adjust the VR starting position:

1. Edit `src/library/sceneManager.js`
2. Find the VR scene offset position calculation in `enableVR()` method
3. The Y position is calculated from the model's bounding box:
   - Current: `const finalY = floorAlignmentY;` (anchors model bottom to floor)
   - To raise model above floor, add to finalY: `const finalY = floorAlignmentY + raiseAmount;`
4. Update the values:
   - **Z-axis** (depth):
     - More negative = scene further back (e.g., `-0.5`, `-1.0`)
     - Less negative = scene closer (e.g., `-0.1`, `0.0`)
     - Positive = scene in front of camera (not recommended)
   - **Y-axis** (height):
     - Currently calculated from bounding box to anchor model bottom to floor
     - To raise model, modify the calculation to add an offset after floor alignment
     - Zero (after calculation) = model bottom at floor level (when using floor-aligned spaces)

5. **Update this document** with the new value and reason for change

### History

- **2024-12-XX**: Position updated to use bounding box calculation for floor anchoring
  - **Y = calculated from bounding box**: Model bottom is anchored to floor (Y=0) via automatic calculation
  - **Z = -0.5**: Optimal initial viewing distance
  - Previous implementation used fixed Y=1.0, now uses dynamic calculation for proper floor alignment
  - Previous Z iterations: `-1.0` (too far back), `-0.25` (too close), `-0.35` (still too close), `-0.5` (current optimal)

### Related Files

- `src/library/sceneManager.js` - VR mode implementation
- `src/components/SceneControlsCompact.jsx` - VR button UI

