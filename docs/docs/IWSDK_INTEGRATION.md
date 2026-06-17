# IWSDK Integration Reference

Reference for [Immersive Web SDK (IWSDK)](https://github.com/facebook/immersive-web-sdk) in Character Studio — what is installed, what is optional, and when to add more packages.

**Fork (Meta sync):** [AlfaOmegaGrafx/immersive-web-sdk](https://github.com/AlfaOmegaGrafx/immersive-web-sdk). We consume published npm packages (`@iwsdk/*`), not the monorepo source. When `main` is ahead of npm, watch for a new release or cherry-pick only what you need into this app.

**Official docs:** [iwsdk.dev](https://iwsdk.dev/) · [API](https://iwsdk.dev/api/) · [AI / MCP](https://iwsdk.dev/ai/)

### Development strategy (Galaxy XR first)

| Target | Command / URL | Role |
|--------|----------------|------|
| **Samsung Galaxy XR (truth)** | `npm run dev` → `https://<PC-LAN-IP>:3000/xr` | Real WebXR input, rendering, grab — validate here |
| **PC localhost emulator** | `npm run dev:iwsdk` or Vite `iwsdkDev` on localhost only | Optional Quest-like smoke tests; **not** a substitute for headset |
| **Automation** | `npm run iwsdk:xr-smoke`, Playwright | CI / agent checks on PC only |

Default **`npm run dev`** is **Vite on port 3000** so the headset always hits the same URL as the main app. Use a **full page reload** on `/xr` before Enter VR (HMR can kill the session). Headset logs forward to `logs/remote-log.txt` in dev.

Main VRM authoring stays on **`/`** (`SceneManager`). **`/xr`** is an IWSDK-only lab — see [Monetization roadmap](../MONETIZATION_ROADMAP.md) **v3.2.8** (May 27, 2026).

---

## Install location

Run all `npm install` commands from the **CharacterStudio** folder (the directory that contains `package.json`):

```text
c:\Users\alfao\Documents\GitHub\CharacterStudio\
├─ package.json
└─ node_modules\
   └─ @iwsdk\...
```

IWSDK is a normal npm dependency—not copied into `src/`. Code imports from `@iwsdk/core` when wired up.

---

## Currently installed (runtime)

| Package | Version (approx.) | Role |
|---------|-------------------|------|
| `@iwsdk/core` | 0.4.1 | Main WebXR ECS runtime (`World`, systems, session) |
| `@iwsdk/locomotor` | (dep of core) | Locomotion: teleport, slide, turn |
| `@iwsdk/xr-input` | (dep of core) | Controllers, hands, rays, pointers |
| `@iwsdk/glxf` | (dep of core) | GLXF scene loader |

Installed via:

```bash
npm install @iwsdk/core
```

`three` is already in this project; do not pin a second conflicting Three.js unless IWSDK docs require a specific range.

### npm / Thirdweb note

Legacy `@thirdweb-dev/react` and `@thirdweb-dev/sdk` (v4, `ethers@^5` only) were removed to fix `ERESOLVE` conflicts. Blockchain code uses the unified **`thirdweb`** v5 package (`ethers@^5 || ^6`).

`.npmrc` may still contain `legacy-peer-deps=true` as a safety net for other peer warnings.

---

## AI dev tooling (installed)

| Package | Role |
|---------|------|
| `@iwsdk/vite-plugin-dev` | Quest emulation + headless Playwright agent browser + MCP WebSocket |
| `@iwsdk/cli` | `iwsdk dev up`, `iwsdk xr …`, `iwsdk browser screenshot`, `iwsdk mcp stdio` |
| `@iwsdk/reference` | Semantic IWSDK API search MCP (`iwsdk-reference`) |

MCP config (Cursor): `.cursor/mcp.json` — servers `iwsdk-runtime` and `iwsdk-reference`. Regenerate with `npm run iwsdk:adapter-sync`.

### First-time setup

```bash
npm install
npm run playwright:install    # Chromium for the agent browser (once)
npm run iwsdk:adapter-sync    # refresh .cursor/mcp.json
npm run iwsdk:reference-warmup   # optional: local API corpus for iwsdk-reference
```

### Run dev with autonomous agent browser

```bash
npm run dev              # vite --host on port 3000 (headset + daily dev; use this)
npm run dev:iwsdk        # iwsdk dev up + agent browser (may fail on Windows if port 3010 is busy)
npm run dev:runtime      # same as npm run dev
```

If `npm run dev` fails with **port already in use**, stop the old server (`Ctrl+C` in the terminal that ran it) or run `npx iwsdk dev down`, then retry.

The Playwright tab sets `window.__IWER_MCP_MANAGED`; the app auto-redirects to `/xr` in dev.

### Autonomous XR tests (CLI, no headset)

With `npm run dev:runtime` running:

```bash
npm run iwsdk:xr-smoke          # quick: reload /xr, enter VR, screenshot
npm run iwsdk:xr-deep-test      # full: grab, hand-only, exit panel, scene inspect
```

Screenshots and `report.json` are written to `logs/iwsdk-deep-test/`.

**Headset note:** Remote log on `/xr` (dev auto-enables) shows crashes if visual adapters are hijacked — keep the pointer-only patch. **Distance grab** = ray + trigger; **proximity grab** = walk up + grip squeeze.

### Useful CLI commands

```bash
npx iwsdk dev status
npx iwsdk adapter status          # MCP adapter files (.cursor/mcp.json, etc.)
npx iwsdk reference status        # local API corpus cache
npx iwsdk browser screenshot
npx iwsdk xr enter
npx iwsdk xr set-transform --hand right --x 0.3 --y 1.2 --z -0.5
npx iwsdk scene hierarchy         # Three.js tree (needs dev server + /xr)
npx iwsdk ecs systems             # ECS debug: registered systems
npx iwsdk ecs find --name IwsdkDemoCube
npx iwsdk mcp inspect             # maps MCP tool names → CLI paths
```

npm shortcuts: `iwsdk:adapter-status`, `iwsdk:mcp-inspect`, `iwsdk:scene-hierarchy`, `iwsdk:ecs-systems`.

See [Getting Started (AI)](https://iwsdk.dev/ai/) and [MCP Tools](https://iwsdk.dev/ai/mcp-tools). Agent entry files on the fork: `llms.txt`, `go.md`, `skill.md` (published on [iwsdk.dev](https://iwsdk.dev/ai/)).

### Add later — product features

| Package | Purpose | Install when |
|---------|---------|--------------|
| `@iwsdk/vite-plugin-uikitml` | Compile UIKitML → JSON for spatial in-headset UI | Building XR-native panels (not flat React overlays) |
| `@iwsdk/vite-plugin-gltf-optimizer` | Optimize GLTF/GLB at build time | Large world/prop assets; slow loads on headset |
| `@iwsdk/vite-plugin-metaspatial` | Meta Spatial Editor → GLXF / component discovery | Using Meta Spatial Editor in the pipeline |

### Do not install for this repo

| Package | Purpose | Why skip |
|---------|---------|----------|
| `@iwsdk/create` | `npm create @iwsdk@latest` — scaffolds a **new** app | Character Studio already exists |

---

## Immersive route (wired)

| Path | Component | Notes |
|------|-----------|--------|
| `/xr` | `src/pages/IwsdkImmersive.jsx` | IWSDK `World` only — no SceneManager |
| `/` | `src/App.jsx` | Existing Character Studio |

Bootstrap: `src/library/iwsdkWorld.js` (`createIwsdkWorld`, `disposeIwsdkWorld`).

Open locally: `https://localhost:3000/xr` (HTTPS required for WebXR on device).

### Headset controls (Galaxy XR / Quest)

| Action | Control |
|--------|---------|
| Move | Left thumbstick |
| Turn | Right thumbstick (horizontal) |
| Teleport | Push right thumbstick forward (aim), release to land |
| Distance grab | Point at the demo cube (white **dot**), **trigger** or **pinch** — ray and dot turn **yellow** while pinching |
| Proximity grab | Walk within ~arm&apos;s reach; **grip squeeze** on the slightly larger hit volume |
| Hand-only (controllers down) | Hands take primary input; rays stay active; red Exit panel follows your head |
| Exit XR | Controller **Menu** or **B**; ray-select red **Exit** panel (head-locked); **Exit XR** button or **Escape** on phone/PC |

`src/library/iwsdkXrEnhancements.js` runs a headset input pipeline: controllers stay primary for locomotion, hands stay tracked when docked, ray + grab pointers, walkable floor, session `inputsourceschange` hooks. Pinch/select feedback uses a **yellow** ray and cursor (`0xffdd00`). Demo cube uses **both** `DistanceGrabbable` and a `OneHandGrabbable` proximity volume. `layers: false` avoids some Galaxy XR black-frame issues. `@iwsdk/core` 0.4.1+ restores the browser camera after XR exit (`xr.restoreCameraOnExit`, default `true`).

## Recommended order of work

1. ~~**Wire `@iwsdk/core` in code**~~ — done (`/xr` route + `iwsdkWorld.js`).
2. ~~**Add dev tooling**~~ — `vite-plugin-dev` + `cli` + `reference` + MCP sync (done).
3. **Galaxy XR / Chrome** — test WebXR on device (HTTPS required; see `docs/HTTPS_SETUP.md`).
4. **Later** — UIKitML, GLTF optimizer, Meta Spatial, optional Gaussian splat worlds (e.g. [sensai-webxr-worldmodels](https://github.com/V4C38/sensai-webxr-worldmodels)).

Face tracking in Chrome XR remains a separate concern (relay / future `expression-tracking`); **not wired on `/xr`**. For VRM + APK face relay, use the main app at `https://<PC-LAN-IP>:3000/?nativeFaceRelay=1` (see [WEBCAM_AVATAR_CONTROL.md](./WEBCAM_AVATAR_CONTROL.md)).

---

## Architecture intent (short)

```text
Character Studio (React + SceneManager)  →  authoring, tasks, VRM tools
IWSDK immersive mode                     →  presence: locomotion, grab, spatial UI, worlds
Galaxy XR Chrome WebXR                   →  target runtime for immersive mode
```

See also `.cursor/rules/xr-strategy.mdc` for Galaxy XR / face bridge context.

---

## Quick verification

```bash
npm ls @iwsdk/core @iwsdk/locomotor @iwsdk/xr-input @iwsdk/glxf --depth=1
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-27 | Initial doc: core installed; optional packages catalog; Thirdweb v4 removed |
| 2026-05-27 | Galaxy XR–first dev strategy; `npm run dev` vs `dev:iwsdk`; headset logging |
| 2026-05-28 | Yellow pinch ray/cursor; fork sync note; extra `iwsdk:*` npm scripts; CLI scene/ecs/adapter docs |
