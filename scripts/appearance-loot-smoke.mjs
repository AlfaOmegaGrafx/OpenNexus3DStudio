/**
 * Smoke test: loot manifest + VRM paths (no browser UI).
 * Usage: node scripts/appearance-loot-smoke.mjs [baseUrl]
 * Default baseUrl: https://localhost:3000
 */
import https from 'node:https';
import http from 'node:http';

const base = (process.argv[2] || 'https://localhost:3000').replace(/\/$/, '');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { rejectUnauthorized: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          contentType: res.headers['content-type'] || '',
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error(`timeout: ${url}`));
    });
  });
}

async function fetchJson(path) {
  const url = `${base}${path}`;
  const res = await fetchUrl(url);
  if (res.status !== 200) {
    throw new Error(`${path} HTTP ${res.status}`);
  }
  if (res.body.trimStart().startsWith('<!DOCTYPE')) {
    throw new Error(`${path} returned HTML (expected JSON) — check VITE_ASSET_PATH / vite static paths`);
  }
  return JSON.parse(res.body);
}

async function headOk(path) {
  const url = `${base}${path}`;
  const res = await fetchUrl(url);
  if (res.status !== 200) return false;
  if (res.body.trimStart().startsWith('<!DOCTYPE')) return false;
  return true;
}

async function main() {
  console.log('Appearance loot smoke test @', base);

  const indexManifest = await fetchJson('/loot-assets/manifest.json');
  const chars = indexManifest?.characters || [];
  console.log('  index characters:', chars.length);

  const modelsManifest = await fetchJson('/loot-assets/models/manifest.json');
  const traits = modelsManifest?.traits || [];
  console.log('  trait groups:', traits.length);

  const bodyTrait = traits.find((t) => t.trait === 'Body');
  const sample = bodyTrait?.collection?.[0];
  if (!sample) throw new Error('No Body trait in models manifest');

  const assetsLocation = (modelsManifest.assetsLocation || './loot-assets/').replace(/^\.\//, '');
  const traitsDir = (modelsManifest.traitsDirectory || './models/').replace(/^\.\//, '');
  const vrmPath = `/${assetsLocation}${traitsDir}${sample.directory}`.replace(/\/\.\//g, '/').replace(/\/+/g, '/');
  console.log('  sample VRM path:', vrmPath);

  const vrmOk = await headOk(vrmPath);
  if (!vrmOk) throw new Error(`VRM not reachable: ${vrmPath}`);

  const legacyPath = '/loot-assets/loot/models/Body/orion.vrm';
  const legacyOk = await headOk(legacyPath);
  console.log('  legacy path should 404/HTML:', legacyOk ? 'WARN still exists' : 'ok (gone)');

  console.log('PASS — loot appearance assets reachable');
}

main().catch((err) => {
  console.error('FAIL —', err.message || err);
  process.exit(1);
});
