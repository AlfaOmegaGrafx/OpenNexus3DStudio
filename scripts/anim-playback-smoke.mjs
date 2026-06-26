#!/usr/bin/env node
/**
 * Smoke test: VRM Mixamo animation advances hips rotation in the browser.
 * Prereq: npm run dev (HTTPS on :3000).
 *
 * Usage:
 *   npm run test:anim-smoke
 *   set ANIM_SMOKE_URL=https://10.0.0.32:3000 && npm run test:anim-smoke
 *
 * Manual browser QA: open the SAME origin as your working dev tab, append ?animSmoke=1
 * (e.g. https://10.0.0.32:3000/?animSmoke=1 — not http://localhost if Vite serves HTTPS on LAN).
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NORMALIZED_MIXAMO_TRACK_PREFIX = 'Normalized_mixamorig';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const baseUrl =
  process.env.ANIM_SMOKE_URL ||
  process.env.VITE_DEV_HOST ||
  'https://10.0.0.32:3000';
const smokeUrl = `${baseUrl.replace(/\/$/, '')}/?animSmoke=1`;

function rotationDelta(a, b) {
  if (!a || !b) return Infinity;
  return a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);
}

async function main() {
  const idleFbx = path.join(root, 'public', 'loot-assets', 'animations', '2_Idle.fbx');
  const hasLocalFbx = fs.existsSync(idleFbx);
  console.log(`Local Idle FBX: ${hasLocalFbx ? 'found' : 'MISSING (run npm run get-assets)'}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  const consoleLines = [];
  page.on('console', (msg) => {
    consoleLines.push(`[${msg.type()}] ${msg.text()}`);
  });

  console.log(`Opening ${smokeUrl}`);
  const resp = await page.goto(smokeUrl, { waitUntil: 'networkidle', timeout: 120000 });
  console.log(`HTTP ${resp?.status?.() ?? 'unknown'}`);

  await page.waitForFunction(() => window.__csAnimSmoke?.getDiag, undefined, { timeout: 30000 });

  let diag = await page.evaluate(() => window.__csAnimSmoke.getDiag());
  console.log('Early diag:', JSON.stringify(diag, null, 2));

  if ((diag?.vrmControlCount ?? 0) === 0) {
    const loadedSample = await page.evaluate(async () => window.__csAnimSmoke.loadSampleVrm());
    console.log('loadSampleVrm:', loadedSample);
    await page.waitForTimeout(2000);
  }

  await page.waitForFunction(
    () => (window.__csAnimSmoke?.getDiag?.()?.vrmControlCount ?? 0) > 0,
    undefined,
    { timeout: 120000 },
  );

  const fbxStatus = await page.evaluate(async () => {
    try {
      const r = await fetch('/loot-assets/animations/2_Idle.fbx', { method: 'HEAD' });
      return { ok: r.ok, status: r.status };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });
  console.log('Idle FBX via dev server:', fbxStatus);

  diag = await page.evaluate(() => window.__csAnimSmoke.getDiag());
  console.log('Initial diag:', JSON.stringify(diag, null, 2));

  const loaded = await page.evaluate(async () => window.__csAnimSmoke.loadWalking());
  console.log('loadWalking:', loaded);

  await page.waitForTimeout(500);
  diag = await page.evaluate(() => window.__csAnimSmoke.getDiag());
  console.log('After loadWalking diag:', JSON.stringify(diag, null, 2));

  const rotA = await page.evaluate(() => window.__csAnimSmoke.sampleHipsRotation());
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    /* animationManager ticks on setInterval(30fps) */
  });
  await page.waitForTimeout(800);
  const rotB = await page.evaluate(() => window.__csAnimSmoke.sampleHipsRotation());

  const delta = rotationDelta(rotA, rotB);
  console.log('Hips rotation sample A:', rotA);
  console.log('Hips rotation sample B:', rotB);
  console.log('Hips rotation delta:', delta);

  await browser.close();

  const vrmOk = (diag?.vrmControlCount ?? 0) > 0;
  const tracksOk = diag?.vrmControls?.some((c) => (c.trackCount ?? 0) > 0);
  const retargetOk = diag?.playbackHealth?.retargetTracksOk !== false;
  const normalizedTracks = diag?.vrmControls?.some((c) =>
    (c.sampleTracks ?? []).some((t) => t.startsWith(NORMALIZED_MIXAMO_TRACK_PREFIX)),
  );
  const playing = !diag?.paused && diag?.vrmControls?.some((c) => (c.toWeight ?? 0) > 0);
  const moved = Number.isFinite(delta) && delta > 0.001;

  const animErrors = consoleLines.filter(
    (t) => /Mixamo|AnimationManager|StudioAnimations|FBXLoader/i.test(t),
  );
  if (animErrors.length) {
    console.log('Animation-related console messages:', animErrors.slice(0, 20));
  }

  if (!vrmOk || !tracksOk || !playing || !moved || !retargetOk || !normalizedTracks) {
    console.log('Recent console (last 30 lines):', consoleLines.slice(-30));
  }

  if (!fbxStatus.ok) {
    console.error('FAIL: Idle FBX not reachable from dev server.');
    process.exit(1);
  }
  if (!vrmOk || !tracksOk) {
    console.error('FAIL: VRM animation controls or retargeted tracks missing.');
    process.exit(1);
  }
  if (!retargetOk || !normalizedTracks) {
    console.error('FAIL: Retarget tracks must use normalized VRM bones (Normalized_mixamorig*).');
    process.exit(1);
  }
  if (!playing) {
    console.error('FAIL: Animation action not playing (weight 0 or paused).');
    process.exit(1);
  }
  if (!moved) {
    console.error('FAIL: Hips bone did not move — humanoid pose may not be applied.');
    process.exit(1);
  }

  console.log('PASS: Mixamo walking animation is advancing VRM hips.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
