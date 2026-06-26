# OpenNexus3DStudio: SPACE-TIME EDITION

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Cross-Platform](https://img.shields.io/badge/platform-MacOS%20%7C%20Windows%20%7C%20Web%20%7C%20XR-blue)](#)

**OpenNexus3DStudio: SPACE-TIME EDITION** is a unified 3D AIGC application with advanced WebXR support. It combines legacy **Open3DStudio** capabilities with **OpenNexus3DStudio** (WebXR, WebGPU, blockchain) and integrated **VRM avatar authoring** (appearance traits, animation, mint/export). It works closely with the [3DAIGC-API](https://github.com/AlfaOmegaGrafx/3DAIGC-API) to provide **completely locally deployed** and **free** 3DAIGC workflows. Basically it's an advanced version of the **[Minimal3DStudio](https://github.com/FishWoWater/Minimal3DStudio)** and much like a **replicate of [TripoStudio](https://studio.tripo3d.ai/home?lng=en)**.

**Project Evolution**: The project started as **Open3DStudio**, evolved into **OpenNexus3DStudio: SPACE-TIME EDITION** with WebXR, WebGPU, and blockchain features, and now ships avatar/VRM workflows in the same app (formerly referred to separately as "Character Studio").

**Goals & structure**: The [roadmap](docs/docs/history.md#roadmap) includes connecting wallet to load profiles or mint files and AI personality features. OpenNexus3DStudio uses a **soulbound base body** VRM (non-transferable) and **equippable** wearables/traits; programmatic avatar configuration from owned wallet assets is in progress (see [Create an Avatar](docs/docs/General/create-an-avatar.md#configure-programmatically) and [Wallet-Owned Assets Approach](docs/WALLET_OWNED_ASSETS_AVATAR_APPROACH.md)). Technical and product roadmaps are detailed in the docs (e.g. [Technical Roadmap: RPM Migration](docs/TECHNICAL_ROADMAP_RPM_MIGRATION.md)).

The supported workflows include text-to-3D, image-to-3D, mesh painting, segmentation, retopology, UV unwrapping, VoxHammer editing, auto-rigging, Gaussian splats, explorable worlds, avatar-from-image, spatial-fabric publish (RP1/OMB), VRM optimization, trait customization, animation, and more.

## Demo 
Browse the [screenshot & demo album](https://photos.app.goo.gl/d7TRHmnTT54QashN7) or clone and build from [github.com/AlfaOmegaGrafx/OpenNexus3DStudio](https://github.com/AlfaOmegaGrafx/OpenNexus3DStudio) (desktop: `npm run dist-mac` / `dist-win` / `dist-linux`).

Deploy the [3DAIGC-API](https://github.com/AlfaOmegaGrafx/3DAIGC-API) backend on your own machine or server (see **API Backend Setup** below). Screenshots: [demo album](https://photos.app.goo.gl/d7TRHmnTT54QashN7).

### Public demo (Vercel)

The repo is **Vercel deploy-ready** for a public viewport demo (VRM upload, traits, UI) without exposing LAN/DGX secrets:

- Config: [`vercel.json`](vercel.json) — `VITE_PUBLIC_DEMO=1`, loot assets via CDN
- Build guard: `npm run verify:public-env` blocks client secrets on CI/Vercel
- Docs: [docs/PUBLIC_DEPLOY.md](docs/PUBLIC_DEPLOY.md)

Import the GitHub repo in Vercel; no `VITE_API_ENDPOINT` required for the public demo. Full AI generation stays on local dev + self-hosted [3DAIGC-API](https://github.com/AlfaOmegaGrafx/3DAIGC-API).

**Phygital passport (mock):** `/verify/ST-DEMO-0001` — digital twin passport UI preview; see [docs/PHYGITAL_NFC_APPAREL_ROADMAP.md](docs/PHYGITAL_NFC_APPAREL_ROADMAP.md).

## 🚀 Core Principles
- **All Local**: No data leaves your device. 
- **Open Source**: MIT licensed (see [LICENSE](LICENSE); **Space-Time** brand assets are reserved — see Legal below).
- **Cross-Platform**: Desktop (Windows/MacOS), Web, and XR (VR/AR)
- **WebXR Ready**: Full VR/AR support with floor anchoring and pass-through modes

## 🧩 Supported 3DAIGC Modules

Task types in the **New Task** panel (`TaskManager.jsx`), backed by [3DAIGC-API](https://github.com/AlfaOmegaGrafx/3DAIGC-API) on DGX Spark (`:7842`). Live model list: `GET /api/v1/system/models` — mirrored in [`src/library/aiModelsCatalog.js`](src/library/aiModelsCatalog.js).

| Task | API feature | Example models (DGX, Jun 2026) |
|------|-------------|--------------------------------|
| Text to 3D | `text_to_textured_mesh` | TRELLIS |
| Image to 3D | `image_to_textured_mesh` | **TRELLIS.2** (recommended), Pixal3D (PBR), Hunyuan3D-2.1 |
| Image to Raw Mesh | `image_to_raw_mesh` | Hunyuan3D-2.1, UltraShape |
| Mesh painting (text / image) | `text_mesh_painting` / `image_mesh_painting` | TRELLIS.2, Hunyuan |
| Mesh segmentation | `mesh_segmentation` | P3-SAM |
| Mesh retopology | `mesh_retopology` | Instant Meshes |
| Mesh UV unwrapping | `uv_unwrapping` | xatlas |
| Mesh editing (text / image) | `text_mesh_editing` / `image_mesh_editing` | VoxHammer |
| Auto rigging | `auto_rig` | **SkinTokens** (full GLB, recommended), UniRig (template VRM) |
| Image to Gaussian Splat | `image_to_splat` | TripoSplat (1 photo), WorldMirror 2.0 (2+), COLMAP (3+) |
| Image to World | `image_to_world` | `opennexus_image_to_world` (splat env + optional TRELLIS.2 props) |
| Avatar from Image | client pipeline | TRELLIS.2 mesh → UniRig template rig → GLB |
| Avatar From Photo | client only | AvatarSDK (not 3DAIGC-API) |

**Also shipped (client + API):**

- **Multi-image input** — primary + up to 7 reference photos on splat, world, and avatar tasks ([`docs/MULTI_IMAGE_SPLAT_ROADMAP.md`](docs/MULTI_IMAGE_SPLAT_ROADMAP.md))
- **Publish RP1 / OMB validate** — mesh jobs → spatial fabric via MSF Map Service ([`docs/SPATIAL_FABRIC_INTEGRATION.md`](docs/SPATIAL_FABRIC_INTEGRATION.md))
- **Job handoff** — chain completed jobs into rig, world, or export (`jobHandoff.js`)

**Not in UI:** “Part completion” (legacy upstream docs only). **License-blocked** on commercial tiers: PartField, PartPacker, FastMesh — see [3DAIGC-API `MODEL_LICENSES.md`](https://github.com/AlfaOmegaGrafx/3DAIGC-API/blob/main/docs/MODEL_LICENSES.md).

## Gaussian splats (3DGS)

Gaussian splats live in **this app** — same `SceneManager` viewport as VRM and mesh workflows, not a separate product. **Generation** runs on DGX via [3DAIGC-API](https://github.com/AlfaOmegaGrafx/3DAIGC-API); **viewing** uses [Spark.js](https://sparkjs.dev/) (`sparkSplatManager.js`, `@sparkjsdev/spark`) in the main Three.js scene.

### Shipped today

| Capability | Client | API (DGX) |
|------------|--------|-----------|
| Splat preview in viewport | `SplatMesh` alongside VRM/meshes | `POST /api/v1/splat-generation/image-to-splat` |
| **1 photo** → splat | Task Manager multi-select (primary photo) | **TripoSplat** |
| **2+ photos** → splat | Same; mark best front view as **Primary** | **WorldMirror 2.0** (COLMAP fallback at 3+) |
| World package load | **World Library** + `worldSceneLoader.js` | `POST /api/v1/world-generation/image-to-world` (`opennexus_image_to_world`) |
| Avatar + optional splat | **Avatar from Image** + “Gaussian splat preview” checkbox | TRELLIS.2 mesh + UniRig template rig + optional TripoSplat |
| Multi-image uploads | `multiImageInput.js` on splat / world / avatar tasks | `image_file_id` + `reference_image_file_ids` (up to 8 total) |

Task types: **Image to Gaussian Splat**, **Image to World (splat + props)** in the New Task panel (`TaskManager.jsx`).

### What's not done yet

- **Splat-only world RP1** — World Library **RP1** needs mesh props in the manifest; pure Gaussian environments need a prop-generation path for OMB publish
- **Gaussian-VRM / RGBAvatar body pipelines** — scan-based full-body avatars and highest-fidelity head attachment; separate from viewport TripoSplat preview (not the same code path as `image-to-splat`).

### Where it lives (architecture)

```text
[DGX 3DAIGC-API]  TripoSplat, WorldMirror/COLMAP, image-to-world, avatar mesh/rig jobs
       ↓
[OpenNexus3DStudio /]  SceneManager — one renderer, one WebXR session, VRM + tools
       ↓                  SparkRenderer + SplatMesh in the same scene as avatars
[OMB / RP1 publish]    spatial-fabric validate + MSF Scene Assembler (mesh props)
```

`/xr` remains an **IWSDK lab** for grab/locomotion regression; the **main app** (`/`) runs IWSDK Option A on SceneManager — distance/proximity grab (trigger), grip → context menu / pan, thumbstick locomotion — alongside loaded splat worlds and VRM.

**Further reading**

- [Multi-image splat & avatar roadmap](docs/MULTI_IMAGE_SPLAT_ROADMAP.md) — 1 vs 2–8 photo routing
- [NVIDIA XR AI + 3DAIGC (DGX)](docs/NVIDIA_XR_AI_INTEGRATION.md) — voice VLM → mesh jobs on Galaxy XR
- [Dev machine topology](docs/DEV_MACHINE_TOPOLOGY.md) — Surface + DGX Spark roles, incremental sync, Galaxy XR URLs
- [World package format](docs/WORLD_PACKAGE.md) — splats, props, Redis rehydrate for image-to-world jobs
- [Spatial fabric / RP1](docs/SPATIAL_FABRIC_INTEGRATION.md) — Task Manager vs World Library publish
- [Phygital NFC roadmap](docs/PHYGITAL_NFC_APPAREL_ROADMAP.md) — mock `/verify/:serialId` (Phase 0)
- [Avatar pipeline (client)](docs/AVATAR_PIPELINE.md) — avatar-from-image, optional splat preview, Arc2Avatar direction
- [Avatar pipeline (API)](https://github.com/AlfaOmegaGrafx/3DAIGC-API/blob/main/docs/AVATAR_PIPELINE.md) — endpoints, template rig, splat-generation
- [IWSDK Option A Migration Blueprint](docs/IWSDK_OPTION_A_MIGRATION_BLUEPRINT.md) — Spark + world package stack, XR world building order

## ✨ Applications Features

### Open3DStudio Features
- Multiple rendering modes (Solid/Rendered/WireFrame/Skeleton/PartColorize)
- Task management with progress and history
- Multi-format support: GLB, GLTF, OBJ, FBX, VRM, DAE, STL
- File uploading: uploading images / meshes for later processing
- Basic 3D model viewing and manipulation
- All locally deployed, it's scalable and easy to add a feature/model both at the frontend and backend

### OpenNexus3DStudio Features
- **WebXR Support**: Full VR/AR experiences with floor anchoring (main app via `SceneManager`)
  - VR mode with virtual sky backgrounds
  - AR mode with pass-through transparency
  - **Samsung Galaxy XR** (Chrome WebXR) as primary on-device XR target
  - Floor-aligned reference spaces for proper positioning
  - **WebXR expression tracking** when the browser exposes `expression-tracking` (VRM blink / mouth)
  - **Native face relay** when it does not — companion APK + dev-server ingest (see [OpenXR face tracking](docs/OPENXR_FACE_TRACKING_ANDROID_XR.md))
- **IWSDK immersive lab** (`/xr`): Meta [Immersive Web SDK](https://iwsdk.dev/) route for locomotion, grab, and spatial interaction experiments — separate from main VRM authoring; validated on **Galaxy XR** at `https://<your-PC-LAN-IP>:3000/xr` ([integration guide](docs/IWSDK_INTEGRATION.md))
- **Gaussian splats (3DGS)**: Spark.js splat rendering in the main viewport (`SceneManager`); TripoSplat, WorldMirror, COLMAP, and world packages from **3DAIGC-API**; **WebXR grab + locomotion on `/`** (distance/proximity grab, thumbstick move/turn) with worlds + VRM in one session — see [Gaussian splats (3DGS)](#gaussian-splats-3dgs)
- **Spatial fabric (RP1 / OMB)**: **Publish RP1** on completed mesh tasks; **Validate OMB tier** on GLB export; explore in Open Metaverse Browser–compatible fabrics — [`docs/SPATIAL_FABRIC_INTEGRATION.md`](docs/SPATIAL_FABRIC_INTEGRATION.md)
- **XR AI panel**: `XrAiPanel` + `xrHubConfig.js` — in-app hub status and handoff to DGX **xr-ai** / MCP (parallel to voice-only stack)
- **WebGPU Rendering**: Automatic WebGPU detection with WebGL fallback
- **Advanced Post-Processing**: SSAO (Screen Space Ambient Occlusion), Bloom effects, FXAA anti-aliasing
- **Spatial Audio**: PositionalAudio support for immersive audio experiences
- **Core3D Integration**: Access to thousands of 3D models, materials library, AI-powered design generation
- **Shared 3D Viewer**: Unified viewing system for OpenNexus3DStudio
- **Universal3DViewer**: Smart wrapper that auto-detects application mode
- **Blockchain Integration**: x402 protocol micropayments, Thirdweb wallet support, Base network
- Enhanced rendering and performance optimizations
- All Open3DStudio features included

### OpenNexus3DStudio Avatar & VRM Features
- **VRM Character Creation**: Create and customize VRM avatars with trait-based system
- **Avatar Structure**: Base body VRM avatar is **soulbound** (non-transferable); clothing, hair, and accessories are equippable layers (see [Modder getting-started](docs/docs/Modders/getting-started.md)—base body layer 0)
- **Trait System**: Mix and match character components (body, clothing, hair, accessories, etc.)
- **Drag & Drop Customization**: Overwrite textures and models by dragging files into the browser
- **Animation Support**: Full animation system with Mixamo integration, bone remapping, and animation blending
- **Facial Expressions**: Blend shapes, lip sync, eye tracking, and automatic blinking
- **VRM Export**: Optimized VRM export with texture atlasing and mesh merging
- **Batch Processing**: Generate multiple VRMs from manifest.json files
- **Manifest-Driven Workflows**: Programmatic avatar assembly using JSON configuration
- **Wallet-Driven Assembly** (planned): Configure avatars and wearables from owned wallet assets; see [Wallet-Owned Assets Approach](docs/WALLET_OWNED_ASSETS_AVATAR_APPROACH.md)
- **Character Optimization**: One-click optimization reducing models to single draw calls
- **Model Bridge**: Seamless import/export between Core3D designs and avatar/VRM workflows

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- For desktop apps: Electron will be installed automatically

### Installation

```bash
# Clone the repository
git clone https://github.com/AlfaOmegaGrafx/OpenNexus3DStudio.git
cd OpenNexus3DStudio

# Install dependencies
npm install
```

### Development

```bash
# Web development (Vite, port 3000 — use this for Galaxy XR headset testing)
npm run dev
# https://localhost:3000  (main app)
# https://<your-PC-LAN-IP>:3000/xr  (IWSDK immersive lab on headset)

# Optional: IWSDK PC emulator stack (localhost smoke tests only — not a substitute for headset)
npm run dev:iwsdk

# Optional: MSF + XR hub proxies for Galaxy XR LAN testing (with DGX xr-ai / MSF_Map_Svc)
npm run dev:spark-proxies

# Desktop development mode
npm run electron-dev
# Electron app launches automatically
```

### Surface + DGX Spark (two-machine dev)

Typical setup: **Surface** runs `npm run dev` and Galaxy XR tests; **DGX Spark** runs 3DAIGC-API and optional Cursor Remote SSH. Files are copied over SSH (`scp`), not GitHub — **only one machine should edit `src/` at a time** or work can be overwritten.

**Sync cheat sheet:** [Dev machine topology — Surface ↔ DGX sync](docs/DEV_MACHINE_TOPOLOGY.md#surface--dgx-sync-cheat-sheet) (incremental `-Paths`, lock file, ownership table).

### WebXR Development (HTTPS Required)

WebXR (VR/AR) requires HTTPS to work. For local development:

1. **Quick Setup with mkcert** (Recommended):
   ```bash
   # Install mkcert (if not already installed)
   # Windows: choco install mkcert
   # macOS: brew install mkcert
   
   # Install local CA
   mkcert -install
   
   # Generate certificates
   mkcert localhost 127.0.0.1 ::1
   
   # Move to certs directory
   mkdir certs
   mv localhost+2.pem certs/localhost.pem
   mv localhost+2-key.pem certs/localhost-key.pem
   ```

2. **Or use the setup script**:
   ```bash
   npm run setup-https
   ```

3. **Access via HTTPS**:
   - `https://localhost:3000` — main OpenNexus3DStudio app (PC)
   | URL | Use on Galaxy XR |
   |-----|------------------|
   | `https://YOUR_IP:3000/` | **Main app** — VRM authoring, SceneManager AR/VR, **native face relay** |
   | `https://YOUR_IP:3000/?remoteLog=1&nativeFaceRelay=1` | Same + remote logs + face relay HUD (dev) |
   | `https://YOUR_IP:3000/xr` | **IWSDK lab only** — grab/locomotion demo cube; **no VRM face relay** |

   Run `npm run dev` in **one terminal only** so the server uses port 3000. If the port is in use, the dev server will exit instead of using 3001, 3002, etc.

**Galaxy XR tips:** Use **https** (not http). Add your PC LAN IP to the cert (e.g. `mkcert localhost 127.0.0.1 10.0.0.32`). On `/xr`, do a **full page reload** before Enter VR (hot reload can drop the XR session). Headset console output is forwarded to `logs/remote-log.txt` in dev (`?remoteLog=1` or APK “Open in Chrome” adds it). See [HTTPS setup](docs/HTTPS_SETUP.md) and [IWSDK integration](docs/IWSDK_INTEGRATION.md).

**Face tracking on Galaxy XR:** Use the **main app** (`/`), not `/xr`. If Chrome does not grant WebXR expression APIs, install the [**OpenNexus XR Face** APK](native/android-xr-face-bridge/README.md), run `npm run dev`, open **⋮ → Open in Chrome for WebXR (+ face)** — [OpenXR / Android XR face docs](docs/OPENXR_FACE_TRACKING_ANDROID_XR.md). APK currently uses **Jetpack XR only** (`OPENXR_ENABLED=false`); OpenXR face is preserved for a future runtime.

### Building

```bash
# Build the web app
npm run build

# Build desktop applications
npm run dist-mac    # macOS
npm run dist-win    # Windows
npm run dist-linux  # Linux
```

### API Backend Setup

1. Clone and setup the [3DAIGC-API](https://github.com/AlfaOmegaGrafx/3DAIGC-API) backend (Spacetime fork on **DGX Spark**, default port **`:7842`**)
2. Start the API server (`scripts/run_server.sh` on DGX; requires Redis)
3. Point OpenNexus3DStudio at the API:
   - **Direct:** `VITE_API_ENDPOINT=http://<api-host>:7842` in `.env`
   - **Surface HTTPS dev (recommended):** `VITE_API_ENDPOINT=/__dev_dgx_proxy` — Vite proxies to DGX (see [Dev machine topology](docs/DEV_MACHINE_TOPOLOGY.md))
4. Confirm models: `curl http://<api-host>:7842/api/v1/system/models` — should list **22** enabled models across **13** features (Jun 2026)

### OpenNexus3DStudio Asset Setup

OpenNexus3DStudio requires asset packs for avatar traits. You can:

1. **Use default assets**: Run `npm run get-assets` to clone required loot-assets from GitHub
2. **Add custom assets**: Copy your asset packs to the `public/` folder
3. **Configure asset path**: Set `VITE_ASSET_PATH` in `.env` to point to your assets (local path or remote URL)

## 🏗️ Architecture

### Frontend
- **React 19** with modern hooks
- **Three.js** for 3D rendering with WebGPU support
- **WebXR** for VR/AR experiences
- **Zustand** for state management
- **Vite** for fast development and building
- **Electron** for desktop applications
- **Thirdweb** for blockchain integration and wallet management

### Key Components

#### Open3DStudio Components
- `Scene3D`: Main 3D viewport with Three.js integration
- `TaskManager`: Handles AI generation tasks and progress tracking
- `FileUpload`: Drag & drop file upload with format validation
- `RenderModeSelector`: Switch between different rendering modes
- `APIStatus`: Monitor API connection and configure endpoints
- `SceneManager`: Core 3D scene orchestration (WebGL-based)

#### OpenNexus3DStudio Components
- `SceneManager`: Enhanced with WebGPU, WebXR, and post-processing support
- `Shared3DViewer`: Unified 3D viewer for both applications
- `Universal3DViewer`: Smart wrapper that auto-detects application mode
- `Core3DViewer`: Core3D design workflow integration
- `Core3DPanel`: Core3D API integration UI
- `Core3DContext`: Core3D state management
- `Core3DService`: Core3D API communication
- All Open3DStudio components with enhanced capabilities

#### OpenNexus3DStudio Avatar Components
- `CharacterManager`: Core character management with VRM support
- `OpenNexus3DStudioBridge`: Legacy bridge class for GLB import into avatar workflows (internal API name)
- Uses `Shared3DViewer` and `Universal3DViewer` (developed by OpenNexus3DStudio)
- `AnimationManager`: Handles character animations and bone remapping
- `BlinkManager`: Automatic eye blinking system
- `LookAtManager`: Eye tracking and head movement
- `EmotionManager`: Facial expression and blend shape management

### State Management
- `taskStore`: Manages AI generation tasks, progress, and history
- `sceneStore`: Handles 3D scene state, models, and rendering modes
- `SceneContext`: 3D scene and rendering state with SceneManager integration
- `Core3DContext`: Core3D API integration for design workflows

## 🎨 Features

### Open3DStudio Features
- **3D Rendering Modes**: Solid, Rendered, Wireframe, Skeleton, Part Colorize
- **File Support**: GLB, GLTF, OBJ, FBX, DAE, STL, VRM formats
- **Images**: JPG, PNG, BMP, TGA (for image-to-3D workflows)
- **AI Workflows**: Text-to-3D, Image-to-3D, Image-to-Raw-Mesh, Mesh Painting, Segmentation, Retopology, UV Unwrapping, VoxHammer Editing, Auto Rigging, Image-to-Splat, Image-to-World, Avatar-from-Image

### OpenNexus3DStudio Features
- **WebXR Features**:
  - **VR Mode**: Immersive virtual reality with floor-anchored content
  - **AR Mode**: Augmented reality with pass-through transparency
  - **Floor Anchoring**: Automatic model positioning at floor level
  - **Reference Spaces**: Support for `bounded-floor`, `local-floor`, `local`, and `viewer` spaces
  - **Android XR**: Optimized for Samsung Galaxy XR and other Android XR devices
  - **Background Management**: Virtual sky for VR, transparent pass-through for AR
- **WebGPU Rendering**: Automatic WebGPU detection with WebGL fallback
- **Advanced Post-Processing**: SSAO, Bloom effects, FXAA anti-aliasing
- **Spatial Audio**: PositionalAudio support for immersive audio experiences
- **Core3D Integration**: 
  - Access to thousands of 3D models
  - Advanced material and texture library
  - AI-powered design generation
  - High-quality model exports
- **Blockchain & Payments**:
  - **x402 Protocol**: Micropayment support for AI services
  - **Thirdweb Integration**: Multi-chain wallet support (170+ EVM chains + Solana)
  - **Base Network**: Native Base mainnet and testnet support
  - **Smart Wallets**: ERC-4337 Account Abstraction support
  - **In-App Wallets**: Email, social, phone, and passkey authentication
- All Open3DStudio features included

## 🔧 Configuration

### API Endpoint
The application connects to a 3DAIGC-API backend. You can configure the endpoint in the API Status panel or by setting the `VITE_API_ENDPOINT` environment variable.

### Environment Variables
```env
# API Configuration (DGX Spark default :7842; Surface dev often uses /__dev_dgx_proxy)
VITE_API_ENDPOINT=/__dev_dgx_proxy

# AvatarSDK (photo -> avatar)
# For production, route OAuth through backend if possible.
VITE_AVATARSDK_CLIENT_ID=<avatarsdk_client_id>
VITE_AVATARSDK_CLIENT_SECRET=<avatarsdk_client_secret>
VITE_AVATARSDK_PLAYER_UID=<optional_per_user_or_device_uuid>
VITE_AVATARSDK_PIPELINE=metaperson_2.0
VITE_AVATARSDK_PIPELINE_SUBTYPE=male

# Thirdweb Configuration (for blockchain features)
VITE_THIRDWEB_CLIENT_ID=your_thirdweb_client_id
VITE_THIRDWEB_SECRET_KEY=your_secret_key

# Base x402 Configuration (when SDK is available)
VITE_BASE_X402_API_KEY=your_base_api_key
```

### AvatarSDK Integration
- A new AI task type is available in the task panel: `Avatar From Photo (AvatarSDK)`.
- Choose that task type, upload a face photo, and run it like any other task.
- The app creates an avatar, polls completion, polls export completion, and exposes the returned export file URL as `modelUrl`/`downloadUrl`.

### Electron Configuration
Desktop applications are configured in `package.json` under the `build` section. The main process is in `public/electron.js`.

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 📦 Deployment

### Web Deployment
```bash
npm run build
# Deploy the 'build' folder to your hosting service
```

### Desktop Distribution
```bash
# Build for current platform
npm run dist-mac    # macOS
npm run dist-win    # Windows  
npm run dist-linux  # Linux
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📋 Roadmap Alignment

This README reflects the current project structure. Public technical docs live under `docs/` (see **Additional Documentation** below). Copy `.env.example` to `.env` for local configuration — never commit `.env`.

- **[History & Roadmap](docs/docs/history.md)**: Connect wallet to load profiles or mint files; AI personality for VRM; optional profiles/personality from user‑controlled personal data exports; integration with external 3D launchpads for minting avatars and wearables; **[moeChat](https://github.com/moeru-ai/chat)** ([demo](https://chat.moeru.ai/)) as **default** companion runtime for “talk to your VRM” (WebXR); **optional [AIRI](https://github.com/AlfaOmegaGrafx/airi)** — export/handoff only, not merged into this repo
- **[Wallet-Owned Assets Approach](docs/WALLET_OWNED_ASSETS_AVATAR_APPROACH.md)**: Programmatic avatar/wearables from connected wallet (RMRK EVM, Thirdweb); soulbound base body + equippable wearables

OpenNexus3DStudio’s avatar model: **soulbound base body** (layer 0, non-transferable) with **equippable** clothing, hair, and accessories—supporting wallet-driven assembly when implemented.

## 📚 Additional Documentation

### Open3DStudio Documentation
Open3DStudio was the original foundation of this project, providing core 3D AIGC capabilities with WebGL rendering. The [Three.js WebGPU & WebXR Migration Guide](docs/THREEJS_WEBGPU_WEBXR_MIGRATION.md) documents the evolution from Open3DStudio's WebGL-only SceneManager to OpenNexus3DStudio's enhanced rendering stack. Open3DStudio features include:
- Basic 3D AIGC workflows and model processing
- WebGL-based rendering
- File format support and import/export capabilities
- Task management and progress tracking

### OpenNexus3DStudio Documentation
- [Spatial fabric / RP1](docs/SPATIAL_FABRIC_INTEGRATION.md) - Publish to OMB-compatible spatial fabric
- [Multi-image splat roadmap](docs/MULTI_IMAGE_SPLAT_ROADMAP.md) - Primary + reference photos for splat/avatar
- [Avatar pipeline (client)](docs/AVATAR_PIPELINE.md) - Photo → rigged GLB/VRM, optional splat preview, key client files
- [IWSDK Option A Migration Blueprint](docs/IWSDK_OPTION_A_MIGRATION_BLUEPRINT.md) - IWSDK → main app migration; Spark world building stack
- [IWSDK Integration](docs/IWSDK_INTEGRATION.md) - Meta Immersive Web SDK (`/xr` route, Galaxy XR testing, optional PC emulator)
- [OpenXR Face Tracking (Android XR)](docs/OPENXR_FACE_TRACKING_ANDROID_XR.md) - Native face relay when Chrome lacks expression-tracking
- [Android XR Face Bridge APK](native/android-xr-face-bridge/README.md) - Companion app build and Chrome handoff
- [Webcam / Avatar Control](docs/WEBCAM_AVATAR_CONTROL.md) - Desktop webcam + XR expression paths
- [WebXR Floor Anchoring & Backgrounds](docs/XR_MODE_FLOOR_ANCHORING_AND_BACKGROUNDS.md) - XR implementation details
- [HTTPS Setup Guide](docs/HTTPS_SETUP.md) - WebXR development setup
- [Dev machine topology & sync cheat sheet](docs/DEV_MACHINE_TOPOLOGY.md) - Surface vs DGX roles, incremental sync, cross-sync prevention
- [Three.js WebGPU & WebXR Migration](docs/THREEJS_WEBGPU_WEBXR_MIGRATION.md) - Technical migration guide
- [x402 & Thirdweb Integration](src/library/README_X402_INTEGRATION.md) - Blockchain integration details
- [VR Positioning](docs/VR_POSITIONING.md) - VR positioning configuration
- [AR Floor Anchoring Fix](docs/AR_FLOOR_ANCHORING_FIX.md) - AR implementation details
- [Android XR Floor Anchoring](docs/ANDROID_XR_FLOOR_ANCHORING.md) - Android XR compatibility
- [Shared 3D Viewer System](src/components/Shared3DViewer_README.md) - Unified viewer documentation
- [Core3D Integration](src/components/Core3D_README.md) - Core3D API integration guide

### Avatar & modder documentation (OpenNexus3DStudio)
- [Quickstart](docs/docs/quickstart.md) - Getting started with avatar traits and VRM
- [Create an Avatar](docs/docs/General/create-an-avatar.md) - Avatar creation guide (includes programmatic/wallet-driven goals)
- [Optimize Avatars](docs/docs/General/optimize-avatars.md) - Avatar optimization guide
- [Wallet-Owned Assets Approach](docs/WALLET_OWNED_ASSETS_AVATAR_APPROACH.md) - Configure avatars from connected wallet (RMRK EVM, Thirdweb)
- [Model Format Specification](docs/model-format-specification.md) - Format compatibility between applications
- [Modder Documentation](docs/docs/Modders/getting-started.md) - Guide for custom assets and manifests (base body = layer 0, soulbound)
- [Developer Documentation](docs/docs/Developers/overview.md) - API and architecture documentation
- [History & Roadmap](docs/docs/history.md) - Project history and roadmap (wallet load profiles, mint files, AI personality)

## 📄 License

**OpenNexus3DStudio: SPACE-TIME EDITION** is licensed under the [MIT License](LICENSE). The code maintains continuity with the original Open3DStudio project while evolving as a unified 3D AIGC + avatar platform.

## 🙏 Acknowledgments

- [Three.js](https://threejs.org/) for 3D rendering
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) for VRM model support
- [3DAIGC-API](https://github.com/AlfaOmegaGrafx/3DAIGC-API) for the backend API
- [TripoStudio](https://studio.tripo3d.ai/) for inspiration
- [Minimal3DStudio](https://github.com/FishWoWater/Minimal3DStudio) for the foundation
- [M3-org](https://github.com/M3-org) for the upstream avatar-trait foundation and inspiration
- [Character Studio](https://github.com/M3-org/CharacterStudio) (M3-org, MIT) — upstream open-source avatar toolkit this project evolved from

## Legal & Trademark Information

### Software Licensing
The underlying source code of OpenNexus3DStudio is licensed under the [MIT License](LICENSE).

### Trademark & Brand Asset Reservation
The names **"Space-Time"**, **"OpenNexus3DStudio"**, the "Space-Time" orbital clock logo artwork, and all associated apparel designs, product names, graphics, and phygital concept assets are proprietary intellectual property.

* **No Trademark License:** The open-source license applied to the source code **does not** grant any rights, implied or explicit, to use the "Space-Time" brand name, logo, or trade dress for commercial or non-commercial redistributions.
* **Modification Requirement:** If you fork this repository or modify the code to distribute your own software or services, you **must** remove all "Space-Time" branding, logos, and references, and rebrand your version entirely under a unique name.
