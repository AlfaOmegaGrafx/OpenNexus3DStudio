/**
 * Local loot-assets under `public/loot-assets/` (served at `/loot-assets/…`).
 */

export const LOOT_ASSETS_ROOT = '/loot-assets';
export const LOOT_MODELS_MANIFEST_URL = `${LOOT_ASSETS_ROOT}/models/manifest.json`;
export const LOOT_MAIN_MANIFEST_URL = `${LOOT_ASSETS_ROOT}/manifest.json`;

/** Mixamo FBX clips used by the bottom animation bar. */
export const LOOT_DEFAULT_ANIMATIONS = [
  { name: 'T-Pose', description: 'T-Pose', location: `${LOOT_ASSETS_ROOT}/animations/1_T-Pose.fbx` },
  { name: 'Idle', description: 'Idle', location: `${LOOT_ASSETS_ROOT}/animations/2_Idle.fbx` },
  { name: 'Walking', description: 'Walking', location: `${LOOT_ASSETS_ROOT}/animations/3_Walking.fbx` },
  { name: 'Waving', description: 'Waving', location: `${LOOT_ASSETS_ROOT}/animations/4_Waving.fbx` },
];

/**
 * Resolve `VITE_ASSET_PATH` or fall back to the bundled loot character index manifest.
 * @returns {string}
 */
export function resolveMainManifestUrl() {
  const fromEnv = (import.meta.env.VITE_ASSET_PATH || '').trim();
  if (fromEnv) {
    if (/^https?:\/\//i.test(fromEnv)) return fromEnv;
    if (fromEnv.startsWith('/')) return fromEnv;
    const normalized = fromEnv.replace(/^\.\//, '').replace(/\/$/, '');
    // VITE_ASSET_PATH=./ or ./public must not resolve to "/" (SPA index.html)
    if (!normalized || normalized === '.') {
      return LOOT_MAIN_MANIFEST_URL;
    }
    return `/${normalized}`;
  }
  return LOOT_MAIN_MANIFEST_URL;
}

/**
 * @param {string} location
 * @returns {string}
 */
export function toPublicAssetUrl(location) {
  const s = String(location || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return s;
  return `/${s.replace(/^\.\//, '')}`;
}

/**
 * Normalize manifest-relative asset paths for fetch/GLTFLoader.
 * Rewrites legacy pre-flatten `/loot-assets/loot/` → `/loot-assets/`.
 * @param {string} path
 * @returns {string}
 */
export function normalizeLootAssetUrl(path) {
  const s = String(path || '').trim();
  if (!s) return s;
  let normalized = s.replace(/\\/g, '/').replace(/\/\.\//g, '/');
  normalized = normalized.replace(/\/loot-assets\/loot\//g, '/loot-assets/');
  normalized = normalized.replace(/^\.\/loot-assets\/loot\//, '/loot-assets/');
  return toPublicAssetUrl(normalized);
}

/** @param {import('./characterManager').CharacterManager | null | undefined} characterManager */
export function manifestUsesLegacyLootPath(characterManager) {
  const dir = characterManager?.manifestDataManager?.mainManifestData?.getAssetsDirectory?.() || '';
  return /loot-assets\/loot/i.test(String(dir));
}

/**
 * Load the default Loot modular character (traits + scene attachment).
 * @param {import('./characterManager').CharacterManager} characterManager
 * @param {{ manifestUrl?: string, identifier?: string, force?: boolean, hideInViewport?: boolean, manifestOnly?: boolean }} [options]
 */
export async function bootstrapLootCharacter(characterManager, options = {}) {
  if (!characterManager) return false;
  const manifestUrl = options.manifestUrl || LOOT_MODELS_MANIFEST_URL;
  const identifier = options.identifier || 'Loot';
  const force = options.force === true;
  /** @deprecated use manifestOnly — do not load traits into the scene on startup */
  const hideInViewport = options.hideInViewport === true;
  const manifestOnly = options.manifestOnly === true || hideInViewport;

  let hasManifest = characterManager.manifestDataManager?.hasExistingManifest?.();
  const hasAvatarTraits = Object.keys(characterManager.avatar || {}).length > 0;

  if (hasManifest && (force || manifestUsesLegacyLootPath(characterManager))) {
    console.warn('[LootAssets] Reloading manifest (legacy loot path or forced refresh)');
    characterManager.removeCurrentManifest();
    hasManifest = false;
  }

  if (hasManifest && hasAvatarTraits && !force) {
    if (manifestOnly) {
      characterManager.setCharacterVisible(false);
    }
    return true;
  }

  if (hasManifest && manifestOnly && !force) {
    characterManager.setCharacterVisible(false);
    return true;
  }

  if (!hasManifest) {
    await characterManager.loadManifest(manifestUrl, identifier);
  }

  if (manifestOnly) {
    characterManager.setCharacterVisible(false);
    console.log('[LootAssets] Manifest-only bootstrap complete (traits not loaded until equipped)');
    return true;
  }

  await characterManager.loadInitialTraits();
  characterManager.setCharacterVisible(true);
  const traitCount = Object.keys(characterManager.avatar || {}).length;
  console.log('[LootAssets] Bootstrap complete, traits loaded:', traitCount);
  return traitCount > 0;
}
