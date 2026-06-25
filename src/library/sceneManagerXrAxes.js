/**
 * Shared XR thumbstick axis helpers (Galaxy XR / Quest gamepad layouts).
 */

const DEADZONE = 0.15;

/**
 * @param {import('./sceneManagerXrInput.js').XrPointerState|null|undefined} pointer
 */
export function readLeftThumbstickAxes(pointer) {
  if (!pointer || pointer.handedness !== 'left') return { x: 0, y: 0 };
  const axes = pointer.axes || [];
  if (axes.length >= 4) {
    return { x: axes[2] ?? 0, y: axes[3] ?? 0 };
  }
  if (axes.length >= 2) {
    return { x: axes[0] ?? 0, y: axes[1] ?? 0 };
  }
  return { x: 0, y: 0 };
}

/**
 * @param {import('./sceneManagerXrInput.js').XrPointerState|null|undefined} pointer
 */
export function readRightThumbstickAxes(pointer) {
  if (!pointer || pointer.handedness !== 'right') return { x: 0, y: 0 };
  const axes = pointer.axes || [];
  if (axes.length >= 4) {
    return { x: axes[2] ?? 0, y: axes[3] ?? 0 };
  }
  if (axes.length >= 2) {
    return { x: axes[0] ?? 0, y: axes[1] ?? 0 };
  }
  return { x: 0, y: 0 };
}

export function applyDeadzone(value) {
  return Math.abs(value) < DEADZONE ? 0 : value;
}

/** Stick tilted back (teleport aim) — negative Y on Galaxy XR after user-facing invert. */
export function isThumbstickTeleportAim(stickY, stickX = 0) {
  const y = applyDeadzone(-stickY);
  const x = applyDeadzone(stickX);
  return y > 0 && y >= Math.abs(x);
}
