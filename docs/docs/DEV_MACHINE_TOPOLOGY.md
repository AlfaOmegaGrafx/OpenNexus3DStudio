# Dev machine topology (OpenNexus3DStudio)

Use this when reading **`logs/remote-log.txt`**, planning Galaxy XR tests, or writing docs that mention “the PC.” IPs change on your LAN; roles do not.

## Machines and roles

| Role | Hardware | Typical access | In `remote-log` client IP |
|------|----------|----------------|---------------------------|
| **Dev workstation** | Windows **Surface Laptop Studio 2** | Local Cursor, Chrome/Edge, `npm run dev`, webcam tests | **`10.0.0.32`** (example LAN IP when Vite binds on the Surface) |
| **Remote Linux** | **NVIDIA DGX Spark** | Mostly **headless**; **NVIDIA Sync** (Tailscale) for SSH/Cursor Remote as user **`sifr`**; occasional **HDMI** monitor | **Not** the browser that posts most `webcamDebug` / desktop `remote-log` lines |
| **XR headset** | **Galaxy XR** (Chrome WebXR) | Opens `https://<dev-workstation-LAN-IP>:3000/...` on the LAN | **`10.0.0.224`** (example) |

**Do not conflate** the DGX Spark with “the PC” in log analysis. The Surface runs the Vite dev server and most desktop browser sessions; the DGX is for remote compute/SSH unless you explicitly open a browser on it.

## Network flow (dev)

```
[Surface]  npm run dev  →  https://<Surface-LAN-IP>:3000/
    ↑ POST /__remote_log, /__native_face_ingest
    │
[Galaxy XR Chrome]  ?nativeFaceRelay=1&remoteLog=1  (AR/VR, relay, playback)
    ↑ POST face JSON from CS XR Face APK (same origin ingest on Surface)

[DGX Spark]  SSH / API / builds via NVIDIA Sync  —  not required for headset → Surface LAN URL
```

- **Headset `localhost`:** `https://localhost:3000` on the headset targets the **headset**, not the Surface. Always use the **Surface LAN IP** in headset URLs.
- **3DAIGC API:** May run on the DGX or another host (`VITE_API_ENDPOINT`); that is separate from where Vite serves the web app.

## Reading `logs/remote-log.txt`

Each line includes the **HTTP client** that forwarded the log:

```text
[REMOTE_LOG][::ffff:10.0.0.224][session=…][info] … (https://10.0.0.32:3000/?…)
```

| Field | Meaning |
|-------|---------|
| `[::ffff:10.0.0.224]` | **Who sent** the log (e.g. Galaxy XR Chrome) |
| `(https://10.0.0.32:3000/…)` | **Dev server origin** the tab was loaded from (Surface Vite) |
| Query string on that URL | Which test mode (`nativeFaceRelay`, `nativeFacePlayback`, `webcamDebug`, `xrDebugInputs`, …) |

**Archived logs:** Vite rotates at ~5 MB to `logs/remote-log.<timestamp>.txt`. May/June XR and relay history often live in archives, not only the current `remote-log.txt`.

### Query flags vs device (typical for this project)

| Flag | Usually exercised on |
|------|----------------------|
| `webcamDebug=1` | **Surface** browser (`10.0.0.32`) |
| `nativeFaceRelay=1` | **Headset** Chrome (`10.0.0.224`); ingest handled by Surface Vite |
| `nativeFacePlayback=…` | **Headset** (and sometimes Surface) for replay in AR |
| `xrDebugInputs=1` | **Headset** during WebXR sessions |

## DGX Spark access (SSH / Cursor)

- **NVIDIA Sync** — primary way to reach the headless Spark.
- **HDMI** — optional local console; does not change the log roles above unless you run Chrome there for OpenNexus3DStudio.
- **SSH (two hosts only):** **`DGX-Local`** = LAN `10.0.0.158`; **`DGX-Remote`** = Tailscale via NVIDIA Sync. User `sifr`. See [`SSH_HOST_NAMES.md`](./SSH_HOST_NAMES.md).

## Character Studio — Local Cursor + DGX Remote SSH

Same git repo, two Cursor entry points. Keep them in sync with **commit / push / pull** (or copy changed files when offline).

| Workspace | Typical path | Cursor connection |
|-----------|--------------|-------------------|
| **Surface (local dev + Galaxy XR)** | `C:\Users\alfao\Documents\GitHub\CharacterStudio` | Local folder |
| **DGX Spark (SSH agent)** | `/home/sifr/OpenNexus3DStudio/CharacterStudio` | **`DGX-Local`** or **`DGX-Remote`** |

**Who runs what**

| Role | Machine | Typical commands |
|------|---------|------------------|
| Web UI + WebXR + headset tests | **Surface** | `npm run dev` → `https://<Surface-LAN-IP>:3000/` |
| 3DAIGC-API inference | **DGX Spark** (`:7842`) | API via `VITE_API_ENDPOINT` or dev proxy |
| Code edits | **Surface (PC)** | PC → DGX via `sync-to-dgx.ps1` |

**API from HTTPS dev (Surface + Galaxy XR)** — avoid mixed-content blocks:

```env
DEV_API_PROXY_TARGET=http://10.0.0.158:7842
VITE_API_ENDPOINT=/__dev_dgx_proxy
```

Vite forwards `https://<Surface>:3000/__dev_dgx_proxy/...` → DGX API. On DGX SSH sessions, you can point `VITE_API_ENDPOINT` at `http://127.0.0.1:7842` when the API runs locally there.

**Auto-rigging (Open3DStudio-aligned)** — viewport mesh upload + JSON `generate-rig`:

- `src/library/taskManager.js` — `executeAutoRigging` → `POST /api/v1/file-upload/mesh` then `POST /api/v1/auto-rigging/generate-rig`
- `src/components/TaskAdvancedOptions.jsx` — rig mode, skin weights, output format (FBX / GLB)
- `src/library/aiModelsCatalog.js` — `unirig_auto_rig`, `skintokens_auto_rig` (when enabled on API)

Only **`unirig_auto_rig`** is enabled on the API today unless you add **`skintokens_auto_rig`** in `config/models.yaml` on the DGX backend.

### Sync without GitHub (direct SSH / SCP)

No cloud repo required. Copy changed files over **LAN** or **Tailscale** only:

| Route | SSH host | When |
|-------|----------|------|
| Same Wi‑Fi | **`DGX-Local`** | Spark at `10.0.0.158` |
| Away from LAN | **`DGX-Remote`** | NVIDIA Sync + Tailscale |

---

## Surface ↔ DGX sync cheat sheet

**Problem:** Surface and DGX each hold a copy of this repo. Sync uses `scp` (last write wins). If both machines edit **`src/`** at the same time, one side’s work can be **silently overwritten**.

**Golden rule:** **One machine owns `src/` at a time.**

| You are… | `src/` owner | What to run |
|----------|--------------|-------------|
| Normal dev + Galaxy XR on Surface | **Surface** | Push after edits (see below). DGX does **not** use `--include-src`. |
| Explicitly coding on DGX Remote | **DGX** | Lock → edit → `sync-to-pc.sh --include-src` → unlock. Surface does **not** push until done. |

### Quick commands (Surface, PowerShell, repo root)

```powershell
# After a small code edit (preferred — seconds)
.\scripts\sync-to-dgx.ps1 -Paths src/library

# If DGX may have updated docs/branding this session
.\scripts\sync-to-dgx.ps1 -PullFirst -Paths src/library

# Pull DGX-owned files only (README, Pitch Deck, package.json, branding docs)
.\scripts\sync-from-dgx.ps1

# Many folders changed (routine — skips 32 MB src/sound)
.\scripts\sync-to-dgx.ps1

# Everything including src/sound (rare)
.\scripts\sync-to-dgx.ps1 -Full

# Away from home LAN
.\scripts\sync-to-dgx.ps1 -Remote -Paths src/library
```

### Quick commands (DGX, bash, repo root)

```bash
# Before editing src/ on DGX
bash scripts/sync-lock-utils.sh lock "reason"

# After editing src/ on DGX — push to Surface
bash scripts/sync-to-pc.sh --include-src
bash scripts/sync-lock-utils.sh unlock

# DGX-owned docs/branding only (no src/)
bash scripts/sync-to-pc.sh
```

### If sync aborts with `.sync-lock-dgx`

DGX is mid-edit on `src/`. **Stop.** Wait for DGX to finish and unlock, or confirm with the team which machine is canonical before using `-Force`.

### When both sides changed something

```powershell
.\scripts\sync-from-dgx.ps1          # 1) DGX docs/branding → Surface (never src/)
# 2) Resolve any src/ conflict manually — do not blind-push
.\scripts\sync-to-dgx.ps1 -Paths src/library   # 3) only if Surface src/ is truth
```

### Backup

Scripts live in **`scripts/`** and **`.cursor/rules/`** in this repo. **Git commits on Surface** are your rollback — no need to save separate copies of sync scripts.

### Agent rules (Cursor)

- Surface: `.cursor/rules/surface-sync-reminder.mdc`
- DGX Remote: `.cursor/rules/dgx-sync-reminder.mdc`

---

#### Who owns what

| File / folder | Source of truth | Direction |
|---------------|-----------------|-----------|
| **`MONETIZATION_ROADMAP.md`** | **Surface (PC)** | PC → DGX only (never pull back) |
| **`src/`**, app **`scripts/`** (not sync-*.ps1) | **Surface (PC)** | PC → DGX only |
| **`Pitch Deck/`**, **`README.md`**, **`package.json`**, branding doc pages | **DGX** (Cursor Remote edits) | DGX → PC only |
| **`vite.config.js`**, **`index.html`**, **`public/`**, **`.env`** | **Surface** (runs `npm run dev`) | Manual / stay on PC |

**One canonical roadmap:** only `MONETIZATION_ROADMAP.md`. Do not keep `MONETIZATION_ROADMAP_BACKUP.md`, `*_JUNE10_*`, or HTML exports on DGX — run `bash scripts/prune-sync-duplicates.sh` after PC push.

From the **Surface** repo root (PowerShell) — run in this order when both sides changed:

```powershell
# 1) Pull DGX doc/branding + sync workflow scripts (never src or roadmaps)
.\scripts\sync-from-dgx.ps1

# 2) Push PC code + MONETIZATION_ROADMAP.md → DGX (auto-runs ensure on DGX)
#    Prefer incremental: .\scripts\sync-to-dgx.ps1 -Paths src/library
.\scripts\sync-to-dgx.ps1
```

```powershell
# Away from home LAN
.\scripts\sync-to-dgx.ps1 -Remote
.\scripts\sync-from-dgx.ps1 -Remote

# Wrapper
.\scripts\sync-dgx.ps1 -Direction to-dgx -Paths src/library
.\scripts\sync-dgx.ps1 -Direction from-dgx
```

On **DGX** (optional — `sync-to-dgx.ps1` runs this automatically after each PC push):

```bash
cd /home/sifr/OpenNexus3DStudio/CharacterStudio
bash scripts/ensure-dgx-sync-ready.sh
```

Or push DGX-owned files to Surface when Surface SSH is enabled:

```bash
bash scripts/sync-to-pc.sh
```

Uses **`scp`** + **`ssh`** only (see `scripts/sync-to-dgx.ps1` / `sync-from-dgx.ps1`).

**What sync copies (PC → DGX):** `src/*`, app `scripts/*` (excluding `sync-*.ps1`, `prune-sync-duplicates.sh`, `sync-to-pc.sh`, `ensure-dgx-sync-ready.sh`), **`MONETIZATION_ROADMAP.md`**.

**PC → DGX also copies:** `MONETIZATION_ROADMAP.md`.

**DGX → PC also copies:** `Pitch Deck/`, `README.md`, `package.json`, branding doc pages (see `sync-from-dgx.ps1`), plus **sync workflow scripts** (`sync-*.ps1`, `prune-sync-duplicates.sh`) when those are updated on DGX.

**DGX → PC never copies:** `src/`, rest of `scripts/`, `MONETIZATION_ROADMAP.md`.

With **`-IncludeDocs`** on **to-dgx only**, also mirrors full `docs/` from PC. Avoid unless PC edited docs broadly — run `prune-sync-duplicates.sh` on DGX after.

**What sync does NOT copy:** `vite.config.js`, `index.html`, `public/`, `.env`. Those stay on whichever machine runs `npm run dev` (usually **Surface**).

**Critical:** If you browse **`https://10.0.0.32:3000`**, that is **Surface `npm run dev`**. Pushing files to DGX does **not** change that browser session. DGX sync is for the **Remote-SSH Cursor agent** on the Spark and for sharing docs with the **3DAIGC-API** codebase — not for updating the Surface dev server.

**Avatar rig GLBs** come from the **3DAIGC-API** export on DGX (`UniRig` → Blender GLB). Copying Character Studio docs to DGX does not fix broken rigs; the API must implement `docs/API_AVATAR_RIG_CONTRACT.md`. Re-opening an **old completed task** still downloads the **same** GLB — run a **new** avatar-from-image job after API fixes.

**Cursor:** Open the same tree on DGX via **Remote-SSH → DGX-Local** or **DGX-Remote**; run `npm run dev` on whichever machine serves the UI (usually Surface for Galaxy XR).

## Related docs

- [HTTPS setup](./HTTPS_SETUP.md) — certs and LAN IP for Galaxy XR
- [Webcam avatar control](./WEBCAM_AVATAR_CONTROL.md) — `webcamDebug`, remote logging
- [Android Studio AI brief](./ANDROID_STUDIO_AI_BRIEF.md) — APK relay + headset test steps
- [OpenXR face tracking (Android XR)](./OPENXR_FACE_TRACKING_ANDROID_XR.md) — Chrome vs native paths
