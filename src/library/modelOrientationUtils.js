import * as THREE from './three.js';

/**
 * Detect GLBs exported from the viewport (THREE.GLTFExporter).
 * Those files already bake world orientation; auto 180° correction flips them backwards.
 */
export function isViewportExportedGltf(asset) {
  const generator = typeof asset?.generator === 'string' ? asset.generator : '';
  return generator.includes('THREE.GLTFExporter');
}

/**
 * DGX avatar-from-image / UniRig template path (Blender glTF exporter).
 * e.g. "Khronos glTF Blender I/O v4.0.44" in remote logs.
 */
export function isBlenderExportedGltf(asset) {
  const generator = typeof asset?.generator === 'string' ? asset.generator : '';
  return /glTF Blender|Khronos glTF Blender/i.test(generator);
}

/** @deprecated Alias — DGX API rigged GLBs use Blender glTF I/O. */
export function isDgxApiExportedGltf(asset) {
  return isBlenderExportedGltf(asset);
}

/** Viewport re-export or DGX API Blender export — skip autoScale / yaw repair. */
export function isPreservedOrientationGltf(asset) {
  return isViewportExportedGltf(asset) || isBlenderExportedGltf(asset);
}

/**
 * Whether processModel must keep export scale/orientation (no autoScale, no yaw repair).
 * @param {object} [options] load/process options
 * @param {import('three').Object3D} [model]
 * @param {object} [asset] glTF asset metadata
 */
export function shouldPreserveExportedOrientation(options = {}, model, asset) {
  if (model?.userData?.vrmNormalized) return false;
  if (options.preserveExportedOrientation || options.templateRig) return true;
  if (model?.userData?.preserveExportedOrientation) return true;
  if (options.avatarFromImage || options.taskType === 'avatar-from-image') return true;

  const rigInfo = options.autoRigMeta?.rig_info;
  if (rigInfo?.rig_mode === 'template') return true;
  if (rigInfo?.rig_type === 'humanoid_template') return true;
  if (rigInfo?.generation_method === 'humanoid_vrm_template') return true;

  if (options.fromAigc && isPreservedOrientationGltf(asset)) return true;
  if (options.fromAigc && options.autoRigMeta?.bone_count > 0 && isBlenderExportedGltf(asset)) {
    return true;
  }

  return false;
}

/** Uploaded .vrm scene root (not AIGC GLB). */
export function isUploadedVrmRoot(model) {
  return Boolean(model?.userData?.vrm);
}

/**
 * VRM0 forward fix — rotate the **scene root** only (@pixiv/three-vrm VRMUtils.rotateVRM0 pattern).
 * Never rotate a hips subtree: VRM0 UniGLTF exports use many skinned meshes (body, head, eyes…)
 * as scene siblings; armature-only rotation breaks per-skin bind for eyes/fingers.
 * @param {import('three').Object3D} scene
 * @param {string} [logLabel]
 * @returns {boolean}
 */
export function applyVrm0SceneForwardFix(scene, logLabel = 'VRM0 normalization') {
  if (!scene) return false;

  scene.updateMatrixWorld(true);
  const forward = new THREE.Vector3();
  scene.getWorldDirection(forward);
  if (forward.z <= 0.5) {
    console.log(`✅ ${logLabel}: scene already faces forward`, { forwardZ: forward.z });
    return false;
  }

  scene.rotation.y += Math.PI;
  scene.updateMatrixWorld(true);

  const after = new THREE.Vector3();
  scene.getWorldDirection(after);
  console.log(`🔄 ${logLabel}: rotated scene root (all skins move together)`, {
    beforeZ: forward.z,
    afterZ: after.z,
    rotationY: scene.rotation.y,
  });
  return true;
}

/**
 * @deprecated Upload path must use applyVrm0SceneForwardFix. Armature-only rotation breaks
 * multi-skin VRM0 bind (eyes, fingers). Kept for reference / trait path audit only.
 */
export function rotateVrm0ArmatureToFaceCamera(vrm) {
  console.warn(
    'rotateVrm0ArmatureToFaceCamera is deprecated for uploads; use applyVrm0SceneForwardFix',
  );
  return applyVrm0SceneForwardFix(vrm?.scene, 'VRM0 armature fix (legacy)');
}

/**
 * Rotate root Y by π only when the model faces away from the default camera (+Z).
 * @param {import('three').Object3D} root
 * @param {string} [logLabel]
 * @returns {boolean} whether a correction was applied
 */
export function ensureModelFacesCamera(root, logLabel = 'orientation') {
  if (!root) return false;

  root.updateMatrixWorld(true);
  const forward = new THREE.Vector3();
  root.getWorldDirection(forward);

  if (forward.z <= 0.1) {
    return false;
  }

  root.rotation.y += Math.PI;
  root.updateMatrixWorld(true);

  let after = new THREE.Vector3();
  root.getWorldDirection(after);
  if (after.z > 0.1) {
    root.rotation.y += Math.PI;
    root.updateMatrixWorld(true);
    after = new THREE.Vector3();
    root.getWorldDirection(after);
  }

  console.log(`🔄 ${logLabel}: rotated model to face camera`, {
    beforeZ: forward.z,
    afterZ: after.z,
    rotationY: root.rotation.y,
  });
  return true;
}
