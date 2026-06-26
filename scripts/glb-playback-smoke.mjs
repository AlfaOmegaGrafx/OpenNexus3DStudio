#!/usr/bin/env node
/**
 * Smoke test: SkinTokens / rigged GLB + canned Mixamo Walking.
 * Prereq: npm run dev on Surface + DGX proxy (Vite __dev_dgx_proxy).
 *
 * Usage:
 *   npm run test:glb-smoke
 *   RIG_JOB_ID=79a9f3d5-... ANIM_SMOKE_URL=https://10.0.0.32:3000 npm run test:glb-smoke
 */
import { chromium } from '@playwright/test';

const baseUrl =
  process.env.ANIM_SMOKE_URL ||
  process.env.VITE_DEV_HOST ||
  'https://10.0.0.32:3000';
const smokeUrl = `${baseUrl.replace(/\/$/, '')}/?animSmoke=1`;
const rigJobId =
  process.env.RIG_JOB_ID || '79a9f3d5-10e3-4ba0-9b7f-593aa6191455';

function layoutVolume(size) {
  if (!size?.length) return 0;
  return Math.abs(size[0] * size[1] * size[2]);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (
    await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } })
  ).newPage();

  const consoleLines = [];
  page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));

  console.log(`Opening ${smokeUrl}`);
  await page.goto(smokeUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__csAnimSmoke?.loadRigGlbFromJob, undefined, {
    timeout: 45000,
  });

  const loaded = await page.evaluate(async (jobId) => window.__csAnimSmoke.loadRigGlbFromJob(jobId), rigJobId);
  console.log('loadRigGlbFromJob:', JSON.stringify(loaded, null, 2));
  if (!loaded?.ok) {
    console.error('FAIL: could not load rig GLB from DGX job');
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(2500);
  const restLayout = await page.evaluate(async () => window.__csAnimSmoke.sampleMeshLayout());
  console.log('Rest layout:', restLayout);

  const walking = await page.evaluate(async () => window.__csAnimSmoke.loadWalking());
  console.log('loadWalking:', walking);
  await page.waitForTimeout(1500);

  const diag = await page.evaluate(() => window.__csAnimSmoke.getDiag());
  console.log('Diag:', JSON.stringify(diag, null, 2));

  const audit = await page.evaluate(async () => window.__csAnimSmoke.auditBones(0.5));
  const compare = await page.evaluate(async () => window.__csAnimSmoke.compareAtTime(0.5));
  const misbehaving = compare?.misbehaving ?? audit?.playback?.misbehaving ?? [];
  const warnings = compare?.warnings ?? audit?.playback?.warnings ?? [];
  console.log('Bone resolution:', audit?.resolution);
  console.log(
    'Misbehaving:',
    misbehaving.map((r) => `${r.humanoidBone}:${r.errorDeg}° scene=${r.sceneName}`),
  );
  if (warnings.length) {
    console.log('Warnings:', warnings.map((r) => `${r.humanoidBone}:${r.errorDeg}°`).join(', '));
  }

  await page.screenshot({ path: 'logs/glb-smoke-walking.png', fullPage: false });
  console.log('Screenshot: logs/glb-smoke-walking.png');

  const animLayout = await page.evaluate(async () => window.__csAnimSmoke.sampleMeshLayout());
  const hipsA = await page.evaluate(() => window.__csAnimSmoke.sampleRigHipsRotation());
  await page.waitForTimeout(800);
  const hipsB = await page.evaluate(() => window.__csAnimSmoke.sampleRigHipsRotation());
  console.log('Animated layout:', animLayout);
  console.log('Rig hips rotation A/B:', hipsA, hipsB);

  await browser.close();

  const rigControl = diag?.rigControls?.[0];
  const tracksOk = (rigControl?.trackCount ?? 0) > 10;
  const playing = !diag?.paused && (rigControl?.toWeight ?? 0) > 0;
  const resolved = (audit?.resolution?.resolved ?? 0) >= 18;
  const mis = misbehaving.length;
  const restVol = layoutVolume(restLayout?.size);
  const animVol = layoutVolume(animLayout?.size);
  const collapsed = restVol > 0 && animVol < restVol * 0.35;
  const hipsMoved =
    hipsA &&
    hipsB &&
    hipsA.some((v, i) => Math.abs(v - hipsB[i]) > 0.02);

  if (!tracksOk) {
    console.error('FAIL: rig animation has too few retarget tracks');
    process.exit(1);
  }
  if (!playing) {
    console.error('FAIL: rig animation not playing');
    process.exit(1);
  }
  if (!resolved) {
    console.error('FAIL: humanoid bones not resolved on rig');
    process.exit(1);
  }
  if (collapsed) {
    console.error(
      `FAIL: mesh layout collapsed (rest vol ${restVol.toFixed(4)} → anim vol ${animVol.toFixed(4)})`,
    );
    process.exit(1);
  }
  if (mis > 8) {
    console.error(`FAIL: ${mis} bones misbehaving (>8° error threshold)`);
    process.exit(1);
  }
  if (!hipsMoved) {
    console.error('FAIL: rig hips did not move during Walking');
    process.exit(1);
  }

  console.log('PASS: rigged GLB Walking playback looks healthy (no collapse, hips move, bones resolve).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
