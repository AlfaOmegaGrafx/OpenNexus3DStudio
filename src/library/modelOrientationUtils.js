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
