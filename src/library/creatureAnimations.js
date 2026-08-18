/**
 * Mesh2Motion creature animation catalog + playback for template-rigged models.
 * Clips ship as a single GLB with named animations; UI groups them via catalog.json.
 *
 * Fitted foxes share Mesh2Motion bone names but not rest locals. Three.js tracks are
 * absolute locals — retarget with bind-relative pose: q = qd * inv(qs) * anim, then
 * scale soft chains down. First-key-only deltas washed out Walk (frame 0 mid-stride).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  DEFAULT_CREATURE_TEMPLATE_ID,
  isCreatureTemplateRigInfo,
} from './creaturePipelineCatalog.js';
import {
  collectModelBones,
  findHipsBone,
  getCreaturePawWorldMinY,
  isCreatureTemplateRigExport,
} from './rigBoneUtils.js';

const gltfLoader = new GLTFLoader();
const MIXER_DELTA = 1 / 30;

/** @type {Map<string, Promise<{ clips: THREE.AnimationClip[], catalog: object, url: string, sourceRest: Map<string, THREE.Quaternion> }>>} */
const bundleCache = new Map();

export const CREATURE_ANIMATION_BUNDLE_URL = {
  fox: '/assets/creature/fox/animations/fox-animations.glb',
};

export const CREATURE_ANIMATION_CATALOG_URL = {
  fox: '/assets/creature/fox/animations/catalog.json',
};

const ROOT_LOC_BONES = new Set(['Hips', 'root', 'Root', 'neutral_bone']);

/** Static tip bones borrow motion from these parents (avoids LBS banding). */
const STATIC_TIP_PARENT = {
  Tail_Tip: 'Tail_End',
  Ear_Tip_L: 'Ear_L',
  Ear_Tip_R: 'Ear_R',
  Chin_Tip: 'Chin',
};

/**
 * Blender empty tip helpers only (`Bone.end`). Do NOT match `Tail_End` — that is a
 * mid-chain deform bone; freezing it while Tail_Mid/Tip move bands the tail skin.
 * @param {string} bone
 * @returns {boolean}
 */
export function isCreatureSoftAppendageBone(bone) {
  return /\.end$/i.test(String(bone || ''));
}

/**
 * Scale bind-relative pose deltas. Fitted fox skin overweight soft chains; legs need
 * full Mesh2Motion bind-relative amplitude (first-key deltas washed Walk out).
 * @param {string} bone
 * @param {string} [clipName]
 * @returns {number}
 */
export function getCreaturePoseDeltaScale(bone, clipName = '') {
  const name = String(bone || '');
  const clip = String(clipName || '');
  const death = /Death/i.test(clip);

  if (/^Ear/i.test(name)) return death ? 0.1 : 0.12;
  if (/^Tail/i.test(name)) return death ? 0.15 : 0.2;
  if (name === 'Head' || /^Head\./i.test(name)) return death ? 0.2 : 0.28;
  if (/^Spine/i.test(name)) return death ? 0.22 : 0.3;
  if (/^(Chin|Nose|Stomach)/i.test(name)) return 0.25;

  if (/Leg/i.test(name)) return death ? 0.42 : 1;
  if (/^(Hips|root|Root)/i.test(name)) return death ? 0.5 : 1;
  return 0.75;
}

/**
 * @param {THREE.KeyframeTrack} track
 * @param {number} [maxDeg]
 * @returns {boolean}
 */
export function isNearlyConstantQuatTrack(track, maxDeg = 1.5) {
  const values = track?.values;
  if (!values || values.length < 8) return true;
  const q0 = new THREE.Quaternion().fromArray(values, 0);
  const q = new THREE.Quaternion();
  const limit = (maxDeg * Math.PI) / 180;
  for (let i = 4; i < values.length; i += 4) {
    q.fromArray(values, i);
    if (q0.angleTo(q) > limit) return false;
  }
  return true;
}

/**
 * Sit/Bark/Howl author Tail_Tip (and some Ear tips) as constant while parents wag —
 * that bands LBS skin. Rewrite tip keys so they carry the parent's bind-relative pose.
 * @param {THREE.AnimationClip} clip
 * @param {Map<string, THREE.Quaternion>} sourceRest
 */
export function repairStaticCreatureTipTracks(clip, sourceRest) {
  if (!(sourceRest instanceof Map) || !clip?.tracks) return clip;
  /** @type {Map<string, THREE.KeyframeTrack>} */
  const quatByBone = new Map();
  for (const track of clip.tracks) {
    const { bone, prop } = splitTrackName(track.name || '');
    if (prop === 'quaternion') quatByBone.set(bone, track);
  }

  const qParent = new THREE.Quaternion();
  const qSynth = new THREE.Quaternion();
  const qChildRest = new THREE.Quaternion();
  const qParentRestInv = new THREE.Quaternion();

  for (const [child, parent] of Object.entries(STATIC_TIP_PARENT)) {
    const childTrack = quatByBone.get(child);
    const parentTrack = quatByBone.get(parent);
    const qsChild = sourceRest.get(child);
    const qsParent = sourceRest.get(parent);
    if (!childTrack || !parentTrack || !qsChild || !qsParent) continue;
    if (!isNearlyConstantQuatTrack(childTrack)) continue;

    qChildRest.copy(qsChild);
    qParentRestInv.copy(qsParent).invert();
    const times = parentTrack.times.slice();
    const values = new Float32Array(parentTrack.values.length);
    for (let i = 0; i < parentTrack.values.length; i += 4) {
      qParent.fromArray(parentTrack.values, i);
      // animChild = childRest * inv(parentRest) * animParent  (same pose-delta as parent)
      qSynth.copy(qChildRest).multiply(qParentRestInv).multiply(qParent);
      qSynth.toArray(values, i);
    }
    const repaired = new THREE.QuaternionKeyframeTrack(`${child}.quaternion`, times, values);
    const idx = clip.tracks.indexOf(childTrack);
    if (idx >= 0) clip.tracks[idx] = repaired;
  }
  return clip;
}

/**
 * @param {string} [templateId]
 * @returns {string}
 */
export function normalizeCreatureAnimTemplateId(templateId) {
  const id = String(templateId || DEFAULT_CREATURE_TEMPLATE_ID)
    .trim()
    .toLowerCase();
  if (id === 'quadruped') return 'fox';
  return id || DEFAULT_CREATURE_TEMPLATE_ID;
}

/**
 * @param {import('three').Object3D|null|undefined} root
 * @returns {string|null}
 */
export function getCreatureTemplateIdFromModel(root) {
  if (!root) return null;
  const rigInfo = root.userData?.autoRigMeta?.rig_info;
  if (isCreatureTemplateRigInfo(rigInfo)) {
    return normalizeCreatureAnimTemplateId(
      rigInfo.creature_template_id || rigInfo.template_id || 'fox',
    );
  }
  if (isCreatureTemplateRigExport(root)) return 'fox';
  return null;
}

/**
 * Snapshot local bone quaternions (Mesh2Motion rest or fitted rest).
 * @param {import('three').Object3D} root
 * @returns {Map<string, THREE.Quaternion>}
 */
export function captureBoneRestQuaternions(root) {
  /** @type {Map<string, THREE.Quaternion>} */
  const map = new Map();
  if (!root) return map;
  root.updateMatrixWorld(true);
  for (const bone of collectModelBones(root)) {
    if (bone.name) map.set(bone.name, bone.quaternion.clone());
  }
  return map;
}

/**
 * @param {string} trackName
 * @returns {{ bone: string, prop: string }}
 */
function splitTrackName(trackName) {
  const name = String(trackName || '');
  const lastDot = name.lastIndexOf('.');
  if (lastDot < 0) return { bone: name, prop: '' };
  return { bone: name.slice(0, lastDot), prop: name.slice(lastDot + 1) };
}

/**
 * Mesh2Motion Walk/etc. author location at template landmark (~2.1m).
 * Fitted products are ~0.25–0.3× that scale.
 *
 * - Drop scale tracks and non-root location (absolute locs teleport the fitted fox).
 * - Convert root/Hips position to delta-from-first-key * locScale (in-place locomotion).
 * - Zero Y on root motion so floor lock owns vertical placement.
 * - Drop only `*.end` empty helpers (never Tail_End — mid-chain deform bone).
 * - Repair static Tail_Tip/Ear tips so they inherit parent pose (Sit/Howl banding).
 * - Quaternions: targetRest * slerp(I, inv(sourceRest)*anim, scale) — bind-relative
 *   pose on fitted rest. First-key deltas washed Walk legs (frame 0 already mid-stride).
 * - Soft chains (tail/ear/spine/head) heavily scaled down for fitted skin weights.
 *
 * @param {THREE.AnimationClip} clip
 * @param {number} locScale
 * @param {Map<string, THREE.Quaternion>|null} [sourceRest]
 * @param {Map<string, THREE.Quaternion>|null} [targetRest]
 * @returns {THREE.AnimationClip}
 */
export function retargetCreatureClip(clip, locScale = 1, sourceRest = null, targetRest = null) {
  const next = clip.clone();
  next.name = clip.name;
  const doRest =
    sourceRest instanceof Map &&
    targetRest instanceof Map &&
    sourceRest.size > 0 &&
    targetRest.size > 0;
  const clipName = clip.name || '';

  if (doRest) {
    repairStaticCreatureTipTracks(next, sourceRest);
  }

  const qSrcInv = new THREE.Quaternion();
  const qAnim = new THREE.Quaternion();
  const qDelta = new THREE.Quaternion();
  const qScaled = new THREE.Quaternion();
  const qOut = new THREE.Quaternion();
  const qPrev = new THREE.Quaternion();
  const qIdentity = new THREE.Quaternion();

  next.tracks = next.tracks.filter((track) => {
    const { bone, prop } = splitTrackName(track.name || '');
    if (prop === 'scale') return false;
    if (isCreatureSoftAppendageBone(bone)) return false;
    if (prop === 'position') {
      if (!ROOT_LOC_BONES.has(bone) && !/hips/i.test(bone)) {
        return false;
      }
      const values = track.values;
      if (!values?.length || values.length < 3) return false;
      // Absolute M2M locs are authored at template origin — use deltas so the
      // fitted fox stays where the viewport placed it (in-place preview).
      const x0 = values[0];
      const z0 = values[2];
      const s = locScale !== 1 ? locScale : 1;
      for (let i = 0; i < values.length; i += 3) {
        values[i] = (values[i] - x0) * s;
        // Vertical bob from root motion fights floor lock; rotations carry bounce.
        values[i + 1] = 0;
        values[i + 2] = (values[i + 2] - z0) * s;
      }
      return true;
    }
    if (prop === 'quaternion' && doRest) {
      const qs = sourceRest.get(bone);
      const qd = targetRest.get(bone);
      if (qs && qd && track.values?.length >= 4) {
        qSrcInv.copy(qs).invert();
        qPrev.copy(qd);
        const poseScale = getCreaturePoseDeltaScale(bone, clipName);
        for (let i = 0; i < track.values.length; i += 4) {
          qAnim.fromArray(track.values, i);
          // delta = inv(sourceRest) * anim  (bind-relative pose)
          qDelta.copy(qSrcInv).multiply(qAnim);
          if (qDelta.w < 0) {
            qDelta.set(-qDelta.x, -qDelta.y, -qDelta.z, -qDelta.w);
          }
          if (poseScale < 1) {
            qScaled.slerpQuaternions(qIdentity, qDelta, poseScale);
          } else {
            qScaled.copy(qDelta);
          }
          // targetLocal = targetRest * scaledDelta
          qOut.copy(qd).multiply(qScaled);
          if (qOut.dot(qPrev) < 0) {
            qOut.set(-qOut.x, -qOut.y, -qOut.z, -qOut.w);
          }
          qOut.normalize();
          qOut.toArray(track.values, i);
          qPrev.copy(qOut);
        }
      }
    }
    return true;
  });
  return next;
}

/**
 * Landmark length hips→head tip for scale factor vs Mesh2Motion template (~2.12).
 * @param {import('three').Object3D} root
 * @returns {number}
 */
export function measureCreatureLandmark(root) {
  const hips = findHipsBone(root);
  let tip = null;
  root.traverse((o) => {
    if (tip) return;
    if (o.isBone && (o.name === 'Head.tip' || o.name === 'Headtip' || o.name === 'Head')) {
      tip = o;
    }
  });
  if (!hips || !tip) return 1;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  hips.getWorldPosition(a);
  tip.getWorldPosition(b);
  return Math.max(a.distanceTo(b), 1e-6);
}

/**
 * @param {string} [templateId]
 * @returns {Promise<{ clips: THREE.AnimationClip[], catalog: object, url: string, sourceRest: Map<string, THREE.Quaternion> }>}
 */
export async function loadCreatureAnimationBundle(templateId = 'fox') {
  const id = normalizeCreatureAnimTemplateId(templateId);
  const url = CREATURE_ANIMATION_BUNDLE_URL[id];
  const catalogUrl = CREATURE_ANIMATION_CATALOG_URL[id];
  if (!url) {
    throw new Error(`No Mesh2Motion animations for template "${id}"`);
  }
  if (bundleCache.has(id)) return bundleCache.get(id);

  const promise = (async () => {
    const [gltf, catalog] = await Promise.all([
      gltfLoader.loadAsync(url),
      fetch(catalogUrl).then((r) => {
        if (!r.ok) throw new Error(`Failed to load animation catalog: ${catalogUrl}`);
        return r.json();
      }),
    ]);
    const sourceRest = captureBoneRestQuaternions(gltf.scene);
    return {
      clips: gltf.animations || [],
      catalog,
      url,
      sourceRest,
    };
  })();
  bundleCache.set(id, promise);
  return promise;
}

/**
 * Lightweight mixer for creature (non-VRM) armatures.
 */
export class CreatureAnimationPlayer {
  constructor() {
    /** @type {THREE.AnimationMixer|null} */
    this.mixer = null;
    /** @type {import('three').Object3D|null} */
    this.root = null;
    /** @type {THREE.AnimationClip[]} */
    this.clips = [];
    /** @type {Map<string, THREE.Quaternion>|null} */
    this.sourceRest = null;
    /** @type {Map<string, THREE.Quaternion>|null} */
    this.targetRest = null;
    /** @type {THREE.AnimationAction|null} */
    this.action = null;
    this.currentName = '';
    this.locScale = 1;
    this.templateLandmark = 2.12;
    this._tickId = setInterval(() => this.update(MIXER_DELTA), 1000 / 30);
  }

  /**
   * @param {import('three').Object3D} root
   * @param {THREE.AnimationClip[]} clips
   * @param {Map<string, THREE.Quaternion>|null} [sourceRest]
   */
  bind(root, clips, sourceRest = null) {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.action = null;
    this.currentName = '';
    this.root = root;
    this.clips = clips || [];
    this.sourceRest = sourceRest;
    this.targetRest = captureBoneRestQuaternions(root);
    this.mixer = new THREE.AnimationMixer(root);
    const landmark = measureCreatureLandmark(root);
    this.locScale = landmark / this.templateLandmark;
  }

  /**
   * @param {string} clipName
   * @returns {boolean}
   */
  play(clipName) {
    if (!this.mixer || !this.root) return false;
    const src = this.clips.find((c) => c.name === clipName);
    if (!src) return false;
    const clip = retargetCreatureClip(
      src,
      this.locScale,
      this.sourceRest,
      this.targetRest,
    );
    if (this.action) {
      this.action.fadeOut(0.2);
    }
    this.action = this.mixer.clipAction(clip);
    this.action.reset().fadeIn(0.2).play();
    this.currentName = clipName;
    const tipsFrozen = src.tracks.filter((t) =>
      isCreatureSoftAppendageBone(splitTrackName(t.name || '').bone),
    ).length;
    console.log('[CreatureAnim] play', {
      clip: clipName,
      tracks: clip.tracks.length,
      endHelpersFrozen: tipsFrozen,
      locScale: Number(this.locScale.toFixed(4)),
      quatMode: this.sourceRest?.size && this.targetRest?.size ? 'bindRelativeScaled' : 'absolute',
      sourceRestBones: this.sourceRest?.size ?? 0,
      targetRestBones: this.targetRest?.size ?? 0,
    });
    return true;
  }

  stop() {
    this.action?.stop();
    this.action = null;
    this.currentName = '';
  }

  /**
   * @param {number} dt
   */
  update(dt = MIXER_DELTA) {
    if (!this.mixer || !this.action || !this.root) return;
    this.mixer.update(dt);
    // Skinned mesh AABB is unreliable during animation (often bind-pose biased) and
    // caused a floor-lock ratchet that floated the fox. Use paw tips only.
    this.root.updateMatrixWorld(true);
    const pawY = getCreaturePawWorldMinY(this.root);
    if (pawY == null || !Number.isFinite(pawY) || pawY >= -0.005) return;
    this.root.position.y -= pawY;
    this.root.updateMatrixWorld(true);
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.action = null;
    this.root = null;
    this.clips = [];
    this.sourceRest = null;
    this.targetRest = null;
    this.currentName = '';
  }
}

/** Singleton used by the left Animation panel + scene tick. */
export const creatureAnimationPlayer = new CreatureAnimationPlayer();
