/**
 * 3DAIGC-API model catalog for the task sidebar model picker.
 * Synced with enabled models in 3DAIGC-API config/models.yaml.
 * Live list is filtered by GET /api/v1/system/models when connected.
 *
 * Verified DGX Spark paths (Jun 2026):
 * - Image → 3D: TRELLIS.2 (TRELLIS v1 fails xformers on GB200-class GPUs)
 * - Auto rig (full): SkinTokens → GLB
 * - Auto rig (template VRM): UniRig only (SkinTokens rejects template mode)
 * - Avatar from image: TRELLIS.2 mesh → UniRig template.vrm
 * - World props / mesh paint: TRELLIS.2
 */
import { AUTO_RIG_MODES, TEMPLATE_RIG_MODEL_ID } from './avatarPipelineCatalog.js';

/** @type {{ value: string, label: string, feature: string }[]} */
export const ALL_MODELS = [
  { value: 'trellis_text_to_textured_mesh', label: 'TRELLIS Text to Textured Mesh', feature: 'text_to_textured_mesh' },
  { value: 'trellis_text_mesh_painting', label: 'TRELLIS Text Mesh Painting', feature: 'text_mesh_painting' },
  { value: 'hunyuan3dv21_image_to_raw_mesh', label: 'Hunyuan3D v2.1 Image to Raw Mesh (recommended)', feature: 'image_to_raw_mesh' },
  { value: 'ultrashape_image_to_raw_mesh', label: 'UltraShape Image to Raw Mesh', feature: 'image_to_raw_mesh' },
  { value: 'trellis2_image_to_textured_mesh', label: 'TRELLIS.2 Image to Textured Mesh (recommended)', feature: 'image_to_textured_mesh' },
  { value: 'hunyuan3dv21_image_to_textured_mesh', label: 'Hunyuan3D v2.1 Image to Textured Mesh', feature: 'image_to_textured_mesh' },
  { value: 'trellis_image_to_textured_mesh', label: 'TRELLIS v1 Image to Textured Mesh (legacy — avoid on DGX)', feature: 'image_to_textured_mesh' },
  { value: 'trellis2_image_mesh_painting', label: 'TRELLIS.2 Image Mesh Painting (recommended)', feature: 'image_mesh_painting' },
  { value: 'hunyuan3dv21_image_mesh_painting', label: 'Hunyuan3D v2.1 Image Mesh Painting', feature: 'image_mesh_painting' },
  { value: 'trellis_image_mesh_painting', label: 'TRELLIS v1 Image Mesh Painting (legacy)', feature: 'image_mesh_painting' },
  { value: 'triposplat_image_to_splat', label: 'TripoSplat Image to Gaussian Splat', feature: 'image_to_splat' },
  {
    value: 'opennexus_image_to_world',
    label: 'Image to World (TripoSplat env + TRELLIS.2 props)',
    feature: 'image_to_world',
  },
  { value: 'p3sam_mesh_segmentation', label: 'P3-SAM Mesh Segmentation', feature: 'mesh_segmentation' },
  { value: 'skintokens_auto_rig', label: 'SkinTokens Auto Rig (recommended — full rig + GLB)', feature: 'auto_rig' },
  { value: 'unirig_auto_rig', label: 'UniRig Auto Rig (template VRM / FBX skeleton)', feature: 'auto_rig' },
  { value: 'instant_meshes_retopology', label: 'Instant Meshes Retopology', feature: 'mesh_retopology' },
  { value: 'xatlas_uv_unwrapping', label: 'xatlas UV Unwrapping', feature: 'uv_unwrapping' },
  { value: 'voxhammer_text_mesh_editing', label: 'VoxHammer Text Mesh Editing', feature: 'text_mesh_editing' },
  { value: 'voxhammer_image_mesh_editing', label: 'VoxHammer Image Mesh Editing', feature: 'image_mesh_editing' },
];

/** Models known to fail or underperform on DGX Spark — listed last in pickers. */
export const LEGACY_MODEL_IDS = new Set([
  'trellis_image_to_textured_mesh',
  'trellis_image_mesh_painting',
]);

/** Documented end-to-end pipelines for UI hints. */
export const PREFERRED_PIPELINES = {
  avatarCharacter: {
    label: 'Avatar character (recommended)',
    steps: ['TRELLIS.2 image→3D', 'SkinTokens full rig → GLB'],
    taskTypes: ['image-to-3d', 'auto-rigging'],
    meshModel: 'trellis2_image_to_textured_mesh',
    rigModel: 'skintokens_auto_rig',
    rigMode: AUTO_RIG_MODES.FULL,
  },
  avatarFromImage: {
    label: 'Avatar from photo (template VRM)',
    steps: ['TRELLIS.2 image→3D', 'UniRig template.vrm fit → GLB'],
    taskType: 'avatar-from-image',
    meshModel: 'trellis2_image_to_textured_mesh',
    rigModel: TEMPLATE_RIG_MODEL_ID,
    rigMode: AUTO_RIG_MODES.TEMPLATE,
  },
  explorableWorld: {
    label: 'Explorable world',
    steps: ['TripoSplat env', 'optional TRELLIS.2 props'],
    taskType: 'image-to-world',
    envModel: 'opennexus_image_to_world',
    propMeshModel: 'trellis2_image_to_textured_mesh',
  },
};

/** Map UI task types (task sidebar) to API feature keys from /api/v1/system/models */
export const TASK_TYPE_TO_FEATURE = {
  'text-to-3d': 'text_to_textured_mesh',
  'image-to-3d': 'image_to_textured_mesh',
  'image-to-raw-mesh': 'image_to_raw_mesh',
  'mesh-painting': 'image_mesh_painting',
  'mesh-painting-text': 'text_mesh_painting',
  'mesh-segmentation': 'mesh_segmentation',
  'auto-rigging': 'auto_rig',
  'mesh-retopology': 'mesh_retopology',
  'mesh-uv-unwrapping': 'uv_unwrapping',
  'mesh-editing-text': 'text_mesh_editing',
  'mesh-editing-image': 'image_mesh_editing',
  'image-to-splat': 'image_to_splat',
  'image-to-world': 'image_to_world',
  'avatar-from-image': null,
  'avatar-from-photo': null,
};

function sortModelsRecommendedFirst(models, preferredId) {
  return [...models].sort((a, b) => {
    if (a.value === preferredId) return -1;
    if (b.value === preferredId) return 1;
    const aLegacy = LEGACY_MODEL_IDS.has(a.value) ? 1 : 0;
    const bLegacy = LEGACY_MODEL_IDS.has(b.value) ? 1 : 0;
    return aLegacy - bLegacy;
  });
}

export function getModelsForTaskType(taskType) {
  const feature = TASK_TYPE_TO_FEATURE[taskType];
  if (!feature) return [];
  const models = ALL_MODELS.filter((m) => m.feature === feature);
  return sortModelsRecommendedFirst(models, DEFAULT_MODEL_BY_FEATURE[feature]);
}

/** Models used for world prop mesh generation (image → textured mesh). */
export function getPropMeshModelsForWorld() {
  return sortModelsRecommendedFirst(
    ALL_MODELS.filter((m) => m.feature === 'image_to_textured_mesh'),
    'trellis2_image_to_textured_mesh',
  );
}

/** Human-readable label from a model id (e.g. `unirig_auto_rig` → title case). */
export function cleanModelLabel(modelId) {
  if (!modelId || typeof modelId !== 'string') return '';
  return modelId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Catalog label when known; otherwise {@link cleanModelLabel}. */
export function getModelLabel(modelId) {
  const found = ALL_MODELS.find((m) => m.value === modelId);
  return found?.label ?? cleanModelLabel(modelId);
}

/** Default rig job output_format per backend (3DAIGC-API contract). */
export function getDefaultAutoRigOutputFormat(modelPreference, rigMode) {
  if (rigMode === AUTO_RIG_MODES.TEMPLATE) return 'glb';
  if (modelPreference === 'skintokens_auto_rig') return 'glb';
  return 'fbx';
}

/** Preferred default model id per API feature (verified/stable on DGX). */
const DEFAULT_MODEL_BY_FEATURE = {
  text_to_textured_mesh: 'trellis_text_to_textured_mesh',
  image_to_textured_mesh: 'trellis2_image_to_textured_mesh',
  image_to_raw_mesh: 'hunyuan3dv21_image_to_raw_mesh',
  text_mesh_painting: 'trellis_text_mesh_painting',
  image_mesh_painting: 'trellis2_image_mesh_painting',
  image_to_splat: 'triposplat_image_to_splat',
  image_to_world: 'opennexus_image_to_world',
  mesh_segmentation: 'p3sam_mesh_segmentation',
  auto_rig: 'skintokens_auto_rig',
  mesh_retopology: 'instant_meshes_retopology',
  uv_unwrapping: 'xatlas_uv_unwrapping',
  text_mesh_editing: 'voxhammer_text_mesh_editing',
  image_mesh_editing: 'voxhammer_image_mesh_editing',
};

/** Default model id for a task type or API feature key. */
export function getDefaultModelForFeature(featureOrTaskType) {
  const feature = TASK_TYPE_TO_FEATURE[featureOrTaskType] ?? featureOrTaskType;
  const preferred = DEFAULT_MODEL_BY_FEATURE[feature];
  if (preferred && ALL_MODELS.some((m) => m.value === preferred)) {
    return preferred;
  }
  const models = ALL_MODELS.filter((m) => m.feature === feature);
  return models[0]?.value ?? '';
}

/** Default auto-rig model for a rig mode (template → UniRig; else SkinTokens). */
export function getDefaultAutoRigModel(rigMode) {
  if (rigMode === AUTO_RIG_MODES.TEMPLATE) {
    return TEMPLATE_RIG_MODEL_ID;
  }
  return DEFAULT_MODEL_BY_FEATURE.auto_rig;
}

/**
 * Resolve auto-rig model for UI/API — enforces UniRig for template mode.
 * @param {string} [rigMode]
 * @param {string} [selectedModel]
 */
export function resolveAutoRigModelForTask(rigMode, selectedModel) {
  if (rigMode === AUTO_RIG_MODES.TEMPLATE) {
    return TEMPLATE_RIG_MODEL_ID;
  }
  const autoRigModels = ALL_MODELS.filter((m) => m.feature === 'auto_rig');
  if (selectedModel && autoRigModels.some((m) => m.value === selectedModel)) {
    if (selectedModel === TEMPLATE_RIG_MODEL_ID && rigMode !== AUTO_RIG_MODES.TEMPLATE) {
      return getDefaultAutoRigModel(rigMode);
    }
    return selectedModel;
  }
  return getDefaultAutoRigModel(rigMode);
}

/** Default rig mode per task type. */
export function getDefaultRigModeForTaskType(taskType) {
  if (taskType === 'avatar-from-image') return AUTO_RIG_MODES.TEMPLATE;
  if (taskType === 'auto-rigging') return AUTO_RIG_MODES.FULL;
  return AUTO_RIG_MODES.SKELETON;
}

const IMAGE_TO_TEXTURED_MESH_FEATURE = 'image_to_textured_mesh';

/** API mesh upload cap (3DAIGC-API core/utils/file_utils.py MAX_MESH_VERTICES). */
export const API_MAX_MESH_VERTICES = 210000;

/**
 * TRELLIS.2 decimation_target (faces) for avatar-from-image so the rig step can upload the GLB.
 * Default TRELLIS.2 target (1M) often exceeds the upload vertex limit.
 */
export const AVATAR_MESH_DECIMATION_TARGET = 100000;

/** Valid mesh model ids for avatar-from-image (image → textured mesh step). */
export function getMeshModelsForAvatarFromImage() {
  return sortModelsRecommendedFirst(
    ALL_MODELS.filter((m) => m.feature === IMAGE_TO_TEXTURED_MESH_FEATURE),
    DEFAULT_MODEL_BY_FEATURE.image_to_textured_mesh,
  );
}

/**
 * Pick a mesh-generation model for avatar-from-image.
 * Ignores stale rig/auto-rig selections left in the task model picker state.
 */
export function resolveMeshModelForAvatarFromImage(selectedModel) {
  const meshModels = getMeshModelsForAvatarFromImage();
  if (selectedModel && meshModels.some((m) => m.value === selectedModel)) {
    if (LEGACY_MODEL_IDS.has(selectedModel)) {
      return getDefaultModelForFeature('image-to-3d');
    }
    return selectedModel;
  }
  return getDefaultModelForFeature('image-to-3d');
}
