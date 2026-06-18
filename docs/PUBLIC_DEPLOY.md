# Public deploy (Vercel / GitHub Pages)

This app is **public-demo ready** when built with `npm run build`: character studio, loot assets (CDN), VRM load/export, and 3D viewport work **without** a private AI backend.

AI generation requires your own [3DAIGC-API](https://github.com/AlfaOmegaGrafx/3DAIGC-API) — configure that **locally** or on a **private** deployment, not on the public Vercel demo.

## Quick: Vercel

1. Connect the GitHub repo on [vercel.com](https://vercel.com).
2. Framework preset: **Vite** (or use repo `vercel.json`).
3. **Environment variables** (Production + Preview):

   | Variable | Value | Required |
   |----------|--------|----------|
   | `VITE_ASSET_PATH` | `https://m3-org.github.io/loot-assets/` | Yes (also in `vercel.json`) |
   | `VITE_PUBLIC_DEMO` | `1` | Yes — hides API Status panel on public demo |

4. **Do not set** on Vercel (embedded in client JS if you do):

   - `VITE_3DAIGC_API_KEY`
   - `VITE_AVATARSDK_CLIENT_SECRET`
   - `VITE_THIRDWEB_SECRET_KEY`
   - `VITE_PINATA_API_*`, `VITE_ALCHEMY_API_KEY`, `VITE_BASE_X402_API_KEY`, `VITE_VANA_API_KEY`
   - `VITE_API_ENDPOINT` pointing at `10.x`, `192.168.x`, `dgx-spark.local`, Tailscale, etc.

5. Deploy. Build runs:

   ```text
   verify-public-build-env → get-assets (icons only when CDN set) → vite build
   ```

Loot assets detail: [VERCEL_LOOT_ASSETS.md](./VERCEL_LOOT_ASSETS.md)

## Quick: GitHub Pages

Workflow: `.github/workflows/main.yml` (branch `main`).

Set repository **Actions** secret only if using deploy key. For assets CDN, add repo variable or workflow env:

```yaml
env:
  VITE_ASSET_PATH: https://m3-org.github.io/loot-assets/
  VITE_PUBLIC_DEMO: '1'
```

Same **forbidden** `VITE_*` rules as Vercel.

## Local development (unchanged)

```powershell
copy .env.example .env
npm run get-assets
npm run dev
```

Use `.env` for DGX proxy, API keys, and AvatarSDK — **never commit `.env`**.

| Local-only | Purpose |
|------------|---------|
| `VITE_API_ENDPOINT` / `DEV_API_PROXY_TARGET` | 3DAIGC-API (incl. `/__dev_dgx_proxy`) |
| `VITE_3DAIGC_API_KEY` | Bearer token when API requires key |
| `VITE_AVATARSDK_*` | AvatarSDK (dev only; secret must not ship) |
| `LOOT_ASSETS_EXTERNAL_DIR` | Custom loot-assets clone path |

Dev-only UI (troubleshooting, endpoint editor, debug panel) is gated with `import.meta.env.DEV` — stripped from production bundles.

## Production UI behavior

| Feature | Local `npm run dev` | `npm run build` / Vercel |
|---------|-------------------|---------------------------|
| API troubleshooting (`.env`, DGX hostnames) | Shown | Hidden |
| Change API endpoint | Shown | Hidden |
| Sidebar debug (endpoint, task JSON) | Shown | Hidden |
| API Status panel | Shown | Hidden when `VITE_PUBLIC_DEMO=1` (Vercel / GitHub Pages) |
| API endpoint display | Full URL | Masked or panel hidden on public demo |
| Tasks “No AI provider” | Env var names | User-friendly message |
| Remote log (`?remoteLog=1`) | Allowed | Disabled (no accidental log exfil) |

## Build guard

`scripts/verify-public-build-env.mjs` runs before every `npm run build`:

- **Vercel / GitHub Actions** (`VERCEL` or `CI` set): **fails** the build if forbidden secrets or private `VITE_API_ENDPOINT` are present.
- **Local** `npm run build`: **warns** but continues (so desktop builds with `.env` still work); fix before pushing to GitHub.

Test locally:

```powershell
npm run build
```

## Pre-push checklist

1. `git status` — no `.env`, `*.pem`, `certs/`, `MONETIZATION_ROADMAP.md`, `Pitch Deck/`
2. `bash scripts/scan-repo-secrets.sh .` (optional)
3. Vercel dashboard — no secret `VITE_*` keys
4. Redeploy after env changes

## If secrets were ever set on Vercel

1. Remove the env var in Vercel.
2. **Rotate** the key on the provider (3DAIGC, AvatarSDK, Thirdweb, etc.).
3. Redeploy — old bundles may still contain inlined values until replaced.

## Related

- [LOOT_ASSETS_SETUP.md](./LOOT_ASSETS_SETUP.md)
- [VERCEL_LOOT_ASSETS.md](./VERCEL_LOOT_ASSETS.md)
- `.env.example` — local template with deploy notes
