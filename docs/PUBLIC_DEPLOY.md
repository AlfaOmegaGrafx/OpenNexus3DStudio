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
- `VITE_XR_HUB_URL=https://dgx-spark.tail6121eb.ts.net:8088` — **XR Voice sidebar** (Tailscale Funnel to DGX Spark hub). Public HTTPS URL only — **not** a secret. Do **not** put `MSF_EDIT_KEY`, API keys, or LAN IPs here.

The XR Voice panel appears in the left sidebar when `VITE_XR_HUB_URL` is set (`XrAiPanel.jsx`). Mic/camera run inside the iframe against the Spark hub; full AI task adoption still needs a connected 3DAIGC API (local dev only — do not expose `VITE_3DAIGC_API_KEY` on Vercel).

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
| `VITE_XR_HUB_URL` / `VITE_MSF_PUBLIC_URL` with `10.0.0.*` or LAN IPs | Private infra leak — use Tailscale Funnel HTTPS on Vercel |
| `MSF_EDIT_KEY`, `MSF_DB_PASSWORD`, `VITE_3DAIGC_API_KEY` | Server/edit secrets — never `VITE_*` |
| `DEV_API_PROXY_TARGET` | Dev-only; not used in production build |

`npm run build` **fails on Vercel/CI** if any forbidden variable is present (`scripts/verify-public-build-env.mjs`).

### Optional on Vercel (public client IDs only)

| Variable | Purpose |
|----------|---------|
| `VITE_THIRDWEB_CLIENT_ID` | Public wallet client id |
| `VITE_AVATARSDK_CLIENT_ID` | Public AvatarSDK client id (no secret) |
| `VITE_JOB_STATUS_PATH` | Only if you expose a **public** API URL |
| `VITE_XR_HUB_URL` | Public Tailscale Funnel URL to XR Spark hub (`:8088` on DGX funnel host) — enables sidebar panel |
| `VITE_MSF_PUBLIC_URL` | Public Tailscale Funnel URL for Scene Assembler (`:443` root on funnel host) |
| `VITE_RP1_COMPANY_ID` | Public RP1 company slug (e.g. `spacetimefabric`) — not a secret |

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
  VITE_XR_HUB_URL=https://dgx-spark.tail6121eb.ts.net:8088 \
  npm run build
```

## Full-stack (private)

Run [3DAIGC-API](https://github.com/AlfaOmegaGrafx/3DAIGC-API) on your GPU machine and point local `.env` at it. Do not put DGX URLs on Vercel — use a public HTTPS API or keep AI generation local-only.
