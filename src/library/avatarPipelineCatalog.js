/**
 * Avatar pipeline constants — mesh generation → template VRM rig → viewport.
 * Backend: 3DAIGC-API `rig_mode: "template"` + `humanoid_template_id` (UniRig).
 */

/** Primary humanoid template id (maps to assets/example_autorig/template.vrm). */
export const DEFAULT_HUMANOID_TEMPLATE_ID = 'template';

/** @deprecated Use DEFAULT_HUMANOID_TEMPLATE_ID — kept for older API payloads. */
export const LEGACY_HUMANOID_TEMPLATE_ID = 'sifr2';

export const HUMANOID_TEMPLATE_OPTIONS = [
  {
    value: DEFAULT_HUMANOID_TEMPLATE_ID,
    label: 'Template VRM (master rig + facial blend shapes)',
    vrmFile: 'template.vrm',
  },
];

export const AUTO_RIG_MODES = {
  SKELETON: 'skeleton',
  FULL: 'full',
  SKIN: 'skin',
  TEMPLATE: 'template',
};

/** UniRig-only — SkinTokens rejects template mode on the API. */
export const TEMPLATE_RIG_MODEL_ID = 'unirig_auto_rig';

/**
 * @param {string} [rigMode]
 * @param {string} [modelPreference]
 */
export function isTemplateRigMode(rigMode, modelPreference) {
  return (
    rigMode === AUTO_RIG_MODES.TEMPLATE &&
    (modelPreference === TEMPLATE_RIG_MODEL_ID || !modelPreference)
  );
}

/**
 * Normalize template id from UI or legacy job payloads.
 * @param {string} [templateId]
 * @returns {string}
 */
export function normalizeHumanoidTemplateId(templateId) {
  const id = String(templateId || DEFAULT_HUMANOID_TEMPLATE_ID).trim().toLowerCase();
  if (id === LEGACY_HUMANOID_TEMPLATE_ID) return DEFAULT_HUMANOID_TEMPLATE_ID;
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
    output_format: 'glb',
    model_preference: TEMPLATE_RIG_MODEL_ID,
  };
}
