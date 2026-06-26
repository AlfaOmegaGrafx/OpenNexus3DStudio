#!/usr/bin/env node
/**
 * Floor audit: Eagle Knight / SkinTokens GLB feet must sit on y=0 after load.
 */
import { chromium } from '@playwright/test';

const baseUrl = process.env.ANIM_SMOKE_URL || 'https://10.0.0.32:3000';
const rigJobId = process.env.RIG_JOB_ID || '79a9f3d5-10e3-4ba0-9b7f-593aa6191455';

const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } })
).newPage();

const consoleLines = [];
page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));

await page.goto(`${baseUrl.replace(/\/$/, '')}/?animSmoke=1&remoteLog=1`, {
  waitUntil: 'domcontentloaded',
  timeout: 120000,
});
await page.waitForFunction(() => window.__csAnimSmoke?.loadRigGlbFromJob, undefined, { timeout: 45000 });
await page.evaluate((jobId) => window.__csAnimSmoke.loadRigGlbFromJob(jobId), rigJobId);
await page.waitForTimeout(3000);

const layout = await page.evaluate(() => window.__csAnimSmoke.sampleMeshLayout());
const modelY = await page.evaluate(() => {
  const sm = window.__ON3DS_SCENE_MANAGER__;
  return sm?.currentModel?.position?.y ?? null;
});

console.log('meshLayout:', JSON.stringify(layout, null, 2));
console.log('root.position.y:', modelY);

const rigLogs = consoleLines.filter((l) => /\[Rig\]|floor|anchor|Alignment|SkinTokens/i.test(l));
console.log('rigConsole:', rigLogs.slice(-15));

await page.screenshot({ path: 'logs/glb-floor-audit.png' });
await browser.close();

const minY = layout?.minY;
if (minY == null) {
  console.error('FAIL: no mesh layout');
  process.exit(1);
}
if (minY < -0.05) {
  console.error(`FAIL: feet below floor (minY=${minY}, expected >= -0.05)`);
  process.exit(1);
}
if (minY > 0.08) {
  console.error(`FAIL: feet floating (minY=${minY}, expected <= 0.08)`);
  process.exit(1);
}
console.log(`PASS: feet on floor (minY=${minY})`);
