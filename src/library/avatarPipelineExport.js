/**
 * Export rigged avatar pipeline results as downloadable VRM.
 *
 * Yes — this triggers a browser file download (same as Save → VRM), using the
 * existing VRMExporter path with template metadata merged from the API manifest.
 */
import { downloadVRMWithAvatar } from './download-utils.js';
import { DEFAULT_HUMANOID_TEMPLATE_ID } from './avatarPipelineCatalog.js';
import { ensureAbsoluteUrl, get3daigcAuthHeaders } from './taskManager.js';
import { loadVrmTemplateMetadataFromSession } from './vrmTemplateMetadata.js';

/**
 * @param {string} apiEndpoint
 * @param {string} [templateId]
 * @returns {Promise<object|null>}
 */
export async function fetchHumanoidTemplateManifest(apiEndpoint, templateId = DEFAULT_HUMANOID_TEMPLATE_ID) {
  const base = (apiEndpoint || '').replace(/\/$/, '');
  if (!base) return null;
  const url = `${base}/api/v1/auto-rigging/humanoid-templates/${templateId}/manifest`;
  try {
    const res = await fetch(url, { headers: get3daigcAuthHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Build VRM meta block for export from API manifest + session VRM parse.
 * @param {object|null} manifest
 * @param {object|null} sessionMeta
 */
export function buildTemplateVrmMeta(manifest, sessionMeta = null) {
  const session = sessionMeta || loadVrmTemplateMetadataFromSession();
  const expected = manifest?.expected || {};
  return {
    title: manifest?.description || 'OpenNexus Avatar',
    author: 'OpenNexus3DStudio',
    version: '1.0',
    allowedUserName: 'Everyone',
    violentUssageName: 'Disallow',
    sexualUssageName: 'Disallow',
    commercialUssageName: 'Allow',
    otherPermissionUrl: '',
    licenseName: 'Other',
    otherLicenseUrl: '',
    templateId: manifest?.template_id || DEFAULT_HUMANOID_TEMPLATE_ID,
    blendShapePresetCount: expected.blend_shape_group_count || session?.blendShapePresets?.length || 0,
    morphTargetCount: expected.morph_target_count || 0,
    note:
      'Skeleton from template rig; facial blend shapes require mesh wrap (see AVATAR_PIPELINE.md).',
  };
}

/**
 * Download the current viewport model as .vrm after template-rig / avatar-from-image.
 *
 * @param {object} params
 * @param {import('three').Object3D} params.model - sceneManager.currentModel
 * @param {string} params.apiEndpoint
 * @param {string} [params.filename]
 * @param {string} [params.humanoidTemplateId]
 * @param {object|null} [params.autoRigMeta]
 * @returns {Promise<void>}
 */
export async function exportAvatarPipelineVrm({
  model,
  apiEndpoint,
  filename = 'avatar_pipeline',
  humanoidTemplateId = DEFAULT_HUMANOID_TEMPLATE_ID,
  autoRigMeta = null,
}) {
  if (!model) {
    throw new Error('No model loaded to export as VRM');
  }

  const manifest = await fetchHumanoidTemplateManifest(apiEndpoint, humanoidTemplateId);
  const vrmMeta = buildTemplateVrmMeta(manifest);
  const safeName = filename.replace(/\.vrm$/i, '');

  const avatarStub = {
    CUSTOM: {
      vrm: {
        meta: vrmMeta,
        humanoid: { humanBones: [] },
        expressions: {},
        scene: model,
      },
      model,
    },
  };

  if (autoRigMeta?.rig_info) {
    vrmMeta.rigMode = autoRigMeta.rig_info.rig_mode;
    vrmMeta.humanoidTemplateId = autoRigMeta.rig_info.humanoid_template_id;
  }

  await downloadVRMWithAvatar(model, avatarStub, safeName, {
    vrmMeta,
    optimized: true,
    createTextureAtlas: true,
    isVrm0: true,
  });
}

/**
 * @param {string} apiEndpoint
 * @param {string} templateVrmUrl - optional direct URL to template.vrm on API static path
 */
export function resolveTemplateVrmAssetUrl(apiEndpoint, templateVrmUrl = '') {
  if (templateVrmUrl && /^https?:\/\//i.test(templateVrmUrl)) return templateVrmUrl;
  const base = ensureAbsoluteUrl(apiEndpoint || '');
  return `${base.replace(/\/$/, '')}/assets/example_autorig/template.vrm`;
}
