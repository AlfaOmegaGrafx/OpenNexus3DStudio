/**
 * Patches @iwsdk/vite-plugin-dev for OpenNexus3DStudio / Character Studio on Windows + Cursor:
 *
 * 1. Playwright browser URL — probe loopback, fall back to LAN when Cursor forwards :3000
 * 2. Injection bundle — activate IWER only in Playwright (__IWER_MCP_MANAGED), not on Galaxy XR LAN IP
 *
 * Idempotent — safe to run before every `npm run dev`.
 * Targets @iwsdk/vite-plugin-dev 0.5.x (browserUrl uses resolvedUrls.local).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pkgRoot = path.join(root, 'node_modules', '@iwsdk', 'vite-plugin-dev', 'dist');
const indexTarget = path.join(pkgRoot, 'index.js');
const injectionTarget = path.join(pkgRoot, 'injection-bundle.js');

const BROWSER_URL_MARKER = '[CharacterStudio] IWSDK browser URL';
const INJECTION_MARKER = '[CharacterStudio] IWER MCP managed activation';

const BROWSER_URL_ORIGINAL =
  "                browserUrl = new URL('/', server.resolvedUrls?.local?.[0] ?? fallbackLocalUrl).toString();";

const BROWSER_URL_PATCHED_BLOCK = `                // ${BROWSER_URL_MARKER}
                const envBrowser = process.env.IWSDK_BROWSER_HOST?.trim();
                if (envBrowser) {
                    browserUrl = envBrowser.includes('://')
                        ? envBrowser.replace(/\\/$/, '')
                        : \`\${protocol}://\${envBrowser.replace(/\\/$/, '')}:\${actualPort}\`;
                } else {
                    const loopbackUrl = \`\${protocol}://127.0.0.1:\${actualPort}\`;
                    const networkUrls = server.resolvedUrls?.network ?? [];
                    const lanUrl = networkUrls
                        .map((u) => u.replace(/\\/$/, ''))
                        .find((u) => /https?:\\/\\/(?:10\\.|192\\.168\\.|172\\.(?:1[6-9]|2\\d|3[01])\\.)/.test(u));
                    const httpMod = protocol === 'https'
                        ? await import('node:https')
                        : await import('node:http');
                    const loopbackOk = await new Promise((resolve) => {
                        const req = httpMod.get(\`\${loopbackUrl}/\`, { rejectUnauthorized: false, timeout: 800 }, (res) => {
                            res.resume();
                            resolve(res.statusCode >= 200 && res.statusCode < 500);
                        });
                        req.on('error', () => resolve(false));
                        req.on('timeout', () => {
                            req.destroy();
                            resolve(false);
                        });
                    });
                    if (loopbackOk) {
                        browserUrl = loopbackUrl;
                    } else {
                        browserUrl = lanUrl || new URL('/', server.resolvedUrls?.local?.[0] ?? fallbackLocalUrl).toString().replace(/\\/$/, '');
                        if (lanUrl) {
                            console.log(\`[vite] IWSDK Playwright → \${browserUrl} (loopback :\${actualPort} busy — e.g. Cursor port forward)\`);
                        }
                    }
                }`;

const INJECTION_ORIGINAL = '}(e.activation,e.userAgentException,e.iwer)){';
const INJECTION_PATCHED = `/*${INJECTION_MARKER}*/}(e.activation,e.userAgentException,e.iwer)||window.__IWER_MCP_MANAGED){`;

function patchBrowserUrl() {
  if (!fs.existsSync(indexTarget)) {
    console.warn('[patch-iwsdk-browser-host] index.js not found — skip browser URL patch');
    return;
  }
  let src = fs.readFileSync(indexTarget, 'utf8');
  if (src.includes(BROWSER_URL_MARKER)) {
    return;
  }
  if (!src.includes(BROWSER_URL_ORIGINAL)) {
    console.warn('[patch-iwsdk-browser-host] browser URL line missing — skip');
    return;
  }
  src = src.replace(BROWSER_URL_ORIGINAL, BROWSER_URL_PATCHED_BLOCK);
  fs.writeFileSync(indexTarget, src);
  console.log('[patch-iwsdk-browser-host] Playwright URL: loopback probe + LAN fallback');
}

function patchInjectionActivation() {
  if (!fs.existsSync(injectionTarget)) {
    console.warn('[patch-iwsdk-browser-host] injection-bundle.js not found — skip activation patch');
    return;
  }
  let src = fs.readFileSync(injectionTarget, 'utf8');
  if (src.includes(INJECTION_MARKER)) {
    return;
  }
  if (!src.includes(INJECTION_ORIGINAL)) {
    console.warn('[patch-iwsdk-browser-host] activation check missing — skip');
    return;
  }
  src = src.replace(INJECTION_ORIGINAL, INJECTION_PATCHED);
  fs.writeFileSync(injectionTarget, src);
  console.log('[patch-iwsdk-browser-host] IWER activates only on localhost or Playwright agent tab');
}

if (!fs.existsSync(pkgRoot)) {
  console.warn('[patch-iwsdk-browser-host] @iwsdk/vite-plugin-dev not installed — skip');
  process.exit(0);
}

patchBrowserUrl();
patchInjectionActivation();
