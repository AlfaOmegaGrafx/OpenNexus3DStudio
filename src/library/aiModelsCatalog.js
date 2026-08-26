/**
 * 3DAIGC-API model catalog for the task sidebar model picker.
 * Synced with enabled models in 3DAIGC-API config/models.yaml.
 * Live list is filtered by GET /api/v1/system/models when connected.
 *
 * Verified DGX Spark paths (Jun 2026):
 * - Image → 3D: TRELLIS.2 (TRELLIS v1 fails xformers on GB200-class GPUs)
 * - Auto rig (full ML): SkinTokens (recommended) or UniRig full (same model id, rig_mode=full)
 * - Auto rig (template VRM): UniRig adapter in template mode (Blender fits template_ict.vrm — not a separate model)
 * - Avatar from image: TRELLIS.2 mesh → UniRig template_ict.vrm
 * - World props / mesh paint: TRELLIS.2
 *
 * Note: `unirig_auto_rig` is one API model with modes. UI “UniRig template VRM” sets
 * rig_mode=template (no neural UniRig). True UniRig ML needs rig_mode=full|skeleton|skin.
 */
import {
  AUTO_RIG_MODES,
  TEMPLATE_RIG_MODEL_ID,
  APPEARANCE_COMPONENT_RIG_MODEL_ID,
  ARC2AVATAR_MODEL_ID,
  ARC2AVATAR_FEATURE,
  ARC2AVATAR_TASK_TYPE,
  ARC2AVATAR_API_READY,
  BODY_CLOTH_STUDIO_TASK_TYPE,
  BODY_CLOTH_STUDIO_TEMPLATE_ID,
} from './avatarPipelineCatalog.js';
import { CREATURE_TEMPLATE_RIG_MODEL_ID } from './creaturePipelineCatalog.js';
import { inferAppearanceSlot, isAppearanceClothingName } from './appearanceClothing.js';

/**
 * Planned models — documented for pipeline placement; excluded from live pickers
 * until GET /api/v1/system/models lists them (see ARC2AVATAR_API_READY).
 * @type {{ value: string, label: string, feature: string, planned?: boolean }[]}
 */
/** @deprecated Prefer ALL_MODELS entry — kept for tests that assert planned shelf. */
export const PLANNED_MODELS = [
  {
    value: ARC2AVATAR_MODEL_ID,
    label: 'Arc2Avatar Head (FLAME 3DGS)',
    feature: ARC2AVATAR_FEATURE,
    planned: !ARC2AVATAR_API_READY,
  },
];

/** @type {{ value: string, label: string, feature: string }[]} */
export const ALL_MODELS = [
  {
    value: ARC2AVATAR_MODEL_ID,
    label: 'Arc2Avatar Head (FLAME 3DGS — SDS train)',
    feature: ARC2AVATAR_FEATURE,
  },
  { value: 'trellis_text_to_textured_mesh', label: 'TRELLIS Text to Textured Mesh', feature: 'text_to_textured_mesh' },
  { value: 'trellis_text_mesh_painting', label: 'TRELLIS Text Mesh Painting', feature: 'text_mesh_painting' },
  { value: 'hunyuan3dv21_image_to_raw_mesh', label: 'Hunyuan3D v2.1 Image to Raw Mesh (recommended)', feature: 'image_to_raw_mesh' },
  { value: 'ultrashape_image_to_raw_mesh', label: 'UltraShape Image to Raw Mesh', feature: 'image_to_raw_mesh' },
  { value: 'trellis2_image_to_textured_mesh', label: 'TRELLIS.2 Image to Textured Mesh (recommended)', feature: 'image_to_textured_mesh' },
  { value: 'pixal3d_image_to_textured_mesh', label: 'Pixal3D Image to Textured Mesh (PBR, high fidelity)', feature: 'image_to_textured_mesh' },
  { value: 'hunyuan3dv21_image_to_textured_mesh', label: 'Hunyuan3D v2.1 Image to Textured Mesh', feature: 'image_to_textured_mesh' },
  { value: 'trellis_image_to_textured_mesh', label: 'TRELLIS v1 Image to Textured Mesh (legacy — avoid on DGX)', feature: 'image_to_textured_mesh' },
  { value: 'trellis2_image_mesh_painting', label: 'TRELLIS.2 Image Mesh Painting (recommended)', feature: 'image_mesh_painting' },
  { value: 'hunyuan3dv21_image_mesh_painting', label: 'Hunyuan3D v2.1 Image Mesh Painting', feature: 'image_mesh_painting' },
  { value: 'trellis_image_mesh_painting', label: 'TRELLIS v1 Image Mesh Painting (legacy)', feature: 'image_mesh_painting' },
  { value: 'triposplat_image_to_splat', label: 'TripoSplat Image to Gaussian Splat (1 photo)', feature: 'image_to_splat' },
  { value: 'worldmirror2_reconstruct', label: 'WorldMirror 2.0 Photos to Splat (2+ photos)', feature: 'image_to_splat' },
  { value: 'colmap_3dgs_reconstruct', label: 'Photos to Splat (COLMAP — 3+ photos)', feature: 'image_to_splat' },
  {
    value: 'opennexus_image_to_world',
    label: 'Image to World (TripoSplat env + TRELLIS.2 props)',
    feature: 'image_to_world',
  },
  {
    value: 'lingbot_map_environment_scan',
    label: 'Environment scan (LingBot-Map walk → 1:1 twin)',
    feature: 'environment_scan',
  },
  { value: 'p3sam_mesh_segmentation', label: 'P3-SAM Mesh Segmentation', feature: 'mesh_segmentation' },
  { value: 'skintokens_auto_rig', label: 'SkinTokens Auto Rig (recommended — full rig + GLB)', feature: 'auto_rig' },
  { value: 'unirig_auto_rig', label: 'UniRig (one backend: template_ict.vrm fit OR full ML — pick mode)', feature: 'auto_rig' },
  {
    value: 'appearance_component_auto_rig',
    label: 'Appearance Clothing Fit (VRM slot — Joggers, Shirt, Boots…)',
    feature: 'auto_rig',
  },
  {
    value: 'creature_template_auto_rig',
    label: 'Creature Template Rig (Mesh2Motion fox / quadruped → GLB)',
    feature: 'auto_rig',
  },
  { value: 'trimesh_decimate', label: 'Mesh Decimate (recommended — keep shape + try keep UVs)', feature: 'mesh_retopology' },
  { value: 'autoremesher_retopology', label: 'AutoRemesher Retopology (organic remesh; textures lost)', feature: 'mesh_retopology' },
  { value: 'instant_meshes_retopology', label: 'Instant Meshes (hard-surface only — holes on characters)', feature: 'mesh_retopology' },
  { value: 'xatlas_uv_unwrapping', label: 'xatlas UV Unwrapping', feature: 'uv_unwrapping' },
  { value: 'voxhammer_text_mesh_editing', label: 'VoxHammer Text Mesh Editing', feature: 'text_mesh_editing' },
  { value: 'voxhammer_image_mesh_editing', label: 'VoxHammer Image Mesh Editing', feature: 'image_mesh_editing' },
  {
    value: 'krea2_turbo_text_to_image',
    label: 'Krea 2 Turbo Text-to-Image (local, recommended)',
    feature: 'text_to_image',
  },
  {
    value: 'mage_flow_edit_turbo',
    label: 'Mage-Flow-Edit-Turbo (instruction image edit)',
    feature: 'image_edit',
  },
  { value: 'kimodo_text_to_motion', label: 'Kimodo Text-to-Motion (SOMA → VRM)', feature: 'text_to_motion' },
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
    label: 'Avatar from Image (ICT template)',
    steps: ['TRELLIS.2 image→3D', 'UniRig template_ict.vrm fit → VRM'],
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
  physicalReplicaScan: {
    label: 'Physical replica (Galaxy XR walk)',
    steps: ['Outward-camera walk video', 'LingBot-Map', '1:1 metric calibrate'],
    taskType: 'environment-scan',
    envModel: 'lingbot_map_environment_scan',
  },
  textToImageTo3d: {
    label: 'Concept art → 3D (recommended)',
    steps: ['Krea 2 Turbo text→image', 'TRELLIS.2 image→3D'],
    taskTypes: ['text-to-image', 'image-to-3d'],
    imageModel: 'krea2_turbo_text_to_image',
    meshModel: 'trellis2_image_to_textured_mesh',
  },
  /**
   * Humanoid wrap track (Body+Cloth / template_wrap): body + clothing, with head engine
   * choice GNM+MeshMonk | Arc2Avatar | Both (see prompt option head_track).
   */
  composableAvatarBody: {
    label: 'Composable avatar body + clothing (head track)',
    steps: [
      'Head track: GNM+MeshMonk and/or Arc2Avatar (selfie)',
      'Krea 2 neck-open body (not the selfie)',
      'TRELLIS.2 → UniRig template_wrap',
      'Krea garments → appearance_component slots',
      'Optional: attach Arc2Avatar splat to Head bone',
    ],
    taskTypes: [
      'text-to-image',
      'image-to-3d',
      'auto-rigging',
      BODY_CLOTH_STUDIO_TASK_TYPE,
      ARC2AVATAR_TASK_TYPE,
    ],
    imageModel: 'krea2_turbo_text_to_image',
    meshModel: 'trellis2_image_to_textured_mesh',
    rigModel: TEMPLATE_RIG_MODEL_ID,
    rigMode: AUTO_RIG_MODES.TEMPLATE_WRAP,
    headTrackOptions: ['meshmonk', 'arc2avatar', 'both', 'none'],
  },
  /**
   * Task Manager discovery → Studio Body+Cloth (full head track UI).
   * Not a duplicate API pipeline — opens Studio with the composable template.
   */
  bodyClothStudio: {
    label: 'Head track · Body+Cloth (Studio)',
    steps: [
      'Open Studio Body+Cloth',
      'Face selfie + Image options Head track (GNM+MeshMonk / Arc2Avatar / Both)',
      'Run pipeline in Studio',
    ],
    taskType: BODY_CLOTH_STUDIO_TASK_TYPE,
    sameTrackAs: 'composableAvatarBody',
    opensStudio: true,
    studioTemplateId: BODY_CLOTH_STUDIO_TEMPLATE_ID,
    headTrackOptions: ['meshmonk', 'arc2avatar', 'both', 'none'],
    complements: ['avatar-from-image', ARC2AVATAR_TASK_TYPE],
    doesNotReplace: ['image-to-3d', 'auto-rigging', 'mesh-retopology'],
  },
  /**
   * Same humanoid wrap track — Arc2Avatar engine only (Task Manager shortcut).
   * Prefer Studio Body+Cloth + Head track chips for the full path.
   */
  arc2AvatarHead: {
    label: 'Head track · Arc2Avatar (same as Body+Cloth)',
    steps: [
      'Selfie / face photo',
      'Arc2Avatar SDS → FLAME-aligned head 3DGS (.ply)',
      'Compose on template_wrap body (Head bone)',
    ],
    taskType: ARC2AVATAR_TASK_TYPE,
    headModel: ARC2AVATAR_MODEL_ID,
    feature: ARC2AVATAR_FEATURE,
    planned: !ARC2AVATAR_API_READY,
    sameTrackAs: 'composableAvatarBody',
    headTrack: 'arc2avatar',
    complements: ['composableAvatarBody', 'avatar-from-image', BODY_CLOTH_STUDIO_TASK_TYPE],
    doesNotReplace: ['image-to-3d', 'auto-rigging', 'mesh-retopology'],
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
  'environment-scan': 'environment_scan',
  'text-to-image': 'text_to_image',
  'image-edit': 'image_edit',
  'text-to-motion': 'text_to_motion',
  'avatar-from-image': null,
  [ARC2AVATAR_TASK_TYPE]: ARC2AVATAR_FEATURE,
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
  if (rigMode === AUTO_RIG_MODES.TEMPLATE) return 'vrm';
  if (rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP) return 'vrm';
  if (rigMode === AUTO_RIG_MODES.APPEARANCE_COMPONENT) return 'vrm';
  if (rigMode === AUTO_RIG_MODES.CREATURE_TEMPLATE) return 'glb';
  if (modelPreference === 'skintokens_auto_rig') return 'glb';
  if (modelPreference === CREATURE_TEMPLATE_RIG_MODEL_ID) return 'glb';
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
  environment_scan: 'lingbot_map_environment_scan',
  mesh_segmentation: 'p3sam_mesh_segmentation',
  auto_rig: 'skintokens_auto_rig',
  mesh_retopology: 'trimesh_decimate',
  uv_unwrapping: 'xatlas_uv_unwrapping',
  text_mesh_editing: 'voxhammer_text_mesh_editing',
  image_mesh_editing: 'voxhammer_image_mesh_editing',
  text_to_image: 'krea2_turbo_text_to_image',
  image_edit: 'mage_flow_edit_turbo',
  text_to_motion: 'kimodo_text_to_motion',
  arc2avatar_head: ARC2AVATAR_MODEL_ID,
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

/** Default auto-rig model for a rig mode (template → UniRig; creature → fox; else SkinTokens). */
export function getDefaultAutoRigModel(rigMode) {
  if (rigMode === AUTO_RIG_MODES.TEMPLATE || rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP) {
    return TEMPLATE_RIG_MODEL_ID;
  }
  if (rigMode === AUTO_RIG_MODES.APPEARANCE_COMPONENT) {
    return APPEARANCE_COMPONENT_RIG_MODEL_ID;
  }
  if (rigMode === AUTO_RIG_MODES.CREATURE_TEMPLATE) {
    return CREATURE_TEMPLATE_RIG_MODEL_ID;
  }
  return DEFAULT_MODEL_BY_FEATURE.auto_rig;
}

/**
 * Infer preferred auto-rig pipeline from object name / hints.
 * Used so the UI can pre-select creature vs SkinTokens vs UniRig vs clothing fit.
 *
 * @param {{ objectName?: string, meshFileName?: string }} [hints]
 * @returns {'creature' | 'template' | 'skintokens' | 'appearance'}
 */
export function inferAutoRigPipelineKind(hints = {}) {
  const text = `${hints.objectName || ''} ${hints.meshFileName || ''}`.toLowerCase();
  if (isAppearanceClothingName(hints)) {
    return 'appearance';
  }
  if (
    /\b(fox|quadruped|creature|wolf|dog|cat|horse|deer|animal|mesh2motion)\b/.test(text)
  ) {
    return 'creature';
  }
  if (
    /\b(template\s*vrm|humanoid\s*template|vrm\s*template|unirig)\b/.test(text)
  ) {
    return 'template';
  }
  // Biped / character default (Eagle Knight, humans, etc.)
  return 'skintokens';
}

/**
 * Apply inferred pipeline → { modelPreference, rigMode, appearance_slot? }.
 * @param {'creature' | 'template' | 'skintokens' | 'appearance'} kind
 * @param {{ objectName?: string }} [hints]
 */
export function autoRigSelectionForPipelineKind(kind, hints = {}) {
  if (kind === 'creature') {
    return {
      modelPreference: CREATURE_TEMPLATE_RIG_MODEL_ID,
      rigMode: AUTO_RIG_MODES.CREATURE_TEMPLATE,
    };
  }
  if (kind === 'template') {
    return {
      modelPreference: TEMPLATE_RIG_MODEL_ID,
      rigMode: AUTO_RIG_MODES.TEMPLATE,
    };
  }
  if (kind === 'appearance') {
    return {
      modelPreference: APPEARANCE_COMPONENT_RIG_MODEL_ID,
      rigMode: AUTO_RIG_MODES.APPEARANCE_COMPONENT,
      appearance_slot: inferAppearanceSlot(hints) || 'Legs',
    };
  }
  return {
    modelPreference: 'skintokens_auto_rig',
    rigMode: AUTO_RIG_MODES.FULL,
  };
}

/**
 * Pipelines to show on a completed mesh task's Rig panel (filtered by name/type).
 * @param {{ options?: object, name?: string, type?: string }} task
 * @returns {Array<'skintokens' | 'creature' | 'template' | 'appearance'>}
 */
export function recommendedRigPipelinesForTask(task) {
  const name = `${task?.options?.object_name || ''} ${task?.name || ''}`;
  const kind = inferAutoRigPipelineKind({ objectName: name });
  if (kind === 'appearance') return ['appearance', 'skintokens', 'template'];
  if (kind === 'creature') return ['creature', 'skintokens', 'template'];
  if (kind === 'template') return ['template', 'skintokens'];
  // Characters / props: SkinTokens + UniRig template always available.
  return ['skintokens', 'template'];
}

/**
 * When the user picks a model in the dropdown, sync a compatible rig_mode.
 * @param {string} modelId
 * @param {string} [currentRigMode]
 */
export function implyRigModeFromAutoRigModel(modelId, currentRigMode) {
  if (modelId === CREATURE_TEMPLATE_RIG_MODEL_ID) {
    return AUTO_RIG_MODES.CREATURE_TEMPLATE;
  }
  if (modelId === TEMPLATE_RIG_MODEL_ID) {
    if (
      currentRigMode === AUTO_RIG_MODES.TEMPLATE ||
      currentRigMode === AUTO_RIG_MODES.TEMPLATE_WRAP ||
      currentRigMode === AUTO_RIG_MODES.SKELETON ||
      currentRigMode === AUTO_RIG_MODES.SKIN ||
      currentRigMode === AUTO_RIG_MODES.FULL
    ) {
      // Prefer template when switching onto UniRig from creature; keep UniRig modes otherwise.
      if (currentRigMode === AUTO_RIG_MODES.CREATURE_TEMPLATE) {
        return AUTO_RIG_MODES.TEMPLATE;
      }
      return currentRigMode;
    }
    return AUTO_RIG_MODES.TEMPLATE;
  }
  if (modelId === 'skintokens_auto_rig') {
    if (
      currentRigMode === AUTO_RIG_MODES.SKELETON ||
      currentRigMode === AUTO_RIG_MODES.SKIN ||
      currentRigMode === AUTO_RIG_MODES.FULL
    ) {
      return currentRigMode;
    }
    return AUTO_RIG_MODES.FULL;
  }
  return currentRigMode || AUTO_RIG_MODES.FULL;
}

/**
 * Resolve auto-rig model for UI/API.
 * - template / template_wrap → UniRig only
 * - creature_template → creature_template_auto_rig only
 * - skeleton / skin / full → SkinTokens or UniRig (user choice sticks)
 *
 * @param {string} [rigMode]
 * @param {string} [selectedModel]
 */
export function resolveAutoRigModelForTask(rigMode, selectedModel) {
  if (rigMode === AUTO_RIG_MODES.TEMPLATE || rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP) {
    return TEMPLATE_RIG_MODEL_ID;
  }
  if (rigMode === AUTO_RIG_MODES.APPEARANCE_COMPONENT) {
    return APPEARANCE_COMPONENT_RIG_MODEL_ID;
  }
  if (rigMode === AUTO_RIG_MODES.CREATURE_TEMPLATE) {
    return CREATURE_TEMPLATE_RIG_MODEL_ID;
  }
  const autoRigModels = ALL_MODELS.filter((m) => m.feature === 'auto_rig');
  if (selectedModel && autoRigModels.some((m) => m.value === selectedModel)) {
    // Creature backend only accepts creature_template mode — don't leave it selected here.
    if (selectedModel === CREATURE_TEMPLATE_RIG_MODEL_ID) {
      return getDefaultAutoRigModel(rigMode);
    }
    return selectedModel;
  }
  return getDefaultAutoRigModel(rigMode);
}

/**
 * Models shown for a given auto-rig mode (hides incompatible backends).
 * @param {string} [rigMode]
 */
export function getAutoRigModelsForRigMode(rigMode) {
  const all = ALL_MODELS.filter((m) => m.feature === 'auto_rig');
  if (rigMode === AUTO_RIG_MODES.TEMPLATE || rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP) {
    return all.filter((m) => m.value === TEMPLATE_RIG_MODEL_ID);
  }
  if (rigMode === AUTO_RIG_MODES.APPEARANCE_COMPONENT) {
    return all.filter((m) => m.value === APPEARANCE_COMPONENT_RIG_MODEL_ID);
  }
  if (rigMode === AUTO_RIG_MODES.CREATURE_TEMPLATE) {
    return all.filter((m) => m.value === CREATURE_TEMPLATE_RIG_MODEL_ID);
  }
  // skeleton / skin / full: SkinTokens + UniRig (not creature)
  return all.filter(
    (m) =>
      m.value === 'skintokens_auto_rig' || m.value === TEMPLATE_RIG_MODEL_ID,
  );
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
 * Hard ceiling for generation / retopo face budgets — equal to the API upload cap.
 * Never request more than this for `decimation_target` / `target_face_count`.
 */
export const PIPELINE_MESH_DECIMATION_MAX = API_MAX_MESH_VERTICES;

/**
 * Default face budget: as close to the API cap as possible without exceeding it.
 * Used for Image/Text → 3D, Avatar from Image, and Mesh Decimate.
 */
export const PIPELINE_MESH_DECIMATION_TARGET = API_MAX_MESH_VERTICES;

/**
 * TRELLIS.2 `decimation_target` for avatar-from-image (same pipeline face budget).
 */
export const AVATAR_MESH_DECIMATION_TARGET = PIPELINE_MESH_DECIMATION_TARGET;

/**
 * Default TRELLIS v1 `mesh_simplify` keep-ratio. 1.0 pairs with the full face budget;
 * the slider still scales `decimation_target` down when lowered.
 */
export const PIPELINE_MESH_SIMPLIFY_DEFAULT = 1;

/**
 * @param {unknown} n
 * @returns {number}
 */
export function clampPipelineDecimationTarget(n) {
  const v = Math.round(Number(n));
  const fallback = PIPELINE_MESH_DECIMATION_TARGET;
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.max(1000, Math.min(PIPELINE_MESH_DECIMATION_MAX, v));
}

/**
 * Default mesh-generation options that keep later pipeline steps in budget.
 * @returns {{ mesh_simplify: number, model_parameters: { decimation_target: number } }}
 */
export function getPipelineSafeMeshGenerationDefaults() {
  return {
    mesh_simplify: PIPELINE_MESH_SIMPLIFY_DEFAULT,
    model_parameters: {
      decimation_target: PIPELINE_MESH_DECIMATION_TARGET,
    },
  };
}

/** Valid mesh model ids for avatar-from-image (image → textured mesh step). */
export function getMeshModelsForAvatarFromImage() {
  return sortModelsRecommendedFirst(
    ALL_MODELS.filter((m) => m.feature === IMAGE_TO_TEXTURED_MESH_FEATURE),
    DEFAULT_MODEL_BY_FEATURE.image_to_textured_mesh,
  );
}

/**
 * Pick splat model from photo count (3+ → COLMAP reconstruction).
 */
export function resolveSplatModelForPhotos(primaryCount, referenceCount = 0) {
  const total = primaryCount + referenceCount;
  if (total >= 2) {
    return 'worldmirror2_reconstruct';
  }
  return 'triposplat_image_to_splat';
}

/**
 * Pick a mesh-generation model for avatar-from-image.
 * Ignores stale rig/auto-rig selections left in the task model picker state.
 */
export function resolveMeshModelForAvatarFromImage(selectedModel, options = {}) {
  return resolveMeshModelForMultiviewPhotos(selectedModel, options);
}

/**
 * TRELLIS v1 multiview when 2+ photos and use_multiview_mesh (image-to-3d / avatar).
 */
export function resolveMeshModelForMultiviewPhotos(selectedModel, options = {}) {
  const referenceCount = Number(options.referenceCount ?? 0);
  const useMultiview = options.useMultiview !== false && referenceCount >= 1;
  if (useMultiview) {
    return 'trellis_image_to_textured_mesh';
  }
  const meshModels = getMeshModelsForAvatarFromImage();
  if (selectedModel && meshModels.some((m) => m.value === selectedModel)) {
    if (LEGACY_MODEL_IDS.has(selectedModel)) {
      return getDefaultModelForFeature('image-to-3d');
    }
    return selectedModel;
  }
  return getDefaultModelForFeature('image-to-3d');
}
