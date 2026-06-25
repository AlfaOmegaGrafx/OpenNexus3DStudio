# Loot assets (GitHub source + app link)

**Source of truth:** [github.com/m3-org/loot-assets](https://github.com/m3-org/loot-assets)

OpenNexus3DStudio does **not** commit asset binaries. They are fetched from that repo and served at `/loot-assets/…`.

| Environment | What happens |
|-------------|----------------|
| **Local dev (Surface/DGX)** | `npm run get-assets` clones to `../loot-assets`, links `public/loot-assets` → clone |
| **Vercel / CI** | `npm run build` runs `get-assets` first → shallow clone into `public/loot-assets` → Vite bundles into `build/` |
| **git push** | Only app code; `public/loot-assets/` is gitignored (junction or build-time clone) |

Pointer file in repo root: `loot-assets.source`

## Quick start

```powershell
cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio
npm run get-assets
npm run dev
```

```bash
# DGX
cd /home/sifr/OpenNexus3DStudio
npm run get-assets
```

## Layout (local)

| Path | Role |
|------|------|
| `C:\Users\alfao\Documents\GitHub\loot-assets` | Git clone of m3-org/loot-assets |
| `OpenNexus3DStudio\public\loot-assets` | Junction/symlink → external clone |
| App URLs | `/loot-assets/manifest.json`, `/loot-assets/models/…`, etc. |

Override clone location: `LOOT_ASSETS_EXTERNAL_DIR` in `.env`

Windows re-link only:

```powershell
.\scripts\link-loot-assets.ps1
# or: npm run link-assets
```

## Vercel deploy

`vercel.json` uses `npm run build`, which runs:

```text
npm run get-assets && vite build
```

On Vercel, `VERCEL=1` → clone **into** `public/loot-assets` (no sibling folder). No submodule or manual asset upload required.

Optional: point manifests at GitHub Pages CDN instead of bundling — see [VERCEL_LOOT_ASSETS.md](./VERCEL_LOOT_ASSETS.md):

```env
VITE_ASSET_PATH=https://m3-org.github.io/loot-assets/
```

`vercel.json` sets this by default for Vercel deploys (icons-only build + CDN at runtime).

## App code

No import path changes — `src/library/lootAssetsConfig.js` uses `/loot-assets/…`.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run get-assets` | Clone m3-org/loot-assets if missing; link or inline per environment |
| `npm run link-assets` | Windows junction `public/loot-assets` → `../loot-assets` |

Implementation: `scripts/loot-assets-paths.mjs`, `scripts/ensure-loot-assets.mjs`
