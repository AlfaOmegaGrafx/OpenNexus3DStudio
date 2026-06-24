# NVIDIA XR AI + 3DAIGC (DGX Spark)

Voice-driven **vision + 3D generation** on Galaxy XR using NVIDIA’s **xr-ai** stack on DGX Spark, wired to **3DAIGC-API** through HTTP MCP.

**Status:** Integrated on DGX (Jun 2026). Sample: `3daigc-vlm-example` — “make a 3D model of this” from headset camera + mic.

## Architecture

```text
[Galaxy XR Chrome]  camera + mic
        │  HTTPS (often via Surface proxy — see below)
        ▼
[xr-ai XR Media Hub :8088]  web client + LiveKit (7880–7882)
        │  STT → VLM (local or NVIDIA NIM) → TTS
        ▼
[3daigc-vlm-example worker]  voice agent + scene vision
        │  HTTP MCP tools (upload_image, image_to_textured_mesh, wait_for_job, …)
        ▼
[3daigc-mcp-http :8260]  FastMCP adapter
        ▼
[3DAIGC-API :7842]  TRELLIS / mesh jobs on Spark GPU
        ▼
[OpenNexus3DStudio]  load completed GLB/VRM in viewport (separate client path)
```

This is **complementary** to OpenNexus3DStudio’s Task Manager UI — same inference backend, different XR voice UX.

## Repos and paths (DGX only)

| Path | Role |
|------|------|
| `/home/sifr/xr-ai` | NVIDIA **xr-ai** — hub, STT/TTS/VLM servers, agent samples |
| `/home/sifr/xr-ai/agent-samples/3daigc-vlm-example` | Voice VLM + 3DAIGC mesh orchestrator |
| `/home/sifr/3DAIGC-API` | Inference API (`:7842`) |
| `/home/sifr/3DAIGC-API/mcp` | **3daigc-mcp-http** (`:8260`) — MCP tools over completed API |
| `/home/sifr/OpenNexus3DStudio/scripts/xr-spark-hub-proxy.mjs` | Optional Surface proxy (Galaxy XR → Spark hub) |

Overlay config (copy reference): `3DAIGC-API/mcp/yaml/xr_ai_3daigc_overlay.yaml`

## Ports (DGX)

| Port | Service |
|------|---------|
| **7842** | 3DAIGC-API |
| **8260** | 3daigc-mcp-http (`/mcp`) |
| **8088** | xr-ai **XR Media Hub** web UI (HTTPS) |
| **7880–7882** | LiveKit (WebRTC) for xr-ai hub |
| **8443** | Surface **xr-spark-hub-proxy** (optional; forwards to `https://10.0.0.158:8088`) |

## Start stack (DGX)

**One command** (API health check + MCP + full xr-ai sample):

```bash
cd /home/sifr/OpenNexus3DStudio
bash /home/sifr/3DAIGC-API/mcp/scripts/run_xr_ai_3daigc_stack.sh
```

Prerequisites only (API + MCP, no voice stack):

```bash
bash /home/sifr/3DAIGC-API/mcp/scripts/start_prerequisites.sh
```

MCP HTTP only:

```bash
bash /home/sifr/3DAIGC-API/mcp/scripts/run_http.sh
```

Monitor logs:

```bash
bash /home/sifr/3DAIGC-API/mcp/scripts/monitor_xr_ai_3daigc_stack.sh
```

Open hub UI on DGX LAN: `https://10.0.0.158:8088` (accept self-signed cert). Start mic; try *“make a 3D model of this”*.

## Galaxy XR + router client isolation

Some routers block **headset → DGX** (`10.0.0.224` → `10.0.0.158`) but allow **headset → Surface** (`10.0.0.32`).

**On Surface** (uses `certs/localhost.pem` from `npm run setup-https`):

```powershell
cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio
$env:XR_SPARK_HUB_URL = 'https://10.0.0.158:8088'
$env:XR_PROXY_PORT = '8443'
node scripts/xr-spark-hub-proxy.mjs
```

On Galaxy XR Chrome: `https://<Surface-LAN-IP>:8443` → proxies to Spark hub.

## MCP tools (3DAIGC)

Typical voice-agent flow:

1. `upload_image` — frame from XR camera  
2. `image_to_textured_mesh` — queue mesh job (e.g. TRELLIS.2)  
3. `wait_for_job` — poll until complete (minutes on Spark)  
4. Optional: `generate_rig` with `rig_mode=template` for avatars  

Worker config: `xr-ai/agent-samples/3daigc-vlm-example/yaml/3daigc_vlm_example_worker.yaml`  
`daigc_mcp_url: http://localhost:8260`

VLM backend: `model_backend: nim` uses hosted NVIDIA NIM (`NGC_API_KEY`); `local` runs on-Spark `vlm-server`.

## Relationship to OpenNexus3DStudio

| Layer | NVIDIA XR AI | OpenNexus3DStudio |
|-------|----------------|-------------------|
| XR input | Voice + passthrough camera via xr-ai hub | WebXR controllers, World Library, VRM viewport |
| 3D generation | MCP → 3DAIGC-API | Task Manager REST → same API |
| Output | Job files on DGX `outputs/` | Download + viewport load + RP1 publish |
| Companion | In-hub VLM agent | moeChat / AIRI handoff (roadmap §11) |

## Related docs

- [Dev machine topology](DEV_MACHINE_TOPOLOGY.md) — Surface vs DGX roles  
- [3DAIGC API](api/api.md) — REST endpoints MCP wraps  
- [Spatial fabric](SPATIAL_FABRIC_INTEGRATION.md) — publish completed meshes to OMB/RP1  
- `memory-bank/scripts-cheatsheet.md` §22 — operator commands  

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Stack exits on start | `curl -sf http://127.0.0.1:7842/api/v1/system/health` — restart API |
| MCP probe fails | Port 8260 in use; `bash …/mcp/scripts/run_http.sh` |
| Headset cannot reach `:8088` | Run **xr-spark-hub-proxy** on Surface `:8443` |
| Mesh never finishes | `monitor_xr_ai_3daigc_stack.sh`; Redis queue / GPU logs in `3DAIGC-API/logs/` |
| NIM errors | `NGC_API_KEY` set; or switch worker to `model_backend: local` + `HF_TOKEN` |
