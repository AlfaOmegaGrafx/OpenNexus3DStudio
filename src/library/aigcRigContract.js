/**
 * Validates AIGC avatar GLBs against docs/API_AVATAR_RIG_CONTRACT.md.
 * Does not modify the model — reports failures for DGX/API export fixes.
 */
import * as THREE from './three.js';
import {
  collectModelBones,
  findBoneByName,
  findHipsBone,
  getBoneWorldBounds,
  getMeshLayoutBounds,
  modelHasSkinnedMesh,
} from './rigBoneUtils.js';

/** @typedef {'pass'|'fail'} AigcRigContractStatus */

/**
 * @param {import('three').Object3D|null|undefined} root
 * @param {object} [options]
 * @param {string} [options.jobId]
 * @param {object} [options.rigInfo]
 * @param {string} [options.label]
 */
export function validateAigcRigContract(root, options = {}) {
  const jobId = options.jobId || root?.userData?.autoRigMeta?.job_id || null;
  const label = options.label || 'import';
  const failures = [];
  const warnings = [];

  if (!root) {
    return logContractResult({
      status: 'fail',
      jobId,
      label,
      failures: ['no_model_root'],
      warnings,
      metrics: null,
    });
  }

  root.updateMatrixWorld(true);

  if (!modelHasSkinnedMesh(root)) {
    failures.push('missing_skinned_mesh');
  }

  const bones = collectModelBones(root);
  if (bones.length === 0) {
    failures.push('no_bones_in_glb');
  }

  const meshBox = getMeshLayoutBounds(root);
  const boneBox = getBoneWorldBounds(root);
  if (meshBox.isEmpty()) {
    failures.push('empty_mesh_bounds');
  }
  if (boneBox.isEmpty()) {
    failures.push('empty_bone_bounds');
  }

  const meshSize = meshBox.getSize(new THREE.Vector3());
  const meshCenter = meshBox.getCenter(new THREE.Vector3());
  const boneCenter = boneBox.getCenter(new THREE.Vector3());
  const hips = findHipsBone(root);

  let hipsOffsetY = boneCenter.y - meshCenter.y;
  let hipsWorldY = null;
  let targetHipsY = null;

  if (hips && !meshBox.isEmpty()) {
    const hipsWorld = hips.getWorldPosition(new THREE.Vector3());
    hipsWorldY = hipsWorld.y;
    targetHipsY = meshBox.min.y + meshSize.y * 0.52;
    hipsOffsetY = hipsWorld.y - meshCenter.y;
    const hipsTargetDelta = Math.abs(hipsWorld.y - targetHipsY);
    const threshold = Math.max(meshSize.y * 0.15, 0.12);
    if (hipsTargetDelta > threshold) {
      failures.push('hips_not_at_mesh_torso');
    }
  } else if (!hips) {
    failures.push('missing_hips_bone');
  }

  if (meshSize.y > 0 && Math.abs(hipsOffsetY) > meshSize.y * 0.35) {
    failures.push('mesh_bone_vertical_mismatch');
  }

  const spine =
    findBoneByName(root, 'Spine2', 'Spine1', 'Spine') ||
    findBoneByName(root, 'mixamorig:Spine2', 'mixamorig:Spine1', 'mixamorig:Spine');
  const left =
    findBoneByName(root, 'LeftShoulder', 'LeftArm', 'mixamorig:LeftShoulder') ||
    findBoneByName(root, 'mixamorig:LeftArm');
  const right =
    findBoneByName(root, 'RightShoulder', 'RightArm', 'mixamorig:RightShoulder') ||
    findBoneByName(root, 'mixamorig:RightArm');

  if (hips && spine && left && right) {
    const hipsW = hips.getWorldPosition(new THREE.Vector3());
    const spineW = spine.getWorldPosition(new THREE.Vector3());
    const up = spineW.clone().sub(hipsW);
    if (up.y < 0) {
      failures.push('character_upside_down');
    }
    const lw = left.getWorldPosition(new THREE.Vector3());
    const rw = right.getWorldPosition(new THREE.Vector3());
    const rightVec = rw.clone().sub(lw).normalize();
    const upN = up.clone().normalize();
    const charForward = new THREE.Vector3().crossVectors(rightVec, upN).normalize();
    // Contract: world forward is glTF -Z, not the root node's local -Z (export may bake yaw).
    const gltfForward = new THREE.Vector3(0, 0, -1);
    if (charForward.dot(gltfForward) < 0) {
      failures.push('character_facing_backwards');
    }
  }

  const apiValidation = options.rigInfo?.validation;
  if (apiValidation && apiValidation.passed === false) {
    failures.push('api_validation_failed');
  }

  if (root.userData?.preserveExportedOrientation) {
    const scale = root.scale?.x ?? 1;
    if (Math.abs(scale - 1) > 0.02) {
      warnings.push('viewport_autoscale_applied');
    }
  }

  const metrics = {
    boneCount: bones.length,
    meshCenter: { x: meshCenter.x, y: meshCenter.y, z: meshCenter.z },
    boneCenter: { x: boneCenter.x, y: boneCenter.y, z: boneCenter.z },
    meshSize: { x: meshSize.x, y: meshSize.y, z: meshSize.z },
    hipsWorldY,
    targetHipsY,
    hipsOffsetFromMeshCenterY: hipsOffsetY,
    skinned: modelHasSkinnedMesh(root),
    preserveExportedOrientation: Boolean(root.userData?.preserveExportedOrientation),
    viewportScale: root.scale?.x ?? 1,
  };

  const status = failures.length === 0 ? 'pass' : 'fail';
  const result = logContractResult({
    status,
    jobId,
    label,
    failures,
    warnings,
    metrics,
  });

  root.userData.aigcRigContract = result;
  return result;
}

/**
 * @param {object} result
 */
function logContractResult(result) {
  const payload = {
    status: result.status,
    jobId: result.jobId,
    label: result.label,
    failures: result.failures,
    warnings: result.warnings,
    metrics: result.metrics,
    contract: 'docs/API_AVATAR_RIG_CONTRACT.md',
  };

  if (result.status === 'pass') {
    console.log('[API-Contract] PASS', payload);
  } else {
    console.error(
      '[API-Contract] FAIL — fix export on DGX (UniRig/Blender GLB); client will not repair rig',
      payload,
    );
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('aigcRigContractChecked', { detail: payload }),
    );
  }

  return payload;
}
