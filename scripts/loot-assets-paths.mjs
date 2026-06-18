/**
 * Canonical loot-assets source (not vendored in OpenNexus3DStudio).
 * @see https://github.com/m3-org/loot-assets
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOOT_ASSETS_GITHUB_REPO = 'https://github.com/m3-org/loot-assets';
export const LOOT_ASSETS_GIT_CLONE_URL = `${LOOT_ASSETS_GITHUB_REPO}.git`;
export const LOOT_ASSETS_DEFAULT_BRANCH = 'main';
/** GitHub Pages CDN (optional remote manifest path via VITE_ASSET_PATH). */
export const LOOT_ASSETS_GITHUB_PAGES = 'https://m3-org.github.io/loot-assets/';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(__dirname, '..');

/** @deprecated use LOOT_ASSETS_GIT_CLONE_URL */
export const LOOT_ASSETS_REPO = LOOT_ASSETS_GIT_CLONE_URL;

/**
 * Shared paths for loot-assets: external clone + public/ junction (or symlink).
 *
 * Local dev: clone to <repo>/../loot-assets, link public/loot-assets.
 * Vercel/CI: shallow clone into public/loot-assets during `npm run build`.
 *
 * Override external dir: LOOT_ASSETS_EXTERNAL_DIR
 */

/** @returns {string} */
export function resolveExternalLootDir() {
  const fromEnv = (process.env.LOOT_ASSETS_EXTERNAL_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(repoRoot, '..', 'loot-assets');
}

export const publicLootLink = path.join(repoRoot, 'public', 'loot-assets');

/** True on Vercel/GitHub Actions — clone into public/ for deploy bundle. */
export function useExternalLootDir() {
  if (process.env.LOOT_ASSETS_INLINE === '1') return false;
  if (process.env.CI === 'true' || process.env.CI === '1') return false;
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) return false;
  return true;
}

/**
 * @param {string} dir
 */
export function hasLootManifest(dir) {
  try {
    const manifestPath = path.join(dir, 'manifest.json');
    return fs.existsSync(manifestPath) && fs.statSync(manifestPath).isFile();
  } catch {
    return false;
  }
}

/**
 * @param {string} linkPath
 * @returns {boolean}
 */
export function isDirectoryJunctionOrSymlink(linkPath) {
  try {
    if (!fs.existsSync(linkPath)) return false;
    const stat = fs.lstatSync(linkPath);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/** SVG icons imported at build time from public/loot-assets/icons (see ensure-loot-assets.mjs). */
export const LOOT_BUILD_ICON_FILES = [
  'BODY.svg',
  'HEAD.svg',
  'WEAPON.svg',
  'CHEST.svg',
  'HANDS.svg',
  'SHOES.svg',
  'HAIR.svg',
  'EYES.svg',
  'HATS.svg',
  'MASKS.svg',
  'WINGS.svg',
  'TAIL.svg',
  'SIGIL.svg',
  'Special.svg',
  'TYPE.svg',
];

/** True when VITE_ASSET_PATH is an http(s) CDN — skip full loot-assets clone at build. */
export function usesRemoteLootManifest() {
  const p = (process.env.VITE_ASSET_PATH || '').trim();
  return /^https?:\/\//i.test(p);
}

/** @param {string} linkPath */
export function isLootLinkReady(linkPath) {
  return hasLootManifest(linkPath);
}
