/**
 * Fetch Digital Twin Passport — mock until 3DAIGC-API phygital routes exist.
 * @see docs/PHYGITAL_PASSPORT_API.md
 */
import { isPhygitalPassport } from './passportSchema.js';
import { getMockPassport } from './passportMockData.js';

function useMockMode() {
  const flag = (import.meta.env.VITE_PHYGITAL_USE_MOCK ?? '1').trim();
  return flag !== '0' && flag.toLowerCase() !== 'false';
}

function resolveApiBase() {
  const base = (import.meta.env.VITE_PHYGITAL_API_BASE || '').trim().replace(/\/$/, '');
  return base || null;
}

/**
 * @param {string} serialId
 * @param {{ tapToken?: string|null }} [options]
 * @returns {Promise<{ passport: import('./passportSchema.js').PhygitalPassport|null, source: 'mock'|'api'|'none', tapToken?: string|null }>}
 */
export async function fetchPhygitalPassport(serialId, options = {}) {
  const id = String(serialId || '').trim();
  const tapToken = options.tapToken ?? null;

  if (!id) {
    return { passport: null, source: 'none', tapToken };
  }

  if (useMockMode() || !resolveApiBase()) {
    const passport = getMockPassport(id);
    return { passport, source: 'mock', tapToken };
  }

  const base = resolveApiBase();
  const url = `${base}/api/v1/phygital/passports/${encodeURIComponent(id)}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return { passport: null, source: 'api', tapToken };
    }
    const data = await res.json();
    if (!isPhygitalPassport(data)) {
      return { passport: null, source: 'api', tapToken };
    }
    return { passport: data, source: 'api', tapToken };
  } catch {
    const fallback = getMockPassport(id);
    return { passport: fallback, source: fallback ? 'mock' : 'none', tapToken };
  }
}

/**
 * Phase 3: POST tap verification. Mock always returns valid for known serials.
 * @param {string} serialId
 * @param {string|null} tapToken
 */
export async function verifyNfcTap(serialId, tapToken) {
  if (useMockMode() || !resolveApiBase()) {
    const passport = getMockPassport(serialId);
    if (!passport) return { valid: false, reason: 'unknown_serial' };
    return {
      valid: true,
      mock: true,
      message: 'Tap verification mock — SUN/CMAC validation pending NFC supplier (TBD).',
      tapToken,
    };
  }

  const base = resolveApiBase();
  const res = await fetch(`${base}/api/v1/phygital/taps/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ serialId, tapToken }),
  });
  if (!res.ok) return { valid: false, reason: 'verify_failed' };
  return res.json();
}
