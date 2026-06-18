/**
 * Fetch https://github.com/m3-org/loot-assets and expose it at public/loot-assets (/loot-assets/…).
 *
 * - Local dev: clone to ../loot-assets, junction/symlink public/loot-assets → clone
 * - Vercel / CI (bundled): shallow clone into public/loot-assets
 * - Vercel / CI (CDN): VITE_ASSET_PATH=https://… → download UI icons only (no full clone)
 *
 * OpenNexus3DStudio git push does NOT include asset binaries.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  LOOT_ASSETS_DEFAULT_BRANCH,
  LOOT_ASSETS_GIT_CLONE_URL,
  LOOT_ASSETS_GITHUB_REPO,
  LOOT_BUILD_ICON_FILES,
  hasLootManifest,
  isDirectoryJunctionOrSymlink,
  isLootLinkReady,
  publicLootLink,
  resolveExternalLootDir,
  useExternalLootDir,
  usesRemoteLootManifest,
} from './loot-assets-paths.mjs';

const RAW_ICON_BASE = `https://raw.githubusercontent.com/m3-org/loot-assets/${LOOT_ASSETS_DEFAULT_BRANCH}/icons`;

/**
 * @param {string} targetDir
 */
function shallowCloneFromGithub(targetDir) {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  console.log(`[get-assets] cloning ${LOOT_ASSETS_GITHUB_REPO} (branch ${LOOT_ASSETS_DEFAULT_BRANCH})`);
  execSync(
    `git clone --depth 1 --branch ${LOOT_ASSETS_DEFAULT_BRANCH} ${LOOT_ASSETS_GIT_CLONE_URL} "${targetDir}"`,
    { cwd: path.dirname(targetDir), stdio: 'inherit' },
  );
}

/**
 * @param {string} linkPath
 * @param {string} externalDir
 */
function createPublicLink(linkPath, externalDir) {
  if (isLootLinkReady(linkPath)) {
    if (isDirectoryJunctionOrSymlink(linkPath)) return;
    console.log('[get-assets] public/loot-assets already serves loot-assets (directory or junction)');
    return;
  }
  if (fs.existsSync(linkPath)) {
    fs.rmSync(linkPath, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  const absExternal = path.resolve(externalDir);
  if (process.platform === 'win32') {
    execSync(`cmd /c mklink /J "${linkPath}" "${absExternal}"`, { stdio: 'inherit' });
  } else {
    fs.symlinkSync(absExternal, linkPath, 'dir');
  }
  console.log(`[get-assets] linked public/loot-assets -> ${absExternal}`);
}

async function downloadBuildIcons() {
  const iconsDir = path.join(publicLootLink, 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });

  for (const file of LOOT_BUILD_ICON_FILES) {
    const dest = path.join(iconsDir, file);
    if (fs.existsSync(dest)) continue;

    const url = `${RAW_ICON_BASE}/${file}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[get-assets] FAILED: could not download ${url} (${res.status})`);
      process.exit(1);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`[get-assets] icon ${file}`);
  }
}

async function ensureBuildIconsOnly() {
  console.log(
    `[get-assets] remote CDN mode (VITE_ASSET_PATH=${process.env.VITE_ASSET_PATH}) — icons only, no full clone`,
  );
  await downloadBuildIcons();
}

function ensureExternalLayout() {
  const externalDir = resolveExternalLootDir();

  if (!hasLootManifest(externalDir)) {
    shallowCloneFromGithub(externalDir);
  }

  if (!hasLootManifest(externalDir)) {
    console.error(`[get-assets] FAILED: ${externalDir} missing manifest.json after clone`);
    process.exit(1);
  }

  createPublicLink(publicLootLink, externalDir);
}

function ensureInlineLayout() {
  if (isLootLinkReady(publicLootLink)) {
    console.log('[get-assets] public/loot-assets already present — skipping');
    return;
  }

  console.log('[get-assets] Vercel/CI mode: cloning into public/loot-assets for build bundle…');
  shallowCloneFromGithub(publicLootLink);

  if (!hasLootManifest(publicLootLink)) {
    console.error('[get-assets] FAILED: public/loot-assets missing manifest.json after clone');
    process.exit(1);
  }
}

async function main() {
  if (usesRemoteLootManifest()) {
    await ensureBuildIconsOnly();
    console.log('[get-assets] loot-assets ready (remote manifest + local build icons)');
    return;
  }

  if (isLootLinkReady(publicLootLink) && !useExternalLootDir()) {
    console.log('[get-assets] loot-assets ready (public/)');
    return;
  }

  if (useExternalLootDir()) {
    ensureExternalLayout();
    if (!isLootLinkReady(publicLootLink)) {
      console.error('[get-assets] FAILED: public/loot-assets not reachable after link');
      process.exit(1);
    }
    console.log('[get-assets] loot-assets ready (linked from GitHub clone)');
    return;
  }

  ensureInlineLayout();
  console.log('[get-assets] loot-assets ready (cloned into public/ for deploy)');
}

main().catch((err) => {
  console.error('[get-assets] FAILED:', err);
  process.exit(1);
});
