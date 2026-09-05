/**
 * Galaxy XR / headset mic policy.
 *
 * Auto getUserMedia after VRM load (or on the first controller click) leaves
 * Chrome unable to deliver page pointer hits while system chrome still works.
 * Never auto-acquire the mic on headset UI; only explicit user actions may opt in.
 */

import { isHeadsetBrowserUi } from './viewportLayoutSync.js';

/**
 * @param {{ allowHeadset?: boolean }} [options]
 * @returns {boolean} true when acquire must refuse
 */
export function shouldBlockMicAcquireOnHeadset(options = {}) {
  if (options.allowHeadset === true) return false;
  return isHeadsetBrowserUi();
}

/** @returns {string} */
export function headsetMicBlockedMessage() {
  return 'Microphone auto-acquire blocked on headset UI (preserves controller hits)';
}
