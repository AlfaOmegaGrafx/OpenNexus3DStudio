/**
 * Multi-image input helpers (Phase 1 — docs/MULTI_IMAGE_SPLAT_ROADMAP.md).
 */

export const MAX_REFERENCE_IMAGES = 7;
export const MAX_TOTAL_IMAGES = MAX_REFERENCE_IMAGES + 1;

/** Task types that accept multiple photos (primary + references). */
export const MULTI_IMAGE_TASK_TYPES = new Set([
  'image-to-splat',
  'image-to-world',
  'avatar-from-image',
]);

/**
 * @param {string} taskType
 * @returns {boolean}
 */
export function supportsMultiImageInput(taskType) {
  return MULTI_IMAGE_TASK_TYPES.has(taskType);
}

/**
 * @param {File[]} files
 * @param {number} primaryIndex
 * @returns {{ primary: File|null, references: File[] }}
 */
export function splitPrimaryAndReferenceFiles(files, primaryIndex = 0) {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (list.length === 0) {
    return { primary: null, references: [] };
  }
  const idx = Math.min(Math.max(0, primaryIndex), list.length - 1);
  const primary = list[idx];
  const references = list.filter((_, i) => i !== idx).slice(0, MAX_REFERENCE_IMAGES);
  return { primary, references };
}

/**
 * @param {string} taskType
 * @returns {string}
 */
export function multiImageUploadHint(taskType) {
  if (taskType === 'image-to-splat') {
    return 'Select 1 photo for TripoSplat, or 2+ for WorldMirror 2.0 reconstruction. Mark the best front view as Primary.';
  }
  if (taskType === 'image-to-world') {
    return 'Optional extra angles stored for future fusion. Primary photo drives the environment splat.';
  }
  if (taskType === 'avatar-from-image') {
    return 'Add front/side/back photos when you have them. With 2+ photos, TRELLIS multiview fuses views for mesh quality.';
  }
  return '';
}
