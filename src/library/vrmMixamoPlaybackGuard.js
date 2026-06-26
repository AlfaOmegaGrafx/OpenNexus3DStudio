/**
 * Invariants for VRM + Mixamo playback via three-vrm.
 *
 * CRITICAL: When autoUpdateHumanBones is true, AnimationMixer must drive normalized
 * humanoid bones. Raw-bone tracks are overwritten every frame by humanoid.update()
 * and the avatar appears frozen while mixer time still advances.
 *
 * @see https://github.com/pixiv/three-vrm (loadMixamoAnimation example)
 */

/** Prefix on normalized Mixamo retarget tracks (three-vrm convention). */
export const NORMALIZED_MIXAMO_TRACK_PREFIX = 'Normalized_mixamorig';

/** @param {import('three').Object3D | null | undefined} scene */
/** @param {import('three').Object3D | null | undefined} node */
export function isNodeInVrmScene(scene, node) {
  if (!scene || !node) return false;
  if (scene.getObjectByName(node.name) === node) return true;
  let found = false;
  scene.traverse((obj) => {
    if (obj === node) found = true;
  });
  return found;
}

/**
 * Detect retarget clips that would silently freeze VRM playback.
 * @param {import('@pixiv/three-vrm').VRM} vrm
 * @param {import('three').AnimationClip | null | undefined} clip
 */
export function assertMixamoTracksUseNormalizedBones(vrm, clip) {
  /** @type {Array<{ track: string, rawName: string, expected: string }>} */
  const violations = [];
  const humanoid = vrm?.humanoid;
  const scene = vrm?.scene;
  if (!humanoid || !scene || !clip?.tracks?.length) {
    return { ok: true, violations };
  }

  const humanBoneNames = Object.keys(humanoid.humanBones ?? {});
  const namesToCheck = humanBoneNames.length
    ? humanBoneNames
    : ['hips', 'spine', 'chest', 'neck', 'head'];

  for (const track of clip.tracks) {
    const nodeName = track.name.split('.')[0];
    if (!nodeName || nodeName.startsWith(NORMALIZED_MIXAMO_TRACK_PREFIX)) continue;

    for (const boneName of namesToCheck) {
      const rawNode = humanoid.getRawBoneNode?.(boneName) ?? null;
      const normalizedNode = humanoid.getNormalizedBoneNode?.(boneName) ?? null;
      if (!rawNode || !normalizedNode || rawNode === normalizedNode) continue;
      if (rawNode.name !== nodeName) continue;
      if (!isNodeInVrmScene(scene, normalizedNode)) continue;

      violations.push({
        track: track.name,
        rawName: rawNode.name,
        expected: normalizedNode.name,
      });
      break;
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Log (and optionally throw) when retarget invariants are violated.
 * @param {import('@pixiv/three-vrm').VRM} vrm
 * @param {import('three').AnimationClip | null | undefined} clip
 * @param {{ throwOnViolation?: boolean }} [options]
 */
export function validateMixamoRetargetClip(vrm, clip, options = {}) {
  const { ok, violations } = assertMixamoTracksUseNormalizedBones(vrm, clip);
  if (ok) return { ok: true, violations: [] };

  const msg =
    '[VRM/Mixamo] Retarget tracks bind to raw bones while normalized bones exist — ' +
    'playback will look frozen. Fix resolveVrmBoneTrackName to prefer normalized nodes.';

  console.error(msg, violations.slice(0, 8));
  if (options.throwOnViolation) {
    throw new Error(`${msg} First: ${violations[0]?.track}`);
  }
  return { ok: false, violations };
}

/** Detect mixer-advancing but hips-not-moving (classic raw-bone regression). */
export class VrmPlaybackMotionSampler {
  constructor() {
    this._lastNormHipsRot = null;
    this._lastMixerTime = null;
    this.hipsDelta = 0;
    this.stallFrames = 0;
  }

  /**
   * @param {import('@pixiv/three-vrm').VRM | null | undefined} vrm
   * @param {number} mixerTime
   * @param {number} actionWeight
   */
  sample(vrm, mixerTime, actionWeight) {
    if (!vrm?.humanoid || actionWeight <= 0) return;

    const hips = vrm.humanoid.getNormalizedBoneNode?.('hips');
    if (!hips) return;

    const rot = hips.rotation.toArray().slice(0, 3);
    const mixerAdvanced =
      this._lastMixerTime != null && mixerTime > this._lastMixerTime + 1e-6;

    if (this._lastNormHipsRot && mixerAdvanced) {
      this.hipsDelta = rot.reduce(
        (sum, v, i) => sum + Math.abs(v - this._lastNormHipsRot[i]),
        0,
      );
      if (this.hipsDelta < 1e-5) this.stallFrames += 1;
      else this.stallFrames = 0;
    }

    this._lastNormHipsRot = rot;
    this._lastMixerTime = mixerTime;
  }

  get likelyFrozen() {
    return this.stallFrames >= 15;
  }

  reset() {
    this._lastNormHipsRot = null;
    this._lastMixerTime = null;
    this.hipsDelta = 0;
    this.stallFrames = 0;
  }
}
