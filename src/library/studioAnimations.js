import { getFileNameWithoutExtension } from './utils';
import {
  LOOT_DEFAULT_ANIMATIONS,
  resolveMainManifestUrl,
  toPublicAssetUrl,
} from './lootAssetsConfig';

/**
 * @returns {Promise<Array<{ name: string, path: string }>>}
 */
async function resolveStudioAnimationEntries() {
  const mapEntries = (rows) =>
    rows
      .map((entry) => ({
        name: entry.name || getFileNameWithoutExtension(entry.location || ''),
        path: toPublicAssetUrl(entry.location || ''),
      }))
      .filter((e) => e.path);

  for (const manifestUrl of [resolveMainManifestUrl(), '/manifest.json']) {
    try {
      const res = await fetch(manifestUrl, { cache: 'no-store' });
      if (!res.ok) continue;
      const manifest = await res.json();
      const entries = Array.isArray(manifest?.defaultAnimations) ? manifest.defaultAnimations : [];
      const mapped = mapEntries(entries);
      if (mapped.length) return mapped;
    } catch {
      /* try next source */
    }
  }

  return mapEntries(LOOT_DEFAULT_ANIMATIONS);
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

    const first = animationManager._studioAnimationEntries.find((e) => !/t-?pose/i.test(e.name))
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
  const paths = animationManager.animationPaths;
  if (!paths?.length) return Promise.resolve();

  const safeIndex = ((index % paths.length) + paths.length) % paths.length;
  animationManager.curLoadAnim = safeIndex;

  const path = paths[safeIndex];
  const entry = entries?.[safeIndex];
  const name = entry?.name || getFileNameWithoutExtension(path);
  const isPose = /t-?pose/i.test(name);

  return animationManager.loadAnimation(
    path,
    isPose,
    0,
    path.endsWith('.fbx'),
    '',
    name,
  );
}
