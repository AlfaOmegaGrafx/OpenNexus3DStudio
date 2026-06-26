#!/usr/bin/env node
import { chromium } from '@playwright/test';

const baseUrl = process.env.ANIM_SMOKE_URL || 'https://10.0.0.32:3000';
const rigJobId = process.env.RIG_JOB_ID || '79a9f3d5-10e3-4ba0-9b7f-593aa6191455';
const motionJobId = process.env.MOTION_JOB_ID || '90cc20fe-da7d-4175-8601-f40e1819515e';

const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } })
).newPage();

await page.goto(`${baseUrl.replace(/\/$/, '')}/?animSmoke=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__csAnimSmoke?.loadKimodoMotion, undefined, { timeout: 45000 });
await page.evaluate((jobId) => window.__csAnimSmoke.loadRigGlbFromJob(jobId), rigJobId);
await page.waitForTimeout(2500);
const kimodo = await page.evaluate((jobId) => window.__csAnimSmoke.loadKimodoMotion(jobId), motionJobId);
console.log('kimodo:', JSON.stringify(kimodo));
await page.waitForTimeout(2500);
await page.screenshot({ path: 'logs/glb-kimodo.png' });
const layout = await page.evaluate(() => window.__csAnimSmoke.sampleMeshLayout());
console.log('layout:', layout);
await browser.close();
