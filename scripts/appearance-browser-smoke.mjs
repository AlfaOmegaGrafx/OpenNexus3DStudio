#!/usr/bin/env node
/**
 * Browser smoke test: loot appearance panel + trait load (Playwright).
 * Prereq: npm run dev (HTTPS on :3000)
 *
 * Usage: node scripts/appearance-browser-smoke.mjs [baseUrl]
 */
import { chromium } from '@playwright/test';

const baseUrl = (process.argv[2] || process.env.APPEARANCE_SMOKE_URL || 'https://localhost:3000').replace(
  /\/$/,
  '',
);
const smokeUrl = `${baseUrl}/?appearanceSmoke=1`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  const consoleLines = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    consoleLines.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err?.message || err));
  });

  console.log('Opening', smokeUrl);
  const resp = await page.goto(smokeUrl, { waitUntil: 'networkidle', timeout: 120000 });
  console.log('HTTP', resp?.status?.() ?? 'unknown');

  await page.waitForFunction(() => window.__csAppearanceSmoke?.getDiag, undefined, { timeout: 60000 });

  let diag = await page.evaluate(() => window.__csAppearanceSmoke.getDiag());
  console.log('On startup (traits may load, viewport hidden):', JSON.stringify(diag, null, 2));

  if (diag.characterVisible !== false && (diag.loadedTraitGroups?.length ?? 0) > 0) {
    throw new Error(
      `Expected hidden viewport on startup, got visible traits: ${diag.loadedTraitGroups?.join(', ')}`,
    );
  }

  const sidebarIcon = page.locator('button.character-studio-sidebar-icon[title="Character Appearance"]');
  if (await sidebarIcon.count()) {
    await sidebarIcon.click();
  } else {
    await page.locator('button.character-studio-sticky-hamburger').click();
  }

  await page.getByText('Choose Appearance').waitFor({ timeout: 15000 });

  diag = await page.evaluate(() => window.__csAppearanceSmoke.getDiag());
  if ((diag.traitGroupCount ?? 0) < 7 && (diag.loadedTraitGroups?.length ?? 0) < 3) {
    const packSelect = page.locator('#character-pack-select');
    const optionValues = await packSelect.locator('option').evaluateAll((opts) =>
      opts.map((o) => o.value).filter(Boolean),
    );
    if (optionValues.length > 1) {
      await packSelect.selectOption(optionValues[1]);
    }
    await packSelect.selectOption(optionValues[0]);
  }

  await page.waitForFunction(
    () => (window.__csAppearanceSmoke?.getDiag?.()?.loadedTraitGroups?.length ?? 0) >= 3,
    undefined,
    { timeout: 120000 },
  );

  await page.waitForFunction(
    () => document.querySelectorAll('[class*="editorText"]').length >= 7,
    undefined,
    { timeout: 30000 },
  );

  diag = await page.evaluate(() => window.__csAppearanceSmoke.getDiag());
  console.log('After pack load:', JSON.stringify(diag, null, 2));

  if ((diag.loadedTraitGroups?.length ?? 0) < 3) {
    throw new Error(`Expected loot traits after pack load, got: ${JSON.stringify(diag.loadedTraitGroups)}`);
  }

  const wireframeErrors = pageErrors.filter((e) => /_setupWireframeMaterial|setupWireframeMaterial/i.test(e));
  if (wireframeErrors.length) {
    throw new Error(`Wireframe errors: ${wireframeErrors.join('; ')}`);
  }

  const bodyBtn = page.locator('[class*="editorText"]', { hasText: /^Body$/i }).first();
  await bodyBtn.click();

  await page.waitForFunction(
    () => console.__appearanceBodyClicked || document.querySelectorAll('[class*="selectorButton"]').length > 2,
    undefined,
    { timeout: 15000 },
  ).catch(() => {});

  const traitButtons = page.locator('[class*="selectorButton"]');
  const traitCount = await traitButtons.count();
  console.log('Trait selector buttons:', traitCount);
  if (traitCount < 3) {
    throw new Error('Trait grid did not open after selecting Body group');
  }

  const beforeTraits = await page.evaluate(() => window.__csAppearanceSmoke.getDiag().loadedTraitGroups);
  await traitButtons.nth(2).click();
  await page.waitForTimeout(3000);

  diag = await page.evaluate(() => window.__csAppearanceSmoke.getDiag());
  console.log('After trait click:', JSON.stringify(diag, null, 2));

  const appearanceLogs = consoleLines.filter((l) => l.includes('[Appearance]'));
  console.log('Appearance console lines:', appearanceLogs.slice(-8).join('\n  ') || '(none)');

  const loadTraitLogs = appearanceLogs.filter((l) => l.includes('loadTrait'));
  if (!loadTraitLogs.length && beforeTraits.join() === diag.loadedTraitGroups?.join()) {
    console.warn('WARN: no loadTrait log and avatar unchanged (may have clicked already-active trait)');
  }

  if (pageErrors.length) {
    throw new Error(`Page errors: ${pageErrors.slice(0, 3).join('; ')}`);
  }

  console.log('PASS — appearance browser smoke');
  await browser.close();
}

main().catch(async (err) => {
  console.error('FAIL —', err.message || err);
  process.exit(1);
});
