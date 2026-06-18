/**
 * Fail production builds when client-embedded secrets are present.
 * Vite inlines VITE_* into the browser bundle — never use true secrets there on Vercel/GitHub Pages.
 *
 * Runs before `vite build` (see package.json). Loads the same env files Vite uses for production mode.
 */
import { loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/** Must not be set for public Vercel / GitHub Pages builds (embedded in client JS). */
export const FORBIDDEN_PUBLIC_CLIENT_SECRETS = [
  'VITE_3DAIGC_API_KEY',
  'VITE_AVATARSDK_CLIENT_SECRET',
  'VITE_THIRDWEB_SECRET_KEY',
  'VITE_PINATA_API_KEY',
  'VITE_PINATA_API_SECRET',
  'VITE_ALCHEMY_API_KEY',
  'VITE_BASE_X402_API_KEY',
  'VITE_VANA_API_KEY',
];

/** Public client IDs are OK on Vercel; listed for documentation only. */
export const ALLOWED_PUBLIC_CLIENT_VARS = [
  'VITE_ASSET_PATH',
  'VITE_PUBLIC_DEMO',
  'VITE_THIRDWEB_CLIENT_ID',
  'VITE_AVATARSDK_CLIENT_ID',
  'VITE_JOB_STATUS_PATH',
];

const PRIVATE_API_PATTERNS = [
  /localhost/i,
  /127\.0\.0\.1/,
  /10\.\d+\.\d+\.\d+/,
  /192\.168\./,
  /172\.(1[6-9]|2\d|3[01])\./,
  /\.local\b/i,
  /tailscale/i,
  /dgx-spark/i,
];

/**
 * @param {Record<string, string>} env
 */
function collectViolations(env) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  for (const key of FORBIDDEN_PUBLIC_CLIENT_SECRETS) {
    const value = String(env[key] || '').trim();
    if (value) {
      errors.push(`${key} is set — remove from Vercel/GitHub env and .env.production (client-visible secret).`);
    }
  }

  const apiEndpoint = String(env.VITE_API_ENDPOINT || '').trim();
  if (apiEndpoint) {
    const isPrivate = PRIVATE_API_PATTERNS.some((re) => re.test(apiEndpoint));
    const isCi =
      env.CI === 'true' ||
      env.CI === '1' ||
      env.VERCEL === '1' ||
      Boolean(env.VERCEL_ENV);
    if (isPrivate && isCi) {
      errors.push(
        `VITE_API_ENDPOINT points at a private host (${apiEndpoint}) — public deploys must not expose LAN/DGX URLs.`,
      );
    } else if (isPrivate) {
      warnings.push(
        `VITE_API_ENDPOINT looks private (${apiEndpoint}). OK for local prod build; unset for Vercel.`,
      );
    }
  }

  if (String(env.VITE_REMOTE_LOG || '').trim() === '1') {
    warnings.push('VITE_REMOTE_LOG=1 — remote logging enabled in production bundle.');
  }

  return { errors, warnings };
}

function main() {
  const mode = 'production';
  const loaded = loadEnv(mode, repoRoot, '');
  const env = { ...process.env, ...loaded };
  const { errors, warnings } = collectViolations(env);

  const isStrict =
    process.argv.includes('--strict') ||
    env.CI === 'true' ||
    env.CI === '1' ||
    env.VERCEL === '1' ||
    Boolean(env.VERCEL_ENV);

  for (const w of warnings) {
    console.warn(`[verify-public-env] warning: ${w}`);
  }

  if (errors.length) {
    const header = isStrict
      ? '[verify-public-env] Public build blocked:'
      : '[verify-public-env] Public deploy risk (local build continuing):';
    console.error(`${header}\n`);
    for (const e of errors) {
      console.error(`  • ${e}`);
    }
    console.error('\nSee docs/PUBLIC_DEPLOY.md — use .env locally; only safe VITE_* on Vercel.');
    if (isStrict) {
      process.exit(1);
    }
    return;
  }

  console.log('[verify-public-env] OK — no forbidden client secrets for production build.');
}

main();
