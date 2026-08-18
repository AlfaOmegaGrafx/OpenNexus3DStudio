/**
 * Fail when scrubbed identity placeholders appear as raw JSX tags.
 *
 * esbuild/JSX treats `<SURFACE_LAN_IP>` as an element. Use `&lt;…&gt;` or
 * `{'<SURFACE_LAN_IP>'}` in .jsx/.tsx markup instead.
 *
 * Strings and comments are ignored (placeholders there are fine).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(repoRoot, 'src');

/** Underscored or hyphenated ALL_CAPS scrub tokens, e.g. SURFACE_LAN_IP, PC-IP. */
const PLACEHOLDER_TAG =
  /<(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]+(?:-[A-Z0-9]+)+)>/g;

/**
 * Strip JS/TS strings and comments so placeholders inside them are ignored.
 * @param {string} source
 */
function stripStringsAndComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    // Line comment (not the `//` inside `https://…`)
    if (c === '/' && next === '/' && source[i - 1] !== ':') {
      out += ' ';
      i += 2;
      while (i < n && source[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }

    // Block comment
    if (c === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < n - 1 && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < n - 1) {
        out += '  ';
        i += 2;
      }
      continue;
    }

    // Single / double / template string
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += ' ';
      i += 1;
      while (i < n) {
        const ch = source[i];
        if (ch === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        if (ch === quote) {
          out += ' ';
          i += 1;
          break;
        }
        // Preserve newlines for line numbers
        out += ch === '\n' ? '\n' : ' ';
        i += 1;
      }
      continue;
    }

    out += c;
    i += 1;
  }

  return out;
}

/**
 * @param {string} dir
 * @param {(file: string) => void} visit
 */
function walkJsx(dir, visit) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
        continue;
      }
      walkJsx(full, visit);
      continue;
    }
    if (/\.(jsx|tsx)$/.test(entry.name)) visit(full);
  }
}

/**
 * @param {string} filePath
 * @param {string} source
 * @returns {{ line: number, col: number, match: string }[]}
 */
function findViolations(filePath, source) {
  const scanned = stripStringsAndComments(source);
  /** @type {{ line: number, col: number, match: string }[]} */
  const hits = [];
  let match;
  PLACEHOLDER_TAG.lastIndex = 0;
  while ((match = PLACEHOLDER_TAG.exec(scanned)) !== null) {
    const idx = match.index;
    const before = scanned.slice(0, idx);
    const line = before.split('\n').length;
    const col = idx - before.lastIndexOf('\n');
    hits.push({ line, col, match: match[0] });
  }
  return hits;
}

function main() {
  /** @type {string[]} */
  const errors = [];

  walkJsx(SRC_ROOT, (filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const hits = findViolations(filePath, source);
    const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    for (const hit of hits) {
      errors.push(
        `  • ${rel}:${hit.line}:${hit.col}  ${hit.match}  — use &lt;…&gt; or {'${hit.match}'} in JSX`,
      );
    }
  });

  if (errors.length) {
    console.error(
      '[verify-jsx-placeholders] Raw scrub placeholders in JSX (esbuild treats them as tags):',
    );
    for (const line of errors) console.error(line);
    process.exit(1);
  }

  console.log('[verify-jsx-placeholders] OK — no raw scrub placeholders in JSX markup.');
}

main();
