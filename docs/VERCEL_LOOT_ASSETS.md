# Vercel deploy with loot-assets CDN

Use [m3-org/loot-assets](https://github.com/m3-org/loot-assets) on **GitHub Pages** instead of bundling the full asset tree in your Vercel build.

## One-line setup (recommended)

This repo’s `vercel.json` already sets:

```env
VITE_ASSET_PATH=https://m3-org.github.io/loot-assets/
VITE_PUBLIC_DEMO=1
```

Full security checklist: [PUBLIC_DEPLOY.md](./PUBLIC_DEPLOY.md)

Deploy from the Vercel dashboard or CLI — no extra env vars required unless you override them.

## Dashboard (manual)

1. Open your project on [vercel.com](https://vercel.com) → **Settings** → **Environment Variables**.
2. Add:

   | Name | Value | Environments |
   |------|--------|--------------|
   | `VITE_ASSET_PATH` | `https://m3-org.github.io/loot-assets/` | Production, Preview, Development |
   | `VITE_PUBLIC_DEMO` | `1` | Production, Preview — hides API Status panel |

Do **not** set `VITE_API_ENDPOINT` on the public Vercel demo (users configure API in self-hosted builds).

3. **Redeploy** (env changes only apply to new builds).

## What happens at build time

```text
npm run build
  → verify-public-build-env
  → npm run get-assets   (sees VITE_ASSET_PATH=https://… → icons only, no full clone)
  → vite build
```

- **Runtime:** manifests, models, animations load from `https://m3-org.github.io/loot-assets/…`
- **Build:** only trait UI SVGs are downloaded into `public/loot-assets/icons/` (Vite imports them from `Load.jsx`, etc.)

## URL layout (GitHub Pages)

GitHub Pages serves the **legacy** tree under `/loot/`:

| App path | CDN URL |
|----------|---------|
| Main manifest | `…/manifest.json` |
| Models manifest | `…/loot/models/manifest.json` |
| Model GLB | `…/loot/models/…` |
| Animations | `…/loot/animations/…` |

`src/library/lootAssetsConfig.js` rewrites paths automatically when `VITE_ASSET_PATH` is set.

## Verify after deploy

1. Open the deployed site → DevTools → **Network**.
2. Confirm `manifest.json` loads from `m3-org.github.io` (not your Vercel origin).
3. Open **Appearance** → Loot pack loads trait groups.
4. Bottom animation bar loads FBX from the CDN.

## Local dev with the same CDN

In `.env`:

```env
VITE_ASSET_PATH=https://m3-org.github.io/loot-assets/
```

Then:

```powershell
npm run get-assets
npm run dev
```

You do **not** need a full `../loot-assets` clone for CDN mode — only the small icon set for the build.

## Bundled mode (alternative)

Remove `VITE_ASSET_PATH` from Vercel env and `vercel.json`. Build will shallow-clone the full repo into `public/loot-assets` (~large deploy, no external CDN dependency).

## Security (public Vercel)

- **Not a breach by itself:** disconnected-state UI only names env vars (`VITE_API_ENDPOINT`, etc.) — not their values.
- **Never set on Vercel:** `VITE_3DAIGC_API_KEY`, `VITE_AVATARSDK_CLIENT_SECRET`, `VITE_THIRDWEB_SECRET_KEY`, Pinata/Alchemy secrets — Vite embeds `VITE_*` in the client bundle.
- **Production build** hides the API Status panel when `VITE_PUBLIC_DEMO=1`, dev troubleshooting, endpoint editor, and sidebar debug panel.
- **Audit:** Vercel → Settings → Environment Variables → remove any secret `VITE_*` keys; redeploy.
