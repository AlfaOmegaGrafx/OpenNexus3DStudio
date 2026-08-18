/**
 * Public companion handoff stub (OSS). Full iframe/bridge lives in gitignored src/moat/companion/.
 */
export const COMPANION_HANDOFF_SCHEMA = 'opennexus3d.companion-handoff';
export const COMPANION_HANDOFF_VERSION = 1;
export const COMPANION_HANDOFF_STORAGE_KEY = 'opennexus3d.companionHandoff';

export function createCompanionHandoff(partial = {}) {
  return {
    schema: COMPANION_HANDOFF_SCHEMA,
    version: COMPANION_HANDOFF_VERSION,
    exportedAt: new Date().toISOString(),
    ...partial,
  };
}

export function captureCompanionHandoffFromScene() {
  return createCompanionHandoff({ source: 'viewport' });
}

export function storeCompanionHandoff() {}

export function loadCompanionHandoff() {
  return null;
}

export function parseCompanionHandoffFromLocation() {
  return null;
}

export function resolveCompanionHandoff(override = null) {
  return override || null;
}

export function toCompanionCharacterExtension() {
  return { opennexus3d: { handoffSchema: COMPANION_HANDOFF_SCHEMA }, modules: {}, agents: {} };
}

export function buildCompanionHandoffJson(handoff) {
  return JSON.stringify(toCompanionCharacterExtension(handoff), null, 2);
}

export function downloadCompanionHandoffJson() {}

export async function createCompanionHandoffFromVrmFile(file) {
  return createCompanionHandoff({
    source: 'companion',
    vrm: { source: 'file', fileName: file?.name || 'model.vrm' },
  });
}
