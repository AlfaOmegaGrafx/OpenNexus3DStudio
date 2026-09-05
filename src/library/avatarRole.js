/**
 * OpenNexus Avatar Role — portable AI personality attached to a VRM.
 *
 * Public schema (MIT) so marketplace avatars + third-party apps can read the same
 * glTF extras key. User-facing product term: **Role** (never "Persona" in UI).
 *
 * Embed path: glTF root `extras["opennexus.avatar_role"]`
 * Storage key (Companion sync): `opennexus3d.avatarRole`
 */

export const AVATAR_ROLE_SPEC = 'opennexus.avatar_role'
export const AVATAR_ROLE_SPEC_VERSION = '1.0'
export const AVATAR_ROLE_EXTRAS_KEY = 'opennexus.avatar_role'
export const AVATAR_ROLE_STORAGE_KEY = 'opennexus3d.avatarRole'
/** Plain prompt fallback used by Live Speech / side panel. */
export const AVATAR_ROLE_PROMPT_STORAGE_KEY = 'n3p6/character-role-prompt'
export const AVATAR_ROLE_EVENT = 'opennexus3d:avatar-role'

/**
 * @typedef {object} AvatarRoleData
 * @property {string} spec
 * @property {string} spec_version
 * @property {string} name
 * @property {string} description
 * @property {string} [personality]
 * @property {string} [creator]
 * @property {string} [character_version]
 * @property {Record<string, unknown>} [extensions]
 */

/**
 * Normalize unknown JSON (OpenNexus Role, SillyTavern V2/V3-shaped, or flat) into Role data.
 * @param {unknown} raw
 * @returns {AvatarRoleData | null}
 */
export function normalizeAvatarRole(raw) {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return null
    try {
      return normalizeAvatarRole(JSON.parse(text))
    } catch {
      return {
        spec: AVATAR_ROLE_SPEC,
        spec_version: AVATAR_ROLE_SPEC_VERSION,
        name: 'Companion',
        description: text,
        personality: '',
        creator: '',
        character_version: '1',
        extensions: {},
      }
    }
  }
  if (typeof raw !== 'object') return null

  const obj = /** @type {Record<string, unknown>} */ (raw)

  // Nested under extras key
  if (obj[AVATAR_ROLE_EXTRAS_KEY] && typeof obj[AVATAR_ROLE_EXTRAS_KEY] === 'object') {
    return normalizeAvatarRole(obj[AVATAR_ROLE_EXTRAS_KEY])
  }

  // SillyTavern / chara_card_v2|v3 shape
  const data = (obj.data && typeof obj.data === 'object')
    ? /** @type {Record<string, unknown>} */ (obj.data)
    : obj

  const name = String(data.name || obj.name || 'Companion').trim() || 'Companion'
  const description = String(
    data.description || obj.description || data.system_prompt || '',
  ).trim()
  if (!description && !name) return null

  return {
    spec: AVATAR_ROLE_SPEC,
    spec_version: AVATAR_ROLE_SPEC_VERSION,
    name,
    description: description || name,
    personality: String(data.personality || obj.personality || '').trim(),
    creator: String(data.creator || obj.creator || '').trim(),
    character_version: String(data.character_version || obj.character_version || '1').trim() || '1',
    extensions: (data.extensions && typeof data.extensions === 'object')
      ? /** @type {Record<string, unknown>} */ (data.extensions)
      : {},
  }
}

/**
 * @param {AvatarRoleData | null | undefined} role
 * @returns {AvatarRoleData | null}
 */
export function serializeAvatarRole(role) {
  const n = normalizeAvatarRole(role)
  return n
}

/**
 * Build glTF root extras fragment for VRM export.
 * @param {unknown} role
 * @returns {Record<string, AvatarRoleData> | null}
 */
export function avatarRoleToGltfExtras(role) {
  const n = normalizeAvatarRole(role)
  if (!n) return null
  return { [AVATAR_ROLE_EXTRAS_KEY]: n }
}

/**
 * Read Role from glTF JSON (parser.json or parsed GLB JSON chunk).
 * @param {unknown} gltfJson
 * @returns {AvatarRoleData | null}
 */
export function readAvatarRoleFromGltfJson(gltfJson) {
  if (!gltfJson || typeof gltfJson !== 'object') return null
  const json = /** @type {Record<string, unknown>} */ (gltfJson)
  const extras = json.extras
  if (extras && typeof extras === 'object') {
    const fromExtras = normalizeAvatarRole(
      /** @type {Record<string, unknown>} */ (extras)[AVATAR_ROLE_EXTRAS_KEY]
        ?? extras,
    )
    if (fromExtras?.description) return fromExtras
  }
  // Some tools nest under extensions
  const ext = json.extensions
  if (ext && typeof ext === 'object') {
    const e = /** @type {Record<string, unknown>} */ (ext)
    if (e[AVATAR_ROLE_EXTRAS_KEY]) return normalizeAvatarRole(e[AVATAR_ROLE_EXTRAS_KEY])
  }
  return null
}

/**
 * Merge Role into VRM download/export options (mutates a shallow copy).
 * @param {Record<string, unknown>} exportOptions
 * @param {unknown} [role]
 * @returns {Record<string, unknown>}
 */
export function mergeAvatarRoleIntoExportOptions(exportOptions = {}, role) {
  const fromArg = normalizeAvatarRole(role)
  const fromStorage = readAvatarRoleFromStorage()
  const resolved = fromArg || fromStorage
  if (!resolved) return { ...exportOptions }
  return {
    ...exportOptions,
    avatarRole: resolved,
  }
}

/**
 * @returns {AvatarRoleData | null}
 */
export function readAvatarRoleFromStorage() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(AVATAR_ROLE_STORAGE_KEY)
    const fromFull = normalizeAvatarRole(raw)
    if (fromFull?.description) return fromFull
    const prompt = localStorage.getItem(AVATAR_ROLE_PROMPT_STORAGE_KEY)
    return normalizeAvatarRole(prompt)
  } catch {
    return null
  }
}

/**
 * Persist Role for Companion + export (browser only).
 * @param {unknown} role
 */
export function writeAvatarRoleToStorage(role) {
  if (typeof localStorage === 'undefined') return
  const n = normalizeAvatarRole(role)
  try {
    if (!n) {
      localStorage.removeItem(AVATAR_ROLE_STORAGE_KEY)
      localStorage.removeItem(AVATAR_ROLE_PROMPT_STORAGE_KEY)
    } else {
      localStorage.setItem(AVATAR_ROLE_STORAGE_KEY, JSON.stringify(n))
      const prompt = [n.name && n.name !== 'Companion' ? `Role: ${n.name}` : '', n.description]
        .filter(Boolean)
        .join('\n\n')
        .trim()
      if (prompt) localStorage.setItem(AVATAR_ROLE_PROMPT_STORAGE_KEY, prompt)
      else localStorage.removeItem(AVATAR_ROLE_PROMPT_STORAGE_KEY)
    }
  } catch { /* ignore quota */ }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AVATAR_ROLE_EVENT, { detail: n }))
    window.dispatchEvent(new CustomEvent('opennexus3d:character-role'))
  }
}
