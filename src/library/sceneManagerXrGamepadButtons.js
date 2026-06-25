/**
 * XR gamepad button edges — keep trigger (select) and grip (squeeze) distinct on Galaxy XR / Quest.
 */

const THRESHOLD = 0.45;

/**
 * @param {GamepadButton|undefined} button
 */
function isButtonActive(button) {
  if (!button) return false;
  return !!(button.pressed || (typeof button.value === 'number' && button.value > THRESHOLD));
}

/**
 * @param {XRInputSource} inputSource
 */
function isHandTrackingSource(inputSource) {
  const profiles = Array.isArray(inputSource?.profiles) ? inputSource.profiles : [];
  const p = profiles.join(' ').toLowerCase();
  return (
    p.includes('generic-hand') ||
    p.includes('hand-select') ||
    p.includes('generic-fixed-hand') ||
    p.includes('hand-tracking')
  );
}

/**
 * Primary trigger / pinch — never maps to grip button.
 * @param {XRInputSource} inputSource
 */
export function readTriggerPressed(inputSource) {
  const gp = inputSource?.gamepad;
  if (!gp?.buttons?.length) return false;

  if (isButtonActive(gp.buttons[0])) {
    return true;
  }

  if (isHandTrackingSource(inputSource) && gp.buttons.length >= 5) {
    return isButtonActive(gp.buttons[4]);
  }

  return false;
}

/**
 * Secondary grip / squeeze — button 1 only; not hand pinch (pinch stays on trigger).
 * @param {XRInputSource} inputSource
 */
export function readSqueezePressed(inputSource) {
  const gp = inputSource?.gamepad;
  if (!gp?.buttons?.length || gp.buttons.length < 2) return false;

  const grip = gp.buttons[1];
  if (!isButtonActive(grip)) return false;

  // Some runtimes mirror trigger on both buttons[0] and [1] — require grip above trigger.
  const triggerVal = gp.buttons[0]?.value ?? (gp.buttons[0]?.pressed ? 1 : 0);
  const gripVal = grip.value ?? (grip.pressed ? 1 : 0);
  if (isButtonActive(gp.buttons[0]) && gripVal <= triggerVal + 0.05) {
    return false;
  }

  return true;
}

/**
 * @param {boolean} pressed
 * @param {boolean} prev
 */
export function readButtonEdge(pressed, prev) {
  return {
    start: pressed && !prev,
    end: !pressed && prev,
  };
}
