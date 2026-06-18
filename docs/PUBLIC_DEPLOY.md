# Public deploy (Vercel / GitHub Pages)

OpenNexus3DStudio ships two deployment modes:

| Mode | Where | AI backend | Secrets |
|------|-------|------------|---------|
| **Local dev** | `npm run dev` on your PC / DGX | `VITE_API_ENDPOINT`, `DEV_API_PROXY_TARGET` | `.env` (gitignored) |
| **Public demo** | Vercel (`vercel.json`) | None — viewport, VRM upload, traits UI | No client secrets |

## Vercel (recommended public demo)

1. Import [AlfaOmegaGrafx/OpenNexus3DStudio](https://github.com/AlfaOmegaGrafx/OpenNexus3DStudio) in Vercel.
2. Framework preset: **Vite** (or use repo `vercel.json`).
3. Build command: `npm run build` (runs `verify-public-build-env` then `vite build`).
4. Output directory: `build`.

`vercel.json` sets safe build-time flags only:

- `VITE_PUBLIC_DEMO=1` — hides API status panel; shows user-friendly “no AI backend” copy.
- `VITE_ASSET_PATH=https://m3-org.github.io/loot-assets/` — CDN loot assets (no full clone in CI).

### Do **not** set on Vercel

These are inlined into the browser bundle (`import.meta.env.VITE_*`):

| Variable | Why |
|----------|-----|
| `VITE_3DAIGC_API_KEY` | API bearer token |
| `VITE_AVATARSDK_CLIENT_SECRET` | OAuth secret |
| `VITE_THIRDWEB_SECRET_KEY` | Wallet secret |
| `VITE_PINATA_*`, `VITE_ALCHEMY_*`, `VITE_BASE_X402_*`, `VITE_VANA_*` | Service secrets |
| `VITE_HELIUS_KEY`, `VITE_OPENSEA_KEY` | Paid API keys |
| `VITE_API_ENDPOINT` pointing at LAN/DGX/Tailscale | Private infra leak |
| `DEV_API_PROXY_TARGET` | Dev-only; not used in production build |

`npm run build` **fails on Vercel/CI** if any forbidden variable is present (`scripts/verify-public-build-env.mjs`).

### Optional on Vercel (public client IDs only)

| Variable | Purpose |
|----------|---------|
| `VITE_THIRDWEB_CLIENT_ID` | Public wallet client id |
| `VITE_AVATARSDK_CLIENT_ID` | Public AvatarSDK client id (no secret) |
| `VITE_JOB_STATUS_PATH` | Only if you expose a **public** API URL |

## Local development (unchanged)

Copy `.env.example` → `.env`:

```bash
DEV_API_PROXY_TARGET=http://10.0.0.158:7842
VITE_API_ENDPOINT=/__dev_dgx_proxy
VITE_JOB_STATUS_PATH=api/v1/system/jobs
```

- `DEV_API_PROXY_TARGET` is read only by Vite dev server (`vite.config.js`), never embedded in the client.
- DGX proxy, HTTPS certs, remote logging, and IWSDK plugins are **dev-only** (`command === 'serve'`).

## Verify before push

```bash
# Simulate Vercel (no local .env loaded)
VERCEL=1 CI=1 VITE_PUBLIC_DEMO=1 \
  VITE_ASSET_PATH=https://m3-org.github.io/loot-assets/ \
  npm run build
```

## Full-stack (private)

Run [3DAIGC-API](https://github.com/AlfaOmegaGrafx/3DAIGC-API) on your GPU machine and point local `.env` at it. Do not put DGX URLs on Vercel — use a public HTTPS API or keep AI generation local-only.
