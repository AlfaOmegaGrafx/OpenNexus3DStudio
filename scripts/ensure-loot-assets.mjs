/**
 * Ensure public/loot-assets exists before production build (Vercel/CI).
 * Skips when manifest.json is already present (local dev or git submodule checkout).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const lootDir = path.join(repoRoot, 'public', 'loot-assets');
const manifestPath = path.join(lootDir, 'manifest.json');
const LOOT_ASSETS_REPO = 'https://github.com/m3-org/loot-assets.git';

function hasManifest() {
  try {
    return fs.existsSync(manifestPath) && fs.statSync(manifestPath).isFile();
  } catch {
    return false;
  }
}

function trySubmoduleInit() {
  try {
    execSync('git submodule update --init --depth 1 public/loot-assets', {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    return hasManifest();
  } catch {
    return false;
  }
}

function shallowClone() {
  if (fs.existsSync(lootDir)) {
    fs.rmSync(lootDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(lootDir), { recursive: true });
  execSync(`git clone --depth 1 ${LOOT_ASSETS_REPO} "${lootDir}"`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function main() {
  if (hasManifest()) {
    console.log('[get-assets] loot-assets already present — skipping');
    return;
  }

  console.log('[get-assets] loot-assets missing — fetching…');

  if (trySubmoduleInit()) {
    console.log('[get-assets] submodule init OK');
    return;
  }

  console.log('[get-assets] submodule unavailable — shallow cloning…');
  shallowClone();

  if (!hasManifest()) {
    console.error('[get-assets] FAILED: manifest.json still missing after clone');
    process.exit(1);
  }

  console.log('[get-assets] loot-assets ready');
}

main();
