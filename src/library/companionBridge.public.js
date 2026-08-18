/**
 * Public companion bridge stub. Live postMessage bridge is gitignored (src/moat/companion/).
 */
export function sendToCompanion() {
  return Promise.resolve(false);
}

export function pingCompanion() {
  return Promise.resolve(false);
}

export function loadProviderConfig() {
  return { llm: {}, tts: {}, stt: {} };
}

export function saveProviderConfig() {}

export async function pushAllToCompanion() {
  return { providers: false, model: false, character: false };
}
