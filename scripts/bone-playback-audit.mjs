#!/usr/bin/env node
/**
 * Automated bone playback diagnosis via ?animSmoke=1 hooks.
 */
import { chromium } from '@playwright/test';

const baseUrl =
  process.env.ANIM_SMOKE_URL ||
  process.env.VITE_DEV_HOST ||
  'https://10.0.0.32:3000';
const smokeUrl = `${baseUrl.replace(/\/$/, '')}/?animSmoke=1`;
const motionJobId = process.env.MOTION_JOB_ID || '90cc20fe-da7d-4175-8601-f40e1819515e';
const dgxApi = (process.env.DGX_API || 'http://10.0.0.158:7842').replace(/\/$/, '');

function summarizePlayback(label, block) {
  const mis = block?.playback?.misbehaving ?? block?.misbehaving ?? [];
  const warn = block?.playback?.warnings ?? block?.warnings ?? [];
  const unmapped = block?.playback?.unmapped ?? block?.unmapped ?? [];
  const resolution = block?.resolution ?? null;

  console.log(`\n=== ${label} ===`);
  if (resolution) {
    console.log(`Bone resolution: ${resolution.resolved}/${resolution.total}`);
    if (resolution.unresolved?.length) {
      console.log(
        'Unresolved:',
        resolution.unresolved.map((r) => r.humanoidBone || r.motionBone).join(', '),
      );
    }
  }
  if (mis.length) {
    console.log(`Misbehaving (${mis.length}):`);
    for (const row of mis.slice(0, 15)) {
      console.log(`  ${row.humanoidBone}: ${row.errorDeg}° scene=${row.sceneName} track=${row.trackName}`);
    }
  } else {
    console.log('Misbehaving: none');
  }
  if (warn.length) {
    console.log('Warnings:', warn.map((r) => `${r.humanoidBone}(${r.errorDeg}°)`).join(', '));
  }
  if (unmapped.length) {
    console.log('Unmapped/missing:', unmapped.map((r) => r.humanoidBone).join(', '));
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();

  console.log(`Opening ${smokeUrl}`);
  await page.goto(smokeUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__csAnimSmoke?.auditBones, undefined, { timeout: 45000 });

  await page.evaluate(async () => window.__csAnimSmoke.loadSampleVrm());
  await page.waitForTimeout(2500);

  // --- Walking (Mixamo canned) ---
  await page.evaluate(async () => {
    await window.__csAnimSmoke.loadWalking();
  });
  await page.waitForTimeout(1500);
  const walking = await page.evaluate(async () => ({
    audit: await window.__csAnimSmoke.auditBones(),
    at05: await window.__csAnimSmoke.compareAtTime(0.5),
  }));
  summarizePlayback('VRM + Walking (Mixamo)', {
    resolution: walking.audit?.resolution,
    ...walking.at05,
  });

  // --- Kimodo resolution (pre-playback) ---
  const kimodoResolve = await page.evaluate(async (jobId) => {
    const url = `/__dev_dgx_proxy/api/v1/system/jobs/${jobId}/download`;
    return window.__csAnimSmoke.auditStudioMotionFromUrl(url);
  }, motionJobId);
  console.log('\n=== Kimodo studio_motion → VRM resolution ===');
  console.log(
    `Resolved ${kimodoResolve?.resolvedCount ?? '?'}/${kimodoResolve?.trackBoneCount ?? '?'} motion bones`,
  );
  if (kimodoResolve?.unresolved?.length) {
    console.log('Unresolved motion bones:', kimodoResolve.unresolved.map((r) => r.motionBone).join(', '));
  }
  if (kimodoResolve?.error) {
    console.log('Kimodo fetch error:', kimodoResolve.error, kimodoResolve.preview || '');
  }

  // --- Kimodo playback + pose audit ---
  const kimodoPlay = await page.evaluate(async (jobId) => {
    const loaded = await window.__csAnimSmoke.loadKimodoMotion?.(jobId);
    if (!loaded?.ok) return { loaded, audit: null };
    await new Promise((r) => setTimeout(r, 1500));
    return {
      loaded,
      audit: await window.__csAnimSmoke.auditBones(),
      at05: await window.__csAnimSmoke.compareAtTime(0.5),
      at0: await window.__csAnimSmoke.compareAtTime(0),
    };
  }, motionJobId);

  console.log('\n=== Kimodo load ===', JSON.stringify(kimodoPlay?.loaded ?? null));
  if (kimodoPlay?.at05) {
    summarizePlayback('VRM + Kimodo @ t=0.5', kimodoPlay.at05);
  }
  if (kimodoPlay?.at0) {
    summarizePlayback('VRM + Kimodo @ t=0', kimodoPlay.at0);
  }

  const report = { walking, kimodoResolve, kimodoPlay, motionJobId, timestamp: new Date().toISOString() };
  console.log('\n=== FULL JSON ===');
  console.log(JSON.stringify(report, null, 2));

  await browser.close();

  const kimodoMis = kimodoPlay?.at05?.misbehaving?.length ?? 0;
  if (kimodoResolve?.error) process.exit(3);
  if (kimodoMis > 6) process.exit(2);
  console.log('\nDONE: bone diagnosis complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
