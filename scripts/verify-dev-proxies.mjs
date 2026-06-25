#!/usr/bin/env node
/**
 * Verify Surface dev proxies for Scene Assembler (:8453) and XR Voice (:8443).
 * Run on Surface while `npm run dev:spark-proxies` is active.
 */
import https from 'node:https';

const MSF_URL = (process.env.VITE_MSF_PUBLIC_URL || 'https://10.0.0.32:8453').replace(/\/$/, '');
const XR_URL = (process.env.VITE_XR_HUB_URL || 'https://10.0.0.32:8443').replace(/\/$/, '');

function probe(label, url) {
  return new Promise((resolve) => {
    const req = https.get(url + '/', { rejectUnauthorized: false, timeout: 5000 }, (res) => {
      res.resume();
      resolve({ label, url, ok: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode });
    });
    req.on('error', (err) => resolve({ label, url, ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ label, url, ok: false, error: 'timeout' });
    });
  });
}

let fail = 0;

if (!MSF_URL.includes(':8453')) {
  console.error(`FAIL VITE_MSF_PUBLIC_URL must use :8453 (Scene Assembler), got ${MSF_URL}`);
  fail = 1;
}
if (!XR_URL.includes(':8443')) {
  console.error(`FAIL VITE_XR_HUB_URL must use :8443 (XR Voice), got ${XR_URL}`);
  fail = 1;
}
if (MSF_URL === XR_URL) {
  console.error('FAIL MSF and XR URLs must not be identical');
  fail = 1;
}

for (const r of await Promise.all([
  probe('MSF Scene Assembler proxy', MSF_URL),
  probe('XR Voice hub proxy', XR_URL),
])) {
  if (r.ok) console.log(`OK   ${r.label} — ${r.url} (${r.status})`);
  else {
    console.error(`FAIL ${r.label} — ${r.url}${r.error ? `: ${r.error}` : ''}`);
    fail = 1;
  }
}

if (fail) {
  console.error('\nStart both proxies: npm run dev:spark-proxies');
  console.error('Ensure DGX hub is up: bash /home/sifr/3DAIGC-API/scripts/ensure-spark-dev-services.sh');
  process.exit(1);
}

console.log('\nFabric URL for Scene Assembler login:', `${MSF_URL}/fabric/`);
