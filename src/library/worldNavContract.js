/**
 * World frame + navigation goal contract (OpenNexus XR ↔ xr-ai VLM ↔ companion overlay).
 * Thin schema only — no interactive-motion client merge. Owners write/read via postMessage + sessionStorage.
 *
 * @see docs/FUTURE_RD.md (gitignored strategy notes)
 */

export const WORLD_NAV_CONTRACT_VERSION = 1

/** @typedef {'floor' | 'world' | 'headset'} WorldFrameId */

/**
 * Metric world frame anchored to env-scan twin (1:1 m scale).
 * @typedef {object} WorldFrame
 * @property {number} version
 * @property {WorldFrameId} frameId
 * @property {string} twinId - env-scan / world package id
 * @property {[number, number, number, number]} floorOrigin - [x, y, z, yawRad] in meters
 * @property {number} scaleMeters - must be 1.0 for calibrated twins
 * @property {number} updatedAt - epoch ms
 */

/**
 * Navigation goal for companion or agent locomotion.
 * @typedef {object} NavGoal
 * @property {string} id
 * @property {'point' | 'label' | 'follow'} kind
 * @property {[number, number, number]} [position] - meters in world frame (point)
 * @property {string} [label] - semantic target from xr-ai VLM (label)
 * @property {[number, number, number, number]} [bbox] - normalized [x1,y1,x2,y2] from vision
 * @property {number} [confidence] - detection score 0–1
 * @property {number} [toleranceM] - arrival radius, default 0.5
 * @property {string} [source] - e.g. 'xr-ai', 'companion', 'opennexus-xr'
 * @property {number} issuedAt
 */

/**
 * Envelope for cross-app messages (postMessage / MCP).
 * @typedef {object} WorldNavEnvelope
 * @property {'opennexus3d.worldNav'} type
 * @property {'set-frame' | 'set-goal' | 'clear-goal' | 'ping'} action
 * @property {WorldFrame | NavGoal | { goalId?: string }} payload
 */

export const WORLD_NAV_MSG_TYPE = 'opennexus3d.worldNav'

const STORAGE_KEY = 'opennexus3d.worldNav'

/** @returns {WorldFrame | null} */
export function loadWorldFrame() {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}.frame`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version !== WORLD_NAV_CONTRACT_VERSION) return null
    return parsed
  }
  catch {
    return null
  }
}

/** @param {WorldFrame} frame */
export function saveWorldFrame(frame) {
  sessionStorage.setItem(`${STORAGE_KEY}.frame`, JSON.stringify({
    ...frame,
    version: WORLD_NAV_CONTRACT_VERSION,
    updatedAt: Date.now(),
  }))
}

/** @returns {NavGoal | null} */
export function loadNavGoal() {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}.goal`)
    if (!raw) return null
    return JSON.parse(raw)
  }
  catch {
    return null
  }
}

/** @param {NavGoal} goal */
export function saveNavGoal(goal) {
  sessionStorage.setItem(`${STORAGE_KEY}.goal`, JSON.stringify(goal))
}

export function clearNavGoal() {
  sessionStorage.removeItem(`${STORAGE_KEY}.goal`)
}

/**
 * @param {Window} target
 * @param {string} targetOrigin
 * @param {WorldNavEnvelope['action']} action
 * @param {WorldNavEnvelope['payload']} payload
 */
export function postWorldNav(target, targetOrigin, action, payload) {
  target.postMessage({
    type: WORLD_NAV_MSG_TYPE,
    action,
    payload,
  }, targetOrigin)
}

/**
 * Build a point goal in the active world frame.
 * @param {[number, number, number]} position
 * @param {Partial<NavGoal>} [extra]
 * @returns {NavGoal}
 */
export function createPointNavGoal(position, extra = {}) {
  return {
    id: `nav-${Date.now()}`,
    kind: 'point',
    position,
    toleranceM: 0.5,
    source: 'opennexus-xr',
    issuedAt: Date.now(),
    ...extra,
  }
}

/**
 * Semantic label goal from zero-shot vision (Grounding DINO / xr-ai VLM).
 * @param {string} label
 * @param {Partial<NavGoal>} [extra]
 * @returns {NavGoal}
 */
export function createLabelNavGoal(label, extra = {}) {
  return {
    id: `nav-${Date.now()}`,
    kind: 'label',
    label: String(label).trim(),
    toleranceM: 0.5,
    source: 'grounding-dino',
    issuedAt: Date.now(),
    ...extra,
  }
}

/**
 * @param {Window} source
 * @param {WorldNavEnvelope} envelope
 */
export function isWorldNavMessage(source, envelope) {
  return (
    envelope?.type === WORLD_NAV_MSG_TYPE
    && typeof envelope.action === 'string'
    && envelope.payload != null
  )
}
