/**
 * Parse VRM / GLB VRM-extension metadata from a file (drag-drop, template export).
 * Used to attach expression presets + humanoid info to rigged AIGC avatars and splat previews.
 */

const VRM_SESSION_KEY = 'characterStudio.vrmTemplateMetadata';

/**
 * @param {ArrayBuffer} buffer
 * @returns {object|null}
 */
export function parseGlbJsonChunk(buffer) {
  if (!buffer || buffer.byteLength < 20) return null;
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) return null; // glTF
  const jsonLen = view.getUint32(12, true);
  const jsonStart = 20;
  if (buffer.byteLength < jsonStart + jsonLen) return null;
  const jsonBytes = new Uint8Array(buffer, jsonStart, jsonLen);
  const text = new TextDecoder().decode(jsonBytes);
  return JSON.parse(text);
}

/**
 * @param {object} gltf
 * @returns {{ spec: string, meta: object, blendShapePresets: string[], humanBoneCount: number }}
 */
export function extractVrmSummaryFromGltf(gltf) {
  if (!gltf || typeof gltf !== 'object') {
    return { spec: 'unknown', meta: {}, blendShapePresets: [], humanBoneCount: 0 };
  }

  const ext = gltf.extensions || {};
  let spec = 'unknown';
  let meta = {};
  let blendShapePresets = [];
  let humanBoneCount = 0;

  if (ext.VRMC_vrm) {
    spec = '1.0';
    meta = ext.VRMC_vrm.meta || {};
    const groups = ext.VRMC_vrm.expressions?.preset || {};
    blendShapePresets = Object.keys(groups);
    humanBoneCount = Object.keys(ext.VRMC_vrm.humanoid?.humanBones || {}).length;
  } else if (ext.VRM) {
    spec = '0.x';
    meta = ext.VRM.meta || {};
    const groups = ext.VRM.blendShapeMaster?.blendShapeGroups || [];
    blendShapePresets = groups.map((g) => g.name).filter(Boolean);
    humanBoneCount = Object.keys(ext.VRM.humanoid?.humanBones || {}).length;
  }

  return { spec, meta, blendShapePresets, humanBoneCount };
}

/**
 * @param {File|ArrayBuffer} source
 * @returns {Promise<object>}
 */
export async function parseVrmFileMetadata(source) {
  let buffer;
  if (source instanceof ArrayBuffer) {
    buffer = source;
  } else if (source instanceof File) {
    buffer = await source.arrayBuffer();
  } else {
    throw new Error('parseVrmFileMetadata expects File or ArrayBuffer');
  }

  const gltf = parseGlbJsonChunk(buffer);
  const summary = extractVrmSummaryFromGltf(gltf);
  return {
    ...summary,
    fileName: source instanceof File ? source.name : null,
    parsedAt: new Date().toISOString(),
  };
}

export function storeVrmTemplateMetadataInSession(metadata) {
  if (typeof sessionStorage === 'undefined' || !metadata) return;
  try {
    sessionStorage.setItem(VRM_SESSION_KEY, JSON.stringify(metadata));
  } catch {
    // ignore quota
  }
}

export function loadVrmTemplateMetadataFromSession() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(VRM_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Pair splat preview URL with last parsed VRM metadata (Gemini-style metadata bridge).
 * @param {string} splatUrl
 * @param {object|null} [vrmMeta]
 */
export function attachSplatPreviewMetadata(splatUrl, vrmMeta = null) {
  const meta = vrmMeta || loadVrmTemplateMetadataFromSession();
  if (!meta || !splatUrl) return null;
  const payload = {
    splatUrl,
    vrmMeta: meta,
    pairedAt: new Date().toISOString(),
  };
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem('characterStudio.splatVrmPair', JSON.stringify(payload));
    } catch {
      // ignore
    }
  }
  return payload;
}
