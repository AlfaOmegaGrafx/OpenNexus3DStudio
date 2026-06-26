/**
 * Load Kimodo / studio_motion.json clips onto viewport VRM.
 */
import * as THREE from 'three';
import { get3daigcAuthHeaders } from './taskManager.js';
import {
  prepareVrmForMixamoRetarget,
  resolveVrmStudioMotionTrackName,
} from './loadMixamoAnimation.js';

function buildQuaternionTrack(nodeName, times, quaternions) {
  return new THREE.QuaternionKeyframeTrack(
    `${nodeName}.quaternion`,
    times,
    quaternions,
  );
}

function applyStudioMotionQuat(x, y, z, w, coordinateFix) {
  if (coordinateFix !== 'vrm0') return [x, y, z, w];
  return [x, y, z, w].map((v, i) => (i % 2 === 0 ? -v : v));
}

/**
 * @param {import('@pixiv/three-vrm').VRM} vrm
 * @param {object} motion studio_motion.json payload
 * @returns {THREE.AnimationClip}
 */
export function buildVrmAnimationClipFromStudioMotion(vrm, motion) {
  if (!vrm?.humanoid || !motion?.tracks?.length) {
    throw new Error('Invalid studio motion or VRM humanoid');
  }

  prepareVrmForMixamoRetarget(vrm);
  const coordinateFix = vrm?.meta?.metaVersion === '0' ? 'vrm0' : null;
  const tracks = [];

  for (const entry of motion.tracks) {
    const bone = entry.bone;
    const nodeName = resolveVrmStudioMotionTrackName(vrm, bone);
    if (!nodeName || !entry.times?.length || !entry.quaternions?.length) continue;

    const values = [];
    for (let i = 0; i < entry.quaternions.length; i += 4) {
      values.push(
        ...applyStudioMotionQuat(
          entry.quaternions[i],
          entry.quaternions[i + 1],
          entry.quaternions[i + 2],
          entry.quaternions[i + 3],
          coordinateFix,
        ),
      );
    }

    tracks.push(buildQuaternionTrack(nodeName, entry.times, values));
  }

  if (!tracks.length) {
    throw new Error('No VRM bone tracks resolved from studio motion');
  }

  return new THREE.AnimationClip(
    motion.name || 'kimodo',
    motion.duration ?? tracks[0].times[tracks[0].times.length - 1],
    tracks,
  );
}

export async function fetchStudioMotion(url) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...get3daigcAuthHeaders(),
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to load motion JSON (${res.status})`);
  }
  return res.json();
}

/**
 * @param {import('./animationManager').AnimationManager} animationManager
 * @param {{ vrm?: import('@pixiv/three-vrm').VRM | null }} target
 * @param {string} motionUrl
 * @param {string} [displayName]
 */
export async function applyStudioMotionToAnimationManager(
  animationManager,
  target,
  motionUrl,
  displayName = 'Kimodo',
) {
  const vrm = target?.vrm ?? null;
  if (!animationManager || !vrm?.humanoid) {
    throw new Error('VRM and animation manager required for Kimodo motion');
  }

  const motion = await fetchStudioMotion(motionUrl);
  const clip = buildVrmAnimationClipFromStudioMotion(vrm, motion);
  clip.name = displayName || motion.name || 'Kimodo';

  let control = animationManager.animationControls.find((c) => c.vrm === vrm);
  if (!control) {
    animationManager.addVRM(vrm);
    control = animationManager.animationControls.find((c) => c.vrm === vrm);
  }
  if (!control) {
    throw new Error('Could not attach Kimodo clip to VRM');
  }

  control.setAnimations([clip], null, animationManager.mouseLookEnabled, true);
  control.syncPlaybackActions(0, -1);
  control.from = null;
  control.fadeOutActions = null;

  animationManager.animations = [clip];
  animationManager.curAnimID = 0;
  animationManager.lastAnimID = -1;
  animationManager.mainControl =
    animationManager.animationControls.find((c) => c.vrm === vrm) ??
    animationManager.mainControl;
  return clip;
}
