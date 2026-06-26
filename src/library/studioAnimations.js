import { getFileNameWithoutExtension } from './utils';
import {
  LOOT_DEFAULT_ANIMATIONS,
  normalizeLootAssetUrl,
} from './lootAssetsConfig';

/**
 * @param {Array<{ name?: string, location?: string, description?: string }>} rows
 * @returns {Array<{ name: string, path: string }>}
 */
function mapAnimationEntries(rows) {
  const seen = new Set();
  /** @type {Array<{ name: string, path: string }>} */
  const out = [];
  for (const entry of rows) {
    const name = entry.name || getFileNameWithoutExtension(entry.location || '');
    const path = normalizeLootAssetUrl(entry.location || '', name);
    if (!path) continue;
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, path });
  }
  return out;
}

/**
 * Canonical studio animation bar clips (numbered Mixamo FBX on loot-assets CDN).
 * Upstream main manifest `defaultAnimations` often lists wrong filenames (Walking.fbx vs 3_Walking.fbx).
 * @returns {Array<{ name: string, path: string }>}
 */
export function resolveCanonicalStudioAnimationEntries() {
  return mapAnimationEntries(LOOT_DEFAULT_ANIMATIONS);
}

/**
 * @returns {Promise<Array<{ name: string, path: string }>>}
 */
async function resolveStudioAnimationEntries() {
  return resolveCanonicalStudioAnimationEntries();
}

/**
 * Load OpenNexus3DStudio default animation templates from the main manifest
 * (`defaultAnimations`) or bundled loot FBX clips under `/loot-assets/animations/`.
 *
 * @param {import('./animationManager').AnimationManager | null | undefined} animationManager
 * @returns {Promise<boolean>} true when at least one animation was registered
 */
export async function loadStudioDefaultAnimations(animationManager) {
  if (!animationManager || animationManager._studioDefaultsLoaded) {
    return false;
  }

  try {
    const entries = await resolveStudioAnimationEntries();
    if (!entries.length) return false;

    animationManager._studioAnimationEntries = entries;

    if (!animationManager._studioAnimationEntries.length) return false;

    animationManager.animationPaths = animationManager._studioAnimationEntries.map((e) => e.path);
    animationManager.defaultAnimations = animationManager.animationPaths;
    animationManager.curLoadAnim = 0;
    animationManager._studioDefaultsLoaded = true;

    const first =
      animationManager._studioAnimationEntries.find((e) => /t-?pose/i.test(e.name))
      ?? animationManager._studioAnimationEntries[0];
    animationManager.curLoadAnim = animationManager._studioAnimationEntries.indexOf(first);
    if (animationManager.curLoadAnim < 0) animationManager.curLoadAnim = 0;
    const isPose = /t-?pose/i.test(first.name);
    try {
      await animationManager.loadAnimation(
        first.path,
        isPose,
        0,
        first.path.endsWith('.fbx'),
        '',
        first.name,
      );
    } catch (loadErr) {
      console.warn(
        '[StudioAnimations] Could not load initial animation (file may be missing):',
        loadErr?.message || loadErr,
      );
      animationManager.currentAnimationName = first.name;
    }
    return true;
  } catch (err) {
    console.warn('[StudioAnimations] Failed to load default animations:', err?.message || err);
    return false;
  }
}

/**
 * @param {import('./animationManager').AnimationManager} animationManager
 * @param {number} index
 */
export function loadStudioAnimationAtIndex(animationManager, index) {
  const entries = animationManager._studioAnimationEntries;
  if (!entries?.length) return Promise.resolve();

  const safeIndex = ((index % entries.length) + entries.length) % entries.length;
  animationManager.curLoadAnim = safeIndex;

  const entry = entries[safeIndex];
  const path = entry?.path;
  if (!path) return Promise.resolve();

  const name = entry.name || getFileNameWithoutExtension(path);
  const isPose = /t-?pose/i.test(name);

  return animationManager.loadAnimation(
    path,
    isPose,
    0,
    path.endsWith('.fbx'),
    '',
    name,
  ).then(() => {
    animationManager.triggerPrimarySync?.();
    if (!isPose) {
      animationManager.play();
      animationManager.setSpeed(1);
    }
  });
}
