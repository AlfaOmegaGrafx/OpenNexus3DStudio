/**
 * Ensure production imports are declared in package.json dependencies (not lock-only).
 * Prevents Vercel clean-install Rollup "failed to resolve import" failures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/** Packages imported from src/ that must be in dependencies. */
const REQUIRED_DEPENDENCIES = [
  '@sparkjsdev/spark',
  '@gltf-transform/core',
  '@gltf-transform/extensions',
  '@gltf-transform/functions',
  'meshoptimizer',
  'draco3dgltf',
  '@pixiv/three-vrm',
  '@iwsdk/core',
];

function main() {
  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };

  const missing = REQUIRED_DEPENDENCIES.filter((name) => !deps[name]);
  if (missing.length) {
    console.error('[verify-build-deps] Missing from package.json dependencies:');
    for (const name of missing) {
      console.error(`  • ${name}`);
    }
    process.exit(1);
  }

  console.log('[verify-build-deps] OK — required build dependencies declared.');
}

main();
