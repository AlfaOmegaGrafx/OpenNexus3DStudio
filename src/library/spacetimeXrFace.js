/**
 * Apply Galaxy XR face relay weights to Space-Time walker VRM (OpenNexus driver parity).
 */
import { getNativeFaceWeightsIfFresh } from './nativeFaceBridge.js';
import {
  applyExpressionWeightRecordToVRMS,
  applyXRFrameExpressionsToVRMS,
} from './xrExpressionTrackingDriver.js';

/**
 * @param {import('@pixiv/three-vrm').VRM|null|undefined} vrm
 * @param {boolean} xrPresenting
 * @param {XRFrame|null|undefined} [frame]
 * @returns {number}
 */
export function tickSpacetimeXrFace(vrm, xrPresenting = false, frame = null) {
  if (!vrm) return 0;

  let applied = 0;
  const rec = getNativeFaceWeightsIfFresh(undefined, xrPresenting);
  if (rec) {
    applyExpressionWeightRecordToVRMS([vrm], rec, { lerpFactor: 0.35 });
    applied = 1;
  }

  if (frame) {
    applyXRFrameExpressionsToVRMS([vrm], frame, { lerpFactor: 0.35 });
    applied = 1;
  }

  return applied;
}

/** @deprecated raw morph apply — use tickSpacetimeXrFace(vrm) */
export function applyFaceWeightsToMorphTargets(root, weights) {
  if (!root || !weights || !Object.keys(weights).length) return 0;
  let applied = 0;
  root.traverse((child) => {
    if (!child.isMesh || !child.morphTargetDictionary || !child.morphTargetInfluences) return;
    const dict = child.morphTargetDictionary;
    for (const [key, value] of Object.entries(weights)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      let idx = dict[key];
      if (idx === undefined) {
        const lower = key.toLowerCase();
        for (const [name, i] of Object.entries(dict)) {
          if (name.toLowerCase() === lower || name.toLowerCase().includes(lower)) {
            idx = i;
            break;
          }
        }
      }
      if (idx !== undefined) {
        child.morphTargetInfluences[idx] = Math.max(0, Math.min(1, value));
        applied += 1;
      }
    }
  });
  return applied;
}
