/**
 * Fail when tracked public docs leak moat pricing / unreleased strategy names.
 * Exact SKU maps and vendor speech/motion tracks belong in gitignored
 * MONETIZATION_ROADMAP.md / FUTURE_RD.md / memory-bank only.
 *
 * Usage: node scripts/verify-moat-docs.mjs
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/** Patterns that must not appear in tracked markdown/rules (case-insensitive). */
const FORBIDDEN = [
  {
    id: 'vendor-speech-moat',
    re: /personaplex|nvidia\/personaplex/i,
    hint: 'Unreleased speech backend — name only in gitignored moat (roadmap / FUTURE_RD / memory-bank)',
  },
  {
    id: 'vendor-motion-moat',
    re: /\bardy\b|nv-tlabs\/ardy|labs\/sil\/projects\/ardy/i,
    hint: 'Unreleased interactive motion track — name only in gitignored moat (roadmap / memory-bank)',
  },
  {
    id: 'arr-targets',
    re: /\$\d+(?:\.\d+)?[Mm]\s*ARR|Target ARR\s*:/i,
    hint: 'ARR / revenue targets belong in local monetization roadmap',
  },
  {
    id: 'dollar-sku-prices',
    re: /\$\d+\.\d{2}\s*[–\-]\s*\$\d+|\$0\.\d{2,3}\s*[–\-]\s*\$|pricing\s*\(\$\d/i,
    hint: 'Numeric SKU / micropayment prices belong in local roadmap',
  },
  {
    id: 'timed-wave-vendor',
    re: /Wave\s+[A-D].{0,40}(PersonaPlex|ARDY)|Timed tracker:.{0,60}PersonaPlex/i,
    hint: 'Timed-wave strategy belongs in gitignored roadmap',
  },
];

const EXT_OK = new Set(['.md', '.mdc']);

function listedFiles() {
  const out = execSync('git ls-files -z', { cwd: repoRoot, encoding: 'buffer' });
  return out
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((rel) => EXT_OK.has(path.extname(rel).toLowerCase()));
}

function main() {
  /** @type {string[]} */
  const errors = [];

  for (const rel of listedFiles()) {
    // Public overview / moat *policy* rule may mention ARR when saying it is NOT in git;
    // vendor speech/motion *names* must still not appear even in that rule (use generic wording).
    const allowArrMention =
      rel.replace(/\\/g, '/') === 'docs/SPACETIME_MOAT_OVERVIEW.md' ||
      rel.replace(/\\/g, '/').endsWith('spacetime-moat-protected.mdc');

    const abs = path.join(repoRoot, rel);
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    for (const rule of FORBIDDEN) {
      if (allowArrMention && (rule.id === 'arr-targets' || rule.id === 'dollar-sku-prices')) {
        // Still forbid dollar SKU ranges; allow "ARR" word in overview
        if (rule.id === 'arr-targets' && !/\$\d/.test(text)) continue;
      }
      if (allowArrMention && rule.id === 'arr-targets') continue;

      const lines = text.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (rule.re.test(line)) {
          errors.push(`  • ${rel}:${idx + 1}  [${rule.id}] ${rule.hint}\n      ${line.trim().slice(0, 120)}`);
        }
      });
    }
  }

  const forbiddenTracked = execSync('git ls-files -z', { cwd: repoRoot, encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((rel) =>
      /^(src\/moat\/|scripts\/companion-chat-proxy|scripts\/companion-surface-proxy|scripts\/start-companion)/.test(
        rel.replace(/\\/g, '/'),
      ),
    );
  for (const rel of forbiddenTracked) {
    errors.push(`  • ${rel}  [tracked-overlay] Live companion overlay must stay gitignored`);
  }

  if (errors.length) {
    console.error('[verify-moat-docs] Forbidden moat detail in tracked docs:');
    for (const e of errors) console.error(e);
    process.exit(1);
  }

  console.log('[verify-moat-docs] OK — no forbidden pricing/vendor strategy leaks in tracked docs.');
}

main();
