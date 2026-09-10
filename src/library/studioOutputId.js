/**
 * Studio output IDs — tight names so DGX `outputs/` can be wiped by prefix.
 *
 * Pattern: `studio_<tpl>_<YYYYMMDDTHHMM>_<slug>[_<role>]`
 * Examples:
 *   studio_bc_20260906T2122_krea_composable_body
 *   studio_mv_20260906T2122_knight_front
 *   studio_bc_20260906T2122_job1_chest_hoodie
 *
 * OpenNexus 3D Task Manager jobs do **not** use this prefix.
 * Wipe: `bash scripts/wipe-studio-outputs.sh` (matches `studio_` in filenames).
 */
import { OBJECT_NAME_MAX_LEN, slugifyObjectName } from './objectNameUtils.js';

export const STUDIO_OUTPUT_PREFIX = 'studio_';

/** Short codes for Studio template ids (stable for greps / wipe scripts). */
export const STUDIO_TEMPLATE_CODE = Object.freeze({
  krea_trellis2: 't2',
  krea_mage_pixel3dm: 'mage',
  krea_mage_trellis2: 'mage',
  krea_trellis_multiview: 'mv',
  krea_composable_avatar_body: 'bc',
});

/**
 * @param {string} [templateId]
 * @returns {string}
 */
export function studioTemplateCode(templateId) {
  const id = String(templateId || '').trim();
  return STUDIO_TEMPLATE_CODE[id] || 'x';
}

/**
 * Compact UTC stamp for filenames (minute resolution).
 * @param {Date} [when]
 * @returns {string}
 */
export function studioUtcStamp(when = new Date()) {
  const d = when instanceof Date ? when : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
  );
}

/**
 * @param {string|null|undefined} name
 * @returns {boolean}
 */
export function isStudioOutputName(name) {
  return typeof name === 'string' && name.trim().toLowerCase().startsWith(STUDIO_OUTPUT_PREFIX);
}

/**
 * Build a wipe-friendly Studio object_name (also becomes the DGX file stem when adapters honor it).
 *
 * @param {{
 *   templateId?: string,
 *   projectName?: string,
 *   role?: string,
 *   viewId?: string,
 *   when?: Date,
 * }} opts
 * @returns {string}
 */
export function buildStudioObjectName(opts = {}) {
  const code = studioTemplateCode(opts.templateId);
  const stamp = studioUtcStamp(opts.when);
  const baseSlug = slugifyObjectName(opts.projectName || opts.role || 'asset', 'asset').slice(0, 40);
  const parts = [STUDIO_OUTPUT_PREFIX.replace(/_$/, ''), code, stamp, baseSlug];
  if (opts.viewId) {
    parts.push(slugifyObjectName(opts.viewId, 'view').slice(0, 12));
  }
  if (opts.role && opts.role !== 'asset' && opts.role !== 'body') {
    const roleSlug = slugifyObjectName(opts.role, 'role').slice(0, 16);
    if (roleSlug && !baseSlug.includes(roleSlug)) parts.push(roleSlug);
  }
  return parts.join('_').slice(0, OBJECT_NAME_MAX_LEN);
}

/**
 * Filename / path matchers for Studio wipe (case-insensitive).
 * Does **not** match `*.studio_motion.json` (Kimodo/Live Speech motion format).
 * @returns {string[]}
 */
export function studioOutputWipeGlobs() {
  return [
    '**/studio_*',
    '**/*_studio_*',
  ];
}

const STUDIO_CODE_LABEL = Object.freeze({
  t2: 'Textured 3D Mesh',
  mage: 'Edit then 3D Mesh',
  mv: 'Six Image View to 3D Mesh',
  bc: 'Body+Cloth',
});

/**
 * Compact sidebar title for long Studio object names; full id stays in `title`.
 * `studio_bc_20260907T0449_Body_and_Clothing` → `Body+Cloth · Body and Clothing`
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function formatStudioTaskCardTitle(name) {
  if (typeof name !== 'string' || !name.trim()) return name || '';
  const raw = name.trim();
  if (!isStudioOutputName(raw)) return raw;
  const parts = raw.split('_');
  if (parts.length < 4 || parts[0].toLowerCase() !== 'studio') return raw;
  const code = parts[1];
  const stamp = parts[2] || '';
  const looksLikeStamp = /^\d{8}T\d{4}/.test(stamp);
  const slugParts = looksLikeStamp ? parts.slice(3) : parts.slice(2);
  const slug = slugParts.join(' ').replace(/\s+/g, ' ').trim();
  const label = STUDIO_CODE_LABEL[code] || `studio_${code}`;
  return slug ? `${label} · ${slug}` : label;
}
