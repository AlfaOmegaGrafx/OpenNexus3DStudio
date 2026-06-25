/**
 * Loot assets from https://github.com/m3-org/loot-assets
 * Local: ../loot-assets linked as public/loot-assets.
 * Vercel: VITE_ASSET_PATH=https://m3-org.github.io/loot-assets/ (CDN, no full clone).
 * @see docs/VERCEL_LOOT_ASSETS.md
 */

export const LOOT_ASSETS_GITHUB_REPO = 'https://github.com/m3-org/loot-assets';
export const LOOT_ASSETS_GITHUB_PAGES = 'https://m3-org.github.io/loot-assets/';

export const LOOT_ASSETS_ROOT = '/loot-assets';
export const LOOT_MODELS_MANIFEST_URL = `${LOOT_ASSETS_ROOT}/models/manifest.json`;
export const LOOT_MAIN_MANIFEST_URL = `${LOOT_ASSETS_ROOT}/manifest.json`;

/** Mixamo FBX clips used by the bottom animation bar (local bundle fallback). */
export const LOOT_DEFAULT_ANIMATIONS = [
  { name: 'T-Pose', description: 'T-Pose', location: `${LOOT_ASSETS_ROOT}/animations/1_T-Pose.fbx` },
  { name: 'Idle', description: 'Idle', location: `${LOOT_ASSETS_ROOT}/animations/2_Idle.fbx` },
  { name: 'Walking', description: 'Walking', location: `${LOOT_ASSETS_ROOT}/animations/3_Walking.fbx` },
  { name: 'Waving', description: 'Waving', location: `${LOOT_ASSETS_ROOT}/animations/4_Waving.fbx` },
];

/**
 * CDN / remote base from VITE_ASSET_PATH (no trailing slash), or '' for same-origin /loot-assets.
 * Accepts base URL or direct manifest.json URL.
 * @returns {string}
 */
export function resolveLootAssetBaseUrl() {
  const fromEnv = (import.meta.env.VITE_ASSET_PATH || '').trim();
  if (!/^https?:\/\//i.test(fromEnv)) return '';
  let url = fromEnv.replace(/\/$/, '');
  if (url.endsWith('/manifest.json')) {
    url = url.slice(0, -'/manifest.json'.length);
  }
  return url;
}

/**
 * Main character index manifest (VITE_ASSET_PATH or /loot-assets/manifest.json).
 * @returns {string}
 */
export function resolveMainManifestUrl() {
  const base = resolveLootAssetBaseUrl();
  if (base) return `${base}/manifest.json`;

  const fromEnv = (import.meta.env.VITE_ASSET_PATH || '').trim();
  if (fromEnv) {
    if (fromEnv.startsWith('/')) return fromEnv;
    const normalized = fromEnv.replace(/^\.\//, '').replace(/\/$/, '');
    if (!normalized || normalized === '.') {
      return LOOT_MAIN_MANIFEST_URL;
    }
    return `/${normalized}`;
  }
  return LOOT_MAIN_MANIFEST_URL;
}

/**
 * Loot models manifest (Appearance / trait bootstrap).
 * GitHub Pages uses /loot/models/; flat clone uses /models/.
 * @returns {string}
 */
export function resolveLootModelsManifestUrl() {
  const base = resolveLootAssetBaseUrl();
  if (!base) return LOOT_MODELS_MANIFEST_URL;
  if (base.includes('github.io')) {
    return `${base}/loot/models/manifest.json`;
  }
  return `${base}/models/manifest.json`;
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
 * Rewrite manifest-relative paths when VITE_ASSET_PATH points at a remote CDN.
 * @param {string} assetPath
 * @returns {string}
 */
export function rewriteLootPathForCdn(assetPath) {
  const base = resolveLootAssetBaseUrl();
  if (!base) return assetPath;

  let s = String(assetPath || '').trim().replace(/\\/g, '/');
  if (!s || /^https?:\/\//i.test(s)) return s;

  s = s.replace(/^\.\//, '');
  if (s.startsWith('/loot-assets/')) s = s.slice('/loot-assets/'.length);
  if (s.startsWith('loot-assets/')) s = s.slice('loot-assets/'.length);

  if (base.includes('github.io')) {
    if (
      s.startsWith('models/') ||
      s.startsWith('animations/') ||
      s.startsWith('icons/') ||
      s.startsWith('anata/') ||
      s.startsWith('0N1/') ||
      s.startsWith('tubbycats/')
    ) {
      s = `loot/${s}`;
    }
  }

  return `${base}/${s}`;
}

/**
 * Normalize manifest-relative asset paths for fetch/GLTFLoader.
 * @param {string} path
 * @returns {string}
 */
export function normalizeLootAssetUrl(path) {
  const s = String(path || '').trim();
  if (!s) return s;

  const cdn = resolveLootAssetBaseUrl();
  if (cdn) {
    return rewriteLootPathForCdn(s);
  }

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
  const manifestUrl = options.manifestUrl || resolveLootModelsManifestUrl();
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
