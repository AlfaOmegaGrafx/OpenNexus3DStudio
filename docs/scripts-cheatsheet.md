# Scripts & terminal commands cheat sheet

*Last updated: 2026-06-25 — animation playback QA (bone audit, animSmoke).*

**How to read:** Every block says **machine**, **folder to open first**, **command**, and **what it does**.

**Secrets:** API keys and tokens live in `.env` / local MCP config only — never paste them in this file or in chat.

---

## Table of contents

1. [Repo roots & key paths](#1-repo-roots--key-paths)
2. [SSH between machines](#2-ssh-between-machines)
3. [Sync files DGX ↔ Surface](#3-sync-files-dgx--surface)
4. [Frontend dev (Surface)](#4-frontend-dev-surface)
5. [3DAIGC API — start & restart (DGX)](#5-3daigc-api--start--restart-dgx)
6. [3DAIGC API — logs & health (DGX)](#6-3daigc-api--logs--health-dgx)
7. [3DAIGC API — job queue monitoring](#7-3daigc-api--job-queue-monitoring)
8. [Model smoke tests (DGX)](#8-model-smoke-tests-dgx)
9. [Avatar pipeline smoke test (DGX)](#9-avatar-pipeline-smoke-test-dgx)
10. [SessionMem & Memory Bank](#10-sessionmem--memory-bank)
11. [Graphify (code map)](#11-graphify-code-map)
12. [Galaxy XR & remote logging (Surface)](#12-galaxy-xr--remote-logging-surface)
13. [IWSDK / Playwright (Surface)](#13-iwsdk--playwright-surface)
14. [Sunshine remote desktop (DGX)](#14-sunshine-remote-desktop-dgx)
15. [ComfyUI (DGX)](#15-comfyui-dgx)
16. [NVIDIA Sync (Surface)](#16-nvidia-sync-surface)
17. [Port reference (DGX)](#17-port-reference-dgx)
18. [Other services (optional)](#18-other-services-optional)
19. [RP1 / MSF spatial fabric (DGX)](#19-rp1--msf-spatial-fabric-dgx)
20. [Sneeze engine (DGX)](#20-sneeze-engine-dgx)
21. [Deprecated / do not use](#21-deprecated--do-not-use)
22. [Agent rules for the user](#22-agent-rules-for-the-user)

---

## 1. Repo roots & key paths

| What | DGX Spark | Surface PC |
|------|-----------|------------|
| **OpenNexus3DStudio** (frontend) | `/home/sifr/OpenNexus3DStudio` | `C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio` |
| **3DAIGC-API** (backend) | `/home/sifr/3DAIGC-API` | *(API runs on DGX only)* |
| **MSF Map Service** (RP1 / Scene Assembler) | `/home/sifr/MSF_Map_Svc` | *(DGX only)* |
| **Sneeze** (OMB engine lib) | `/home/sifr/Sneeze` | *(DGX only — native build)* |
| RP1 / MSF secrets (gitignored) | `~/.config/rp1-spatial-fabric/rp1.env` | copy template from `rp1.env.example` |
| Memory Bank | `.../memory-bank/` | `...\memory-bank\` |
| SessionMem team folder | `.../.sessionmem-team/OpenNexus3DStudio/` | `...\.sessionmem-team\OpenNexus3DStudio\` |
| SessionMem local DB | `~/.sessionmem/memories.db` | `C:\Users\alfao\.sessionmem\memories.db` |
| MCP config (repo) | `.../.mcp.json` | `...\.mcp.json` |
| Graphify output | `.../graphify-out/` | `...\graphify-out\` |
| Remote debug log | — | `...\logs\remote-log.txt` |

**LAN IPs (typical):** Surface `10.0.0.32` · DGX `10.0.0.158` · API URL from Surface: `http://10.0.0.158:7842` (or Vite proxy `/__dev_dgx_proxy`).

**Public fabric (Tailscale Funnel):** `https://dgx-spark.tail6121eb.ts.net/` · MSF JSON: `…/fabric/sample.msf` · Scene Assembler: host **root** (not raw `.msf` in browser).

---

## 2. SSH between machines

### Surface → DGX

| | |
|--|--|
| **Where** | **Surface** — PowerShell or Cursor terminal |
| **At home** | `ssh DGX-Local` |
| **Away (Tailscale)** | `ssh DGX-Remote` |
| **Cursor Remote-SSH** | Host `dgx-spark.local` → folder `/home/sifr` |

**SSH alias reference:** `scripts/dgx-device-map.ps1` on Surface (display names vs `DGX-Local` / `DGX-Remote` / LAN `10.0.0.158`).

### DGX → Surface

| | |
|--|--|
| **Where** | **DGX** — terminal |
| **Command** | `ssh Surface-PC-Tailscale` |

---

## 3. Sync files DGX ↔ Surface

*These copy files over SSH (scp). They are **not** git push/pull.*

### Push DGX-owned files → Surface

| | |
|--|--|
| **Where** | **DGX** |
| **Folder** | `cd /home/sifr/OpenNexus3DStudio` |
| **After edits (preferred)** | `bash scripts/sync-changes-to-pc.sh --retry-until-complete` |
| **Changes only, one pass** | `bash scripts/sync-changes-to-pc.sh` |
| **Full sync (all DGX-owned paths)** | `bash scripts/sync-to-pc.sh` |
| **With `src/`** | `bash scripts/sync-changes-to-pc.sh --include-src --retry-until-complete` *(only when DGX owned those edits)* |
| **Agent context** | `bash scripts/sync-changes-to-pc.sh --include-agent-context --retry-until-complete` |

*`sync-changes-to-pc.sh` uses `git status` — only changed DGX-owned files. `--retry-until-complete` retries failed scp until done (max 8 rounds). Mirror of Surface `sync-changes-to-dgx.ps1`.*

### Push Surface-owned files → DGX

| | |
|--|--|
| **Where** | **Surface** — PowerShell |
| **Folder** | `cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio` |
| **After edits (preferred)** | `.\scripts\sync-changes-to-dgx.ps1 -RetryUntilComplete` |
| **Changes only, one pass** | `.\scripts\sync-changes-to-dgx.ps1` |
| **Full sync (all src top-level dirs)** | `.\scripts\sync-to-dgx.ps1 -RetryUntilComplete` |
| **Full + retry stuck dirs** | `.\scripts\sync-to-dgx.ps1 -RetryUntilComplete` |
| **Include docs too** | `.\scripts\sync-to-dgx.ps1 -IncludeDocs` |
| **Away from home** | `.\scripts\sync-changes-to-dgx.ps1 -Remote -RetryUntilComplete` |

*`sync-changes-to-dgx.ps1` uses `git status` — only changed Surface-owned files. `-RetryUntilComplete` retries failed scp until done (max 8 rounds).*

### Pull DGX docs/scripts → Surface (no Surface `src/` push)

| | |
|--|--|
| **Where** | **Surface** |
| **Folder** | `cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio` |
| **Command** | `.\scripts\sync-from-dgx.ps1` |
| **Away from home** | `.\scripts\sync-from-dgx.ps1 -Remote` |

### Copy `remote-log.txt` Surface → DGX (manual)

| | |
|--|--|
| **Where** | **Surface** — PowerShell |
| **Folder** | `cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio` |
| **Command** | `scp logs\remote-log.txt sifr@DGX-Local:/home/sifr/OpenNexus3DStudio/logs/` |

---

## 4. Frontend dev (Surface)

### Start Vite dev server

| | |
|--|--|
| **Where** | **Surface** — PowerShell |
| **Folder** | `cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio` |
| **Command** | `npm run dev` |
| **Stop** | `Ctrl+C` in that terminal |

Port **3000** runs on Surface, not on DGX.

### Kill whatever is holding port 3000

| | |
|--|--|
| **Where** | **Surface** — PowerShell |
| **Command** | `$pid = (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess; Stop-Process -Id $pid -Force` |

### Debug URLs (replace IP if yours differs)

| URL | Purpose |
|-----|---------|
| `https://10.0.0.32:3000/?nativeFaceRelay=1&remoteLog=1` | Native face relay + remote log |
| `https://10.0.0.32:3000/?webcamDebug=1&remoteLog=1` | Webcam debug |
| `https://10.0.0.32:3000/?xrDebugInputs=1&remoteLog=1` | XR input debug |

Append `&v=2` to bust headset cache after deploy.

### Animation playback QA (Surface — Vite must be running on :3000)

| Task | Command |
|------|---------|
| Canned Mixamo smoke (VRM hips move) | `npm run test:anim-smoke` |
| Bone audit — Walking + Kimodo (Playwright) | `npm run test:bone-audit` |
| Kimodo job for audit | `set MOTION_JOB_ID=JOB_UUID&& npm run test:bone-audit` |
| Anim regression unit tests | `npm run test:anim-regression` |
| Manual browser hooks | Open `https://10.0.0.32:3000/?animSmoke=1` then DevTools → `await __csAnimSmoke.auditBones()` |

Optional env: `ANIM_SMOKE_URL=https://10.0.0.32:3000` (default LAN HTTPS origin).

**From DGX** (SSH to Surface and run in repo):

```bash
ssh Surface-PC-Tailscale "cd C:/Users/alfao/Documents/GitHub/OpenNexus3DStudio && npm run test:anim-smoke"
ssh Surface-PC-Tailscale "cd C:/Users/alfao/Documents/GitHub/OpenNexus3DStudio && set MOTION_JOB_ID=90cc20fe-da7d-4175-8601-f40e1819515e&& npm run test:bone-audit"
```

**Eagle Knight (SkinTokens GLB):** job `79a9f3d5-10e3-4ba0-9b7f-593aa6191455` — `skintokens_tokenrig_cli`, skeleton `bone_0`…`bone_51`. Do **not** apply VRM0 quat axis fix on SkinTokens (causes reversed limbs). VRM canned + Kimodo locked via `npm run test:anim-regression` (`vrmPlaybackLock.test.js`).

---

## 5. 3DAIGC API — start & restart (DGX)

**Repo path:** `cd /home/sifr/3DAIGC-API` (not `~/github/3DAIGC-API`).

**Preferred (multi-worker + scheduler, background):** use `stop_services.sh` / `restart_services.sh` — avoids duplicate schedulers.

### Stop API + scheduler (clean)

| | |
|--|--|
| **Where** | **DGX** |
| **Folder** | `cd /home/sifr/3DAIGC-API` |
| **Commands** | |
```bash
docker start 3daigc-redis    # if Redis container not running
bash scripts/stop_services.sh           # graceful — drains in-flight jobs (≤5 min)
bash scripts/stop_services.sh --force     # immediate kill, no drain
```
| **Does** | Stops scheduler (GPU workers), uvicorn, orphaned model subprocesses |

### Restart (background — production default)

| | |
|--|--|
| **Where** | **DGX** |
| **Folder** | `cd /home/sifr/3DAIGC-API` |
| **Commands** | |
```bash
docker start 3daigc-redis
bash scripts/restart_services.sh          # stop (drain) + start_services_detached.sh
bash scripts/restart_services.sh --force  # skip drain
sleep 3
curl -s http://127.0.0.1:7842/api/v1/system/health | python3 -m json.tool
```
| **Does** | One scheduler + uvicorn (`main_multiworker`, 4 workers) on **7842** |

### Start detached (first time after stop)

| | |
|--|--|
| **Where** | **DGX** |
| **Folder** | `cd /home/sifr/3DAIGC-API` |
| **Commands** | |
```bash
source scripts/env_local_gpu.sh
bash scripts/start_services_detached.sh
```
| **Does** | Refuses to start if scheduler/API already running — run `stop_services.sh` first |

Logs: `logs/api.log`, `logs/scheduler.log`. PIDs: `run/api.pid`, `run/scheduler.pid`.

Optional worker idle unload (scheduler env): `P3D_WORKER_IDLE_SEC=900` (15 min default), `P3D_WORKER_EVICT_SEC=30`.

### Sync spatial-fabric env into API `.env`

| | |
|--|--|
| **Where** | **DGX** |
| **Folder** | `cd /home/sifr/3DAIGC-API` |
| **Command** | `bash scripts/sync-spatial-fabric-env.sh` |
| **Does** | Copies `~/.config/rp1-spatial-fabric/rp1.env` vars into `3DAIGC-API/.env` — restart API after |

### First-time / clean start (foreground — single worker)

| | |
|--|--|
| **Where** | **DGX** |
| **Folder** | `cd /home/sifr/3DAIGC-API` |
| **Commands** | |
```bash
docker start 3daigc-redis    # if Redis container not running
source scripts/env_local_gpu.sh
./scripts/run_local_venv.sh
```
| **Does** | Single-worker API on port **7842**; terminal stays attached |

### Restart (foreground — single-worker dev)

| | |
|--|--|
| **Where** | **DGX** |
| **Folder** | `cd /home/sifr/3DAIGC-API` |
| **Commands** | |
```bash
source scripts/env_local_gpu.sh
pkill -f 'uvicorn api.main_singleworker:app' 2>/dev/null || true
sleep 2
fuser -k 7842/tcp 2>/dev/null || true
sleep 1
./scripts/run_local_venv.sh
```

Config-only changes (e.g. `models.yaml`): stop + start is enough — no model rebuild.

### One-time API maintenance scripts (DGX)

| Task | Command |
|------|---------|
| Ensure detached start sources `.env` (MSF vars) | `/home/sifr/3DAIGC-API/venv/bin/python /home/sifr/OpenNexus3DStudio/scripts/dgx-api-source-env-patch.py` |
| Add `POST /spatial-fabric/publish-glb` route (if missing) | `/home/sifr/3DAIGC-API/venv/bin/python /home/sifr/OpenNexus3DStudio/scripts/dgx-api-add-publish-glb.py` |

Restart API after either patch (section 5).

### Restart (background — single worker, legacy)

| | |
|--|--|
| **Where** | **DGX** |
| **Folder** | `cd /home/sifr/3DAIGC-API` |
| **Commands** | |
```bash
source scripts/env_local_gpu.sh
pkill -f 'uvicorn api.main_singleworker:app' 2>/dev/null || true
sleep 2
fuser -k 7842/tcp 2>/dev/null || true
sleep 1
mkdir -p logs
nohup ./scripts/run_local_venv.sh >> logs/api.log 2>&1 &
sleep 2
curl -s http://127.0.0.1:7842/api/v1/system/health
```

### Multi-worker foreground (attached terminal)

| | |
|--|--|
| **Where** | **DGX** |
| **Folder** | `cd /home/sifr/3DAIGC-API` |
| **Commands** | |
```bash
bash scripts/stop_services.sh
source scripts/env_local_gpu.sh
bash scripts/run_server.sh
```
| **Does** | Scheduler + uvicorn in one terminal; `Ctrl+C` stops both |

### Different port

```bash
P3D_PORT=7843 ./scripts/run_local_venv.sh
```

### Free port 7842 manually

```bash
ss -tlnp | grep 7842    # or: lsof -i :7842
kill <PID>
```

---

## 6. 3DAIGC API — logs & health (DGX)

### Live logs (best while jobs run)

| | |
|--|--|
| **Where** | **DGX** |
| **Folder** | `cd /home/sifr/3DAIGC-API` |
| **Command** | `tail -f logs/api.log logs/scheduler.log` |

### Health check

```bash
curl -s http://127.0.0.1:7842/api/v1/system/health | python3 -m json.tool
curl -s http://127.0.0.1:7842/api/v1/system/models | python3 -m json.tool
curl -s http://127.0.0.1:7842/api/v1/spatial-fabric/config | python3 -m json.tool
```

`uptime` in health is seconds since API worker start (not epoch).

### From Surface (not on DGX)

```bash
curl -s http://10.0.0.158:7842/api/v1/system/health | python3 -m json.tool
```

Add `-H "Authorization: Bearer YOUR_API_KEY"` if API key auth is enabled (key in `.env`).

---

## 7. 3DAIGC API — job queue monitoring

All on **DGX** in `/home/sifr/3DAIGC-API` unless noted.

| Task | Command |
|------|---------|
| Queue snapshot | `curl -s http://127.0.0.1:7842/api/v1/system/jobs/queue/stats \| python3 -m json.tool` |
| Auto-refresh queue | `watch -n 2 'curl -s http://127.0.0.1:7842/api/v1/system/jobs/queue/stats \| python3 -m json.tool'` |
| Queue + recent jobs | `watch -n 2 'echo "=== $(date) ==="; curl -s http://127.0.0.1:7842/api/v1/system/jobs/queue/stats \| python3 -m json.tool; echo; curl -s "http://127.0.0.1:7842/api/v1/system/jobs/history?limit=5" \| python3 -c "import sys,json; d=json.load(sys.stdin); jobs=d.get(\"jobs\",[]); print(\"Recent jobs:\"); [print(f\"  {j.get(\"job_id\",\"?\")[:8]}… {j.get(\"status\"):12} {j.get(\"feature\",\"\")}\") for j in jobs[:5]]"'` |
| Recent jobs | `curl -s "http://127.0.0.1:7842/api/v1/system/jobs/history?limit=20" \| python3 -m json.tool` |
| Failed jobs only | `curl -s "http://127.0.0.1:7842/api/v1/system/jobs/history?limit=20&status=failed" \| python3 -m json.tool` |
| One job detail | `curl -s http://127.0.0.1:7842/api/v1/system/jobs/JOB_ID \| python3 -m json.tool` |
| Poll one job | `watch -n 3 'curl -s http://127.0.0.1:7842/api/v1/system/jobs/JOB_ID \| python3 -c "import sys,json; j=json.load(sys.stdin); print(j.get(\"status\"), j.get(\"progress\"), j.get(\"message\"), j.get(\"error\"))"'` |

**Quick pick:** `tail -f logs/api.log logs/scheduler.log` for live inference + `watch` on queue stats.

**Note:** `tail -f` / `watch` stop showing new output after `restart_services.sh` — restart monitors after every API restart.

**Redis vs SQLite:** Live job status/download uses **Redis only** (~24h TTL on completed results). `data/job_queue.db` is a legacy archive — `NOT_IN_SQLITE` is normal for old world jobs.

### Rehydrate expired Image-to-World job (Redis)

| | |
|--|--|
| **Where** | **DGX** |
| **When** | API returns **404** for job/manifest but files still exist under `outputs/worlds/<job_id>/` |
| **Command** | `/home/sifr/3DAIGC-API/venv/bin/python /home/sifr/OpenNexus3DStudio/scripts/dgx-rehydrate-world-job.py JOB_ID` |
| **Does** | Re-registers completed job in Redis from on-disk `world.manifest.json` + `environment.ply` |
| **Verify** | `curl -sS -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:7842/api/v1/system/jobs/JOB_ID/download?asset=manifest'` *(expect 200)* |

*Use **3DAIGC-API venv** python — system `python3` may lack the `redis` module.*

### Query job in SQLite archive

| | |
|--|--|
| **Where** | **DGX** |
| **Command** | `/home/sifr/3DAIGC-API/venv/bin/python /home/sifr/OpenNexus3DStudio/scripts/dgx-query-job-sqlite.py JOB_ID` |
| **Does** | Prints `(job_id, status, feature)` or `NOT_IN_SQLITE` — diagnostic only; does not fix API 404 |

Omit `JOB_ID` to list the first 5 rows in `jobs`.

---

## 8. Model smoke tests (DGX)

| | |
|--|--|
| **Where** | **DGX** |
| **Folder** | `cd /home/sifr/3DAIGC-API` |
| **Env** | `source scripts/env_local_gpu.sh` |

```bash
# UV unwrap (fast, CPU)
python scripts/verify_model.py adapters.xatlas_adapter XatlasUVUnwrappingAdapter \
  '{"mesh_path": "assets/example_uv/igea.obj", "output_format": "obj"}'

# Retopo (needs Instant Meshes binary)
python scripts/verify_model.py adapters.instant_meshes_adapter InstantMeshesRetopologyAdapter \
  '{"mesh_path": "assets/example_retopo/001.obj", "target_vertex_count": 2000}'

# Segmentation (heavy GPU)
python scripts/verify_model.py adapters.p3sam_adapter P3SAMSegmentationAdapter \
  '{"mesh_path": "assets/example_mesh/typical_creature_dragon.obj"}'
```

### Download model weights

```bash
cd /home/sifr/3DAIGC-API
./scripts/download_models.sh --list                    # see names
./scripts/download_models.sh -m triposplat             # NOT bare "triposplat" arg
./scripts/download_models.sh -m unirig,triposplat      # multiple
```

---

## 9. Avatar pipeline smoke test (DGX)

1. Place your master rig:
   `cp /path/to/your/master.vrm /home/sifr/3DAIGC-API/assets/example_autorig/template.vrm`
2. Download weights if needed:
   `cd /home/sifr/3DAIGC-API && ./scripts/download_models.sh -m triposplat`
3. Restart API (section 5).
4. In **OpenNexus3DStudio** on Surface:
   - **Avatar from Image** → upload photo → Start, or
   - Image to 3D → load mesh → Auto Rigging → Rig mode: Template VRM

---

## 10. SessionMem & Memory Bank

| Tool | When | Where | Command |
|------|------|-------|---------|
| **SessionMem sync** | After coding session | DGX | `cd /home/sifr/OpenNexus3DStudio` → `bash scripts/sync-sessionmem-team.sh` |
| **SessionMem sync** | After coding session | Surface | `cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio` → `.\scripts\sync-sessionmem-team.ps1` |
| **Memory Bank** | Start of task | — | Agent reads `memory-bank/*.md` automatically |
| **Memory Bank** | After big changes | Chat | Say **update memory bank** |
| **Agent context → Surface** | After DGX agent session | DGX | `bash scripts/sync-to-pc.sh --include-agent-context` |
| **Agent context ← DGX** | Start Surface session | Surface | `.\scripts\sync-from-dgx.ps1 -IncludeAgentContext` |
| **PLAN / ACT** | Planning vs coding | Chat | `PLAN` = plan only · `ACT` = implement |

One-time SessionMem ID migration (done 2026-06-16): `python3 scripts/migrate-sessionmem-project-id.py` (DGX) or `.\scripts\migrate-sessionmem-project-id.ps1` (Surface).

---

## 11. Graphify (code map)

| | |
|--|--|
| **Refresh DGX** (frontend + API) | `cd /home/sifr/OpenNexus3DStudio` → `bash scripts/refresh-graphify-dgx.sh` |
| **Refresh Surface** (frontend) | `cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio` → `.\scripts\refresh-graphify-surface.ps1` |
| **Query** (either machine, in repo) | `graphify query "how does taskManager connect to API"` |

AST-only, no API keys. Output: `graphify-out/` (gitignored).

---

## 12. Galaxy XR & remote logging (Surface)

### Tail browser remote log

| | |
|--|--|
| **Where** | **Surface** — PowerShell |
| **Folder** | `cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio` |
| **Command** | `Get-Content .\logs\remote-log.txt -Wait -Tail 30` |

### Filter face-relay lines

```powershell
Get-Content .\logs\remote-log.txt -Wait -Tail 50 | Select-String "REMOTE_LOG|native-face-relay|CS-NATIVE-FACE|nativeFaceRelay|\[XR\]\[expression\]|nativeFaceBridge|WebcamAvatarDriver"
```

### Capture Galaxy XR APK logcat

| | |
|--|--|
| **Where** | **Surface** |
| **Folder** | `cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio` |
| **Command** | `.\scripts\capture-apk-logcat.ps1` |
| **Output** | `logs\apk-logcat.txt` |

*Note: `capture-nativeFaceRelay-logcat.ps1` in old notes → use `capture-apk-logcat.ps1`.*

### Other XR scripts (all from OpenNexus3DStudio repo on Surface)

| Script | Purpose |
|--------|---------|
| `.\scripts\reconnect-galaxy-xr-debug.ps1` | Reconnect wireless/USB ADB to headset |
| `.\scripts\start-dev-with-xr.bat` | Dev + XR helper |

---

## 13. IWSDK / Playwright (Surface)

| | |
|--|--|
| **Folder** | `cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio` |

| Task | Command |
|------|---------|
| One-time Chromium | `npm run playwright:install` |
| Refresh MCP adapters | `npm run iwsdk:adapter-sync` |
| Dev (reliable on Windows) | `npm run dev:runtime` |
| Dev (IWSDK wrapper) | `npm run dev` *(can fail on some Windows shells)* |
| XR smoke (no headset) | `npm run iwsdk:xr-smoke` |
| Dev status | `npx iwsdk dev status` |
| Browser screenshot | `npx iwsdk browser screenshot` |
| MCP inspect | `npx iwsdk mcp inspect` |

Playwright MCP token: set in local `.env` / MCP config — not in this doc.

---

## 14. Sunshine remote desktop (DGX)

| Task | Command |
|------|---------|
| Script location | `/home/sifr/start-sunshine.sh` |
| Run script | `cd /home/sifr && ./start-sunshine.sh` |
| Manual start | `DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority flatpak run dev.lizardbyte.app.Sunshine` |
| After lock / HDMI change | `systemctl --user restart sunshine` then `systemctl --user status sunshine` |
| Auto-start on login | `systemctl --user enable sunshine` |
| Re-enable keyring auto-unlock | `~/disable-keyring-auto-unlock.sh` |

---

## 15. ComfyUI (DGX)

| | |
|--|--|
| **Where** | **DGX** |
| **Folder** | `cd /home/sifr/ComfyUI` |
| **Commands** | |
```bash
source .venv/bin/activate
python main.py
```
| **URL** | `http://localhost:8188` when running |

---

## 16. NVIDIA Sync (Surface)

| | |
|--|--|
| **Where** | **Surface** — PowerShell |
| **Folder** | `cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio` |
| **Command** | `.\scripts\restart-nvidia-sync.ps1` |

---

## 17. Port reference (DGX)

| Port | Service | Notes |
|------|---------|-------|
| **7842** | 3DAIGC-API (uvicorn) | Main API — Surface reaches via LAN or Vite proxy |
| **8088** | XR Spark hub (`xr_media_hub`) | Voice UI on DGX; Surface iframe uses `:8443` proxy |
| **8260** | 3daigc-mcp-http | XR voice → 3DAIGC-API MCP |
| **8443** | MSF Map Service (HTTPS) | Scene Assembler on DGX; Surface uses `:8453` proxy |
| **8453** | MSF proxy | **Surface only** — `npm run msf-proxy` → DGX `:8443` |
| **6379** | Redis (`3daigc-redis`) | Job queue — required for API |
| **3306** | MySQL (`msf-mysql`) | MSF map DB — Docker, localhost only |
| **22** | SSH | Cursor Remote, sync scripts, scp |
| **3000** | Vite | **Surface only** — not on DGX |
| **8188** | ComfyUI | When ComfyUI is running |
| **11434** | Ollama | Local LLM API |
| **8080** | OpenShell cluster | Separate from 3DAIGC |

---

## 18. Other services (optional)

### OpenClaw / Nemoclaw (if installed)

| Task | Command |
|------|---------|
| Enter sandbox | `nemoclaw sparkyai connect` |
| Interactive UI | `openclaw tui` |
| Exit TUI | `/exit` |
| Return to host shell | `exit` |
| One-shot agent | `openclaw agent --agent main -m "hello" --session-id test` |
| Gateway token | `nemoclaw sparkyai gateway-token --quiet` *(do not commit)* |

### Git (user runs manually — agents do not push)

| Where | Folder | Command |
|-------|--------|---------|
| DGX | `cd /home/sifr/3DAIGC-API` | `git add … && git commit -m "…" && git push origin main` |
| Surface | `cd C:\Users\alfao\Documents\GitHub\3DAIGC` | `git pull` / `git push origin main` *(if using relay)* |

### Windows accessibility

**Narrator panel:** `Win + Ctrl + Enter`

---

## 19. RP1 / MSF spatial fabric + XR Voice (DGX + Surface)

Config: `~/.config/rp1-spatial-fabric/rp1.env` (`RP1_COMPANY_ID`, `MSF_EDIT_KEY`, `MSF_BROWSER_PUBLIC_URL`, `XR_BROWSER_PUBLIC_URL`, …).

### One-time setup (DGX — agents run after fresh install or if XR hub keeps dying)

| Task | Where | Folder | Command |
|------|-------|--------|---------|
| XR hub auto-restart (systemd user unit) | DGX | `cd /home/sifr/3DAIGC-API` | `bash scripts/install-xr-stack-systemd.sh` |
| Keep systemd running after logout | DGX | any | `sudo loginctl enable-linger sifr` |

Check XR service: `systemctl --user status xr-ai-3daigc-stack.service` · logs: `tail -40 /home/sifr/3DAIGC-API/logs/xr-ai-stack.log`

### Routine (DGX — after reboot or “Spark hub unreachable”)

| Task | Where | Folder | Command |
|------|-------|--------|---------|
| Start/repair MSF :8443 + XR :8088 | DGX | `cd /home/sifr/3DAIGC-API` | `bash scripts/ensure-spark-dev-services.sh` |
| Verify DGX + Surface proxy paths | DGX | `cd /home/sifr/3DAIGC-API` | `bash scripts/verify-spark-dev-stack.sh` |

### When `rp1.env` URLs change only

| Task | Where | Folder | Command |
|------|-------|--------|---------|
| Sync MSF + XR URLs → API + OpenNexus `.env` | DGX | `cd /home/sifr/3DAIGC-API` | `bash scripts/sync-dev-topology-env.sh` |

### MSF / Scene Assembler (DGX)

| Task | Where | Folder | Command |
|------|-------|--------|---------|
| Apply env → MSF settings | DGX | `cd /home/sifr/MSF_Map_Svc` | `bash scripts/configure-from-env.sh` |
| Start MSF + Scene Assembler | DGX | `cd /home/sifr/MSF_Map_Svc` | `bash scripts/run-msf-map-svc.sh` |
| Verify local + public fabric URL | DGX | `cd /home/sifr/MSF_Map_Svc` | `bash scripts/verify-fabric-url.sh` |
| Tailscale Funnel exposure | DGX | `cd /home/sifr/MSF_Map_Svc` | `bash scripts/setup-tailscale-exposure.sh` |
| Seed GLB into map DB | DGX | `cd /home/sifr/MSF_Map_Svc` | `bash scripts/seed-map-object.sh [path/to/model.glb] [object-name.glb]` |
| Sync MSF vars → 3DAIGC-API | DGX | `cd /home/sifr/3DAIGC-API` | `bash scripts/sync-spatial-fabric-env.sh` |
| Set Scene Assembler login key | DGX | `cd /home/sifr/MSF_Map_Svc` | `bash scripts/set-msf-edit-key.sh 'your-key'` |

### Surface (each dev session — not DGX)

| Task | Where | Folder | Command |
|------|-------|--------|---------|
| Both proxies (MSF :8453 + XR :8443) | Surface | `cd OpenNexus3DStudio` | `npm run dev:spark-proxies` |
| Verify proxies reach DGX | Surface | `cd OpenNexus3DStudio` | `npm run verify:dev-proxies` |

**Scene Assembler login:** open host root (not a raw `.msf` file). Two fields:
- **Fabric URL** must match the host you opened Scene Assembler on:
  - Surface / Galaxy XR: `https://10.0.0.32:8453/fabric/` (with `npm run msf-proxy`)
  - Tailscale: `https://dgx-spark.tail6121eb.ts.net/fabric/`
  - Scene Assembler auto-fills `window.location.origin + '/fabric/'` — use that value; do **not** mix Tailscale fabric URL with Surface host (or vice versa).
- **Key:** value of `MSF_EDIT_KEY` in `rp1.env` only — **not** dev.rp1.com password, **not** `MSF_DB_PASSWORD`

Set your own key: `bash /home/sifr/MSF_Map_Svc/scripts/set-msf-edit-key.sh 'your-key-here'`

**Agent default after MSF/XR URL or service work:** run `ensure-spark-dev-services.sh` then `verify-spark-dev-stack.sh` on DGX; do not edit `.env` URLs unless `rp1.env` changed.

**Client doc:** `docs/SPATIAL_FABRIC_INTEGRATION.md` · protected state: `memory-bank/spatial-fabric-rp1-protected-state.md` (gitignored).

**World Library RP1:** publishes **GLB props** from world manifest only — splat-only Image-to-World jobs (`prop_count: 0`) cannot publish; use **Task Manager → Publish RP1** on mesh jobs (image-to-3d, auto-rig).

---

## 20. Sneeze engine (DGX)

Native OMB browser engine ([MetaversalCorp/Sneeze](https://github.com/MetaversalCorp/Sneeze)). Static lib only — not required for Scene Assembler publish today.

| Task | Where | Folder | Command |
|------|-------|--------|---------|
| Install build prereqs (sudo once) | DGX | `cd /home/sifr/Sneeze` | `bash scripts/install-prereqs-dgx.sh` |
| Pull + rebuild + smoke tests | DGX | `cd /home/sifr/Sneeze` | `bash scripts/build-dgx-spark.sh` |
| Incremental Sneeze-only rebuild | DGX | `cd /home/sifr/Sneeze` | `bash scripts/build-linux.sh` |
| Full deps + Sneeze (first time) | DGX | `cd /home/sifr/Sneeze` | `bash scripts/build-linux.sh --all` |
| Force scrub + rebuild | DGX | `cd /home/sifr/Sneeze` | `bash scripts/build-linux.sh --rebuild` |
| Smoke tests (manual) | DGX | `cd /home/sifr/Sneeze` | `builds/linux-arm64/install/release/bin/SneezeTest --wasm --net` |

Artifact: `builds/linux-arm64/install/release/lib/libSneeze.a`. More: `Sneeze/docs/DGX_SPARK.md`.

---

## 21. Deprecated / do not use

| Old command / path | Use instead |
|--------------------|-------------|
| `C:\Users\alfao\Documents\GitHub\CharacterStudio` | `...\OpenNexus3DStudio` |
| `cd ~/OpenNexus3DStudio/CharacterStudio` | `cd /home/sifr/OpenNexus3DStudio` |
| `cd ~/github/3DAIGC-API` | `cd /home/sifr/3DAIGC-API` |
| `bash start-api-in-container.sh` | `./scripts/run_local_venv.sh` (venv, not Docker API) |
| `docker exec 3daigc-api pkill …` | `pkill -f 'uvicorn api.main_singleworker:app'` |
| `./scripts/download_models.sh triposplat` | `./scripts/download_models.sh -m triposplat` |
| `sync-from-dgx.ps1 -IncludeDocs` | `-IncludeDocs` is on **`sync-to-dgx.ps1`**, not sync-from |
| `capture-nativeFaceRelay-logcat.ps1` | `.\scripts\capture-apk-logcat.ps1` |
| SessionMem folder `CharacterStudio/` | `.sessionmem-team/OpenNexus3DStudio/` |
| Manual `pkill` scheduler/API only | `bash scripts/stop_services.sh` then `start_services_detached.sh` or `restart_services.sh` |
| `builds/.../bin/WasmTest` / `NetTest` | `SneezeTest --wasm --net` (unified test runner) |
| Restart API without stopping scheduler | `bash scripts/restart_services.sh` *(always stop scheduler first)* |

---

## 22. Agent rules for the user

When an agent gives you a command:

1. **Machine** — DGX or Surface
2. **Folder** — full path to `cd` first
3. **Command** — copy-paste block
4. **Purpose** — one line

Agents should **run commands themselves** when possible. This file is the canonical inventory — update it when adding workflow scripts.

**Also on Surface Desktop (keep in sync):**
- `C:\Users\alfao\Desktop\DGX\DGX Terminal Commands.md`
- `C:\Users\alfao\Desktop\DGX\DGX Terminal Commands.txt`
