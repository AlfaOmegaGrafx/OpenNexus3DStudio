/**
 * Avatar pipeline constants — mesh generation → template VRM rig → viewport.
 * Backend: 3DAIGC-API `rig_mode: "template"` + `humanoid_template_id` (UniRig).
 *
 * Humanoid head track (Body+Cloth / template_wrap) — one track, engine choice:
 *   meshmonk | arc2avatar | both
 * (GNM ethnicity + MeshMonk/RBF likeness vs Arc2Avatar FLAME 3DGS splat).
 * See docs/AVATAR_PIPELINE.md.
 */

/**
 * Head / face engine on the humanoid wrap track (same task as GNM + MeshMonk).
 * - meshmonk: template morph head + GNM identity + MeshMonk/RBF face_likeness
 * - arc2avatar: template_wrap body + Arc2Avatar head splat on Head bone
 * - both: MeshMonk/GNM warp + Arc2Avatar splat overlay
 * - none: no face engines (voxel / non-humanoid heads; Body+Cloth falls back to template bones-only)
 *
 * User-facing one-word names (API ids stay meshmonk / arc2avatar / gnm):
 * - GNM → Ethnicity (IdentitySampler ethnicity prior — not biometric “identity”)
 * - MeshMonk → Likeness
 * - Arc2Avatar → 3DGSavatar
 */
export const HEAD_TRACK = Object.freeze({
  MESHMONK: 'meshmonk',
  ARC2AVATAR: 'arc2avatar',
  BOTH: 'both',
  NONE: 'none',
});

/** User-facing engine names — never show GNM / MeshMonk / Arc2Avatar in UI chips. */
export const HEAD_ENGINE_UI = Object.freeze({
  gnm: 'Ethnicity',
  meshmonk: 'Likeness',
  arc2avatar: '3DGSavatar',
});

export const HEAD_TRACK_OPTIONS = Object.freeze([
  {
    id: HEAD_TRACK.MESHMONK,
    label: `${HEAD_ENGINE_UI.gnm} + ${HEAD_ENGINE_UI.meshmonk}`,
    title:
      'Template morph head: Ethnicity prior + Likeness face match (XR blendshapes)',
  },
  {
    id: HEAD_TRACK.ARC2AVATAR,
    label: HEAD_ENGINE_UI.arc2avatar,
    title:
      'Photoreal 3D Gaussian head from selfie (attach to Head bone; needs face photo)',
  },
  {
    id: HEAD_TRACK.BOTH,
    label: 'Both',
    title: `Ethnicity + Likeness on template head + ${HEAD_ENGINE_UI.arc2avatar} overlay`,
  },
  {
    id: HEAD_TRACK.NONE,
    label: 'None',
    title:
      'Skip Ethnicity / Likeness / 3DGSavatar — keep the generated mesh head (e.g. voxel / Minecraft). Body+Cloth uses template bones-only, no face wrap.',
  },
]);

/** @param {string} [headTrack] */
export function headTrackUserLabel(headTrack) {
  const t = normalizeHeadTrack(headTrack);
  if (t === HEAD_TRACK.ARC2AVATAR) return HEAD_ENGINE_UI.arc2avatar;
  if (t === HEAD_TRACK.BOTH) {
    return `Both (${HEAD_ENGINE_UI.meshmonk} + ${HEAD_ENGINE_UI.arc2avatar})`;
  }
  if (t === HEAD_TRACK.NONE) return 'None';
  return `${HEAD_ENGINE_UI.gnm} + ${HEAD_ENGINE_UI.meshmonk}`;
}

export function normalizeHeadTrack(value) {
  const id = String(value || '').trim().toLowerCase();
  if (
    id === HEAD_TRACK.ARC2AVATAR ||
    id === HEAD_TRACK.BOTH ||
    id === HEAD_TRACK.MESHMONK ||
    id === HEAD_TRACK.NONE
  ) {
    return id;
  }
  return HEAD_TRACK.MESHMONK;
}

export function headTrackUsesMeshMonk(headTrack) {
  const t = normalizeHeadTrack(headTrack);
  return t === HEAD_TRACK.MESHMONK || t === HEAD_TRACK.BOTH;
}

export function headTrackUsesArc2Avatar(headTrack) {
  const t = normalizeHeadTrack(headTrack);
  return t === HEAD_TRACK.ARC2AVATAR || t === HEAD_TRACK.BOTH;
}

/** @param {string} [headTrack] */
export function headTrackIsNone(headTrack) {
  return normalizeHeadTrack(headTrack) === HEAD_TRACK.NONE;
}

/** Product humanoid template id (operator-local morph head on API). */
export const DEFAULT_HUMANOID_TEMPLATE_ID = 'humanoid';

/** VRM filename for operator-local humanoid template on the API. */
export const HUMANOID_TEMPLATE_VRM_FILE = 'humanoid_template.vrm';

/** @deprecated Legacy ids from older jobs — normalize to humanoid. */
export const DEPRECATED_HUMANOID_TEMPLATE_IDS = Object.freeze([
  'template',
  'sifr2',
]);

export const AUTO_RIG_MODES = {
  SKELETON: 'skeleton',
  FULL: 'full',
  SKIN: 'skin',
  TEMPLATE: 'template',
  /** Phase 5 head stitch: keep morph head + AIGC body. */
  TEMPLATE_WRAP: 'template_wrap',
  APPEARANCE_COMPONENT: 'appearance_component',
  CREATURE_TEMPLATE: 'creature_template',
};

/** UniRig-only — SkinTokens rejects template mode on the API. */
export const TEMPLATE_RIG_MODEL_ID = 'unirig_auto_rig';

/** Appearance Editor wearable fit (slot-aware VRM component). */
export const APPEARANCE_COMPONENT_RIG_MODEL_ID = 'appearance_component_auto_rig';

/**
 * Planned 3DAIGC-API model / feature for Arc2Avatar head SDS train.
 * Not in live /system/models until the DGX adapter ships.
 */
export const ARC2AVATAR_MODEL_ID = 'arc2avatar_head';

/** API feature key (models.yaml) — planned. */
export const ARC2AVATAR_FEATURE = 'arc2avatar_head';

/** Task sidebar type — peer of avatar-from-image. */
export const ARC2AVATAR_TASK_TYPE = 'avatar-head-arc2avatar';

/**
 * Task sidebar discovery entry for full Body+Cloth head track (GNM + MeshMonk + selfie).
 * Does not queue an API job — opens Studio with the composable body template.
 */
export const BODY_CLOTH_STUDIO_TASK_TYPE = 'avatar-body-cloth-studio';

/** Studio template id for Body+Cloth / template_wrap head track. */
export const BODY_CLOTH_STUDIO_TEMPLATE_ID = 'krea_composable_avatar_body';

/** Deep link opened from Task Manager Body+Cloth entry (default head track = MeshMonk). */
export const BODY_CLOTH_STUDIO_PATH = `/studio?template=${BODY_CLOTH_STUDIO_TEMPLATE_ID}`;

/**
 * Studio deep link for Body+Cloth with a chosen head-track engine.
 * @param {string} [headTrack]
 * @returns {string}
 */
export function buildBodyClothStudioPath(headTrack) {
  const track = normalizeHeadTrack(headTrack);
  const params = new URLSearchParams({
    template: BODY_CLOTH_STUDIO_TEMPLATE_ID,
    head_track: track,
  });
  return `/studio?${params.toString()}`;
}

/**
 * Catalog hint: API routes + feature are shipped on DGX.
 * Start / Studio still gate on live {@link fetchArc2AvatarStatus} `.integrated`
 * (Python env + CUDA extensions + Arc2Face weights).
 */
export const ARC2AVATAR_API_READY = true;

/** Relative status path on 3DAIGC-API. */
export const ARC2AVATAR_STATUS_PATH = '/api/v1/arc2avatar/status';

/** Queue endpoint for head SDS train. */
export const ARC2AVATAR_IMAGE_TO_HEAD_PATH = '/api/v1/arc2avatar/image-to-head';

/**
 * @param {string} apiEndpoint
 * @returns {Promise<{ integrated: boolean, blocking_reasons?: string[], [key: string]: unknown }>}
 */
export async function fetchArc2AvatarStatus(apiEndpoint) {
  const base = String(apiEndpoint || '').replace(/\/$/, '');
  const res = await fetch(`${base}${ARC2AVATAR_STATUS_PATH}`);
  if (!res.ok) {
    return {
      integrated: false,
      blocking_reasons: [`status HTTP ${res.status}`],
    };
  }
  return res.json();
}

/**
 * @param {string} [rigMode]
 * @param {string} [modelPreference]
 */
export function isTemplateRigMode(rigMode, modelPreference) {
  return (
    (rigMode === AUTO_RIG_MODES.TEMPLATE || rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP) &&
    (modelPreference === TEMPLATE_RIG_MODEL_ID || !modelPreference)
  );
}

/**
 * Phase 5 head stitch: template morph head + AIGC body.
 * @param {string} [rigMode]
 * @param {string} [modelPreference]
 */
export function isHumanoidTemplateWrapMode(rigMode, modelPreference) {
  return (
    rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP &&
    (modelPreference === TEMPLATE_RIG_MODEL_ID || !modelPreference)
  );
}

/** @param {string} [taskType] */
export function isArc2AvatarTaskType(taskType) {
  return taskType === ARC2AVATAR_TASK_TYPE;
}

/** @param {string} [taskType] */
export function isBodyClothStudioTaskType(taskType) {
  return taskType === BODY_CLOTH_STUDIO_TASK_TYPE;
}

/**
 * Normalize template id from UI or legacy job payloads.
 * @param {string} [templateId]
 * @returns {string}
 */
export function normalizeHumanoidTemplateId(templateId) {
  const id = String(templateId || DEFAULT_HUMANOID_TEMPLATE_ID).trim().toLowerCase();
  if (DEPRECATED_HUMANOID_TEMPLATE_IDS.includes(id)) return DEFAULT_HUMANOID_TEMPLATE_ID;
  return id || DEFAULT_HUMANOID_TEMPLATE_ID;
}

/**
 * Build auto-rig request fields for template VRM fitting.
 * @param {object} [options]
 * @returns {{ rig_mode: string, humanoid_template_id: string, output_format: string, model_preference: string }}
 */
export function buildTemplateAutoRigOptions(options = {}) {
  return {
    rig_mode: AUTO_RIG_MODES.TEMPLATE,
    humanoid_template_id: normalizeHumanoidTemplateId(options.humanoid_template_id),
    output_format: 'vrm',
    model_preference: TEMPLATE_RIG_MODEL_ID,
  };
}
