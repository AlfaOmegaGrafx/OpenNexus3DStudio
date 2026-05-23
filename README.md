# OpenNexus3DStudio: SPACE-TIME EDITION

[![Apache2.0 License](https://img.shields.io/badge/license-Apache2.0-green.svg)](LICENSE)
[![Cross-Platform](https://img.shields.io/badge/platform-MacOS%20%7C%20Windows%20%7C%20Web%20%7C%20XR-blue)](#)

**OpenNexus3DStudio: SPACE-TIME EDITION** is a unified 3D AIGC application with advanced WebXR support that combines **Open3DStudio**, **OpenNexus3DStudio**, and **Character Studio** into a single platform. It works closely with the [3DAIGC-API](https://github.com/FishWoWater/3DAIGC-API) to provide **completely locally deployed** and **free** 3DAIGC workflows. Basically it's an advanced version of the **[Minimal3DStudio](https://github.com/FishWoWater/Minimal3DStudio)** and much like a **replicate of [TripoStudio](https://studio.tripo3d.ai/home?lng=en)**.

**Project Evolution**: The project started as **Open3DStudio** with basic 3D AIGC capabilities, evolved into **OpenNexus3DStudio** with WebXR, WebGPU, and advanced blockchain features, and now includes **Character Studio** for comprehensive VRM character creation and management.

**Goals & structure**: The [roadmap](docs/docs/history.md#roadmap) includes connecting wallet to load profiles or mint files and AI personality features. Character Studio is planned with a **soulbound base body** VRM (non-transferable) and **equippable** wearables/traits; programmatic avatar configuration from owned wallet assets is in progress (see [Create an Avatar](docs/docs/General/create-an-avatar.md#configure-programmatically) and [Wallet-Owned Assets Approach](docs/WALLET_OWNED_ASSETS_AVATAR_APPROACH.md)). Technical and product roadmaps are detailed in the docs (e.g. [Technical Roadmap: RPM Migration](docs/TECHNICAL_ROADMAP_RPM_MIGRATION.md)).

The supported workflows include text-to-3d, image-to-3d, mesh segmentation, texture generation, auto-rigging, part completion, VRM model optimization, and more. **Character Studio** provides advanced VRM character creation, customization, animation, and management capabilities.

## Demo 
You can have a try on [Vercel Deployment](https://opennexus3dstudio-n5hap1p9y-fishwowaters-projects.vercel.app) or download the shipped applications from [Releases](https://github.com/FishWoWater/OpenNexus3DStudio/releases).

Notice that you need to deploy the API backend on your own machine or server, or try my API endpoint: [http://i-2.gpushare.com:42180](http://i-2.gpushare.com:42180) (it's deployed on a single 3060Ti and ONLY enables the mesh segmentation feature).

## 🚀 Core Principles
- **All Local**: No data leaves your device. 
- **Open Source**: Apache2.0 licensed.
- **Cross-Platform**: Desktop (Windows/MacOS), Web, and XR (VR/AR)
- **WebXR Ready**: Full VR/AR support with floor anchoring and pass-through modes

## 🧩 Supported 3DAIGC Modules
* Mesh Generation: text / image conditioned
* Mesh Painting: text / image conditioned 
* Mesh Segmentation
* Part Completion
* Auto Rigging

The available models are up to the API backend, refer to [3DAIGC-API](https://github.com/FishWoWater/3DAIGC-API) for the example model matrix

## ✨ Applications Features

### Open3DStudio Features
- Multiple rendering modes (Solid/Rendered/WireFrame/Skeleton/PartColorize)
- Task management with progress and history
- Multi-format support: GLB, GLTF, OBJ, FBX, VRM, DAE, STL
- File uploading: uploading images / meshes for later processing
- Basic 3D model viewing and manipulation
- All locally deployed, it's scalable and easy to add a feature/model both at the frontend and backend

### OpenNexus3DStudio Features
- **WebXR Support**: Full VR/AR experiences with floor anchoring
  - VR mode with virtual sky backgrounds
  - AR mode with pass-through transparency
  - Android XR compatibility (Samsung Galaxy XR)
  - Floor-aligned reference spaces for proper positioning
- **WebGPU Rendering**: Automatic WebGPU detection with WebGL fallback
- **Advanced Post-Processing**: SSAO (Screen Space Ambient Occlusion), Bloom effects, FXAA anti-aliasing
- **Spatial Audio**: PositionalAudio support for immersive audio experiences
- **Core3D Integration**: Access to thousands of 3D models, materials library, AI-powered design generation
- **Shared 3D Viewer**: Unified viewing system shared with Character Studio
- **Universal3DViewer**: Smart wrapper that auto-detects application mode
- **Blockchain Integration**: x402 protocol micropayments, Thirdweb wallet support, Base network
- Enhanced rendering and performance optimizations
- All Open3DStudio features included

### Character Studio Features
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
- **Model Bridge**: Seamless import/export between OpenNexus3DStudio and Character Studio formats

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- For desktop apps: Electron will be installed automatically

### Installation

```bash
# Clone the repository
git clone https://github.com/FishWoWater/OpenNexus3DStudio.git
cd OpenNexus3DStudio

# Install dependencies
npm install
```

### Development

```bash
# Web development mode 
npm run dev
# Open [http://localhost:3000](http://localhost:3000)

# Desktop development mode
npm run electron-dev
# Electron app launches automatically
```

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
   - `https://localhost:3000` (for local testing)
   - `https://YOUR_IP:3000` (for XR device access, e.g. Galaxy XR)

   Run `npm run dev` in **one terminal only** so the server uses port 3000. If the port is in use, the dev server will exit instead of using 3001, 3002, etc.

**XR not working on Galaxy XR?** Use **https** (not http). The dev server serves HTTPS when certs exist in `certs/`. Add your machine's IP to the cert (e.g. `mkcert localhost 127.0.0.1 10.0.0.32`) so the headset trusts it. See [docs/HTTPS_SETUP.md](docs/HTTPS_SETUP.md).

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

1. Clone and setup the [3DAIGC-API](https://github.com/FishWoWater/3DAIGC-API) backend
2. Start the API server (usually on port 8000)
3. Update the API endpoint in OpenNexus3DStudio if needed

### Character Studio Asset Setup

Character Studio requires asset packs to function. You can:

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

#### Character Studio Components
- `CharacterManager`: Core character management with VRM support
- `CharacterStudioBridge`: Bridge for importing OpenNexus3DStudio models into Character Studio
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
- **AI Workflows**: Text-to-3D, Image-to-3D, Mesh Painting, Mesh Segmentation, Part Completion, Auto Rigging

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
# API Configuration
VITE_API_ENDPOINT=<your-api-server-url>

# AvatarSDK (photo -> avatar)
# For production, route OAuth through backend if possible.
VITE_AVATARSDK_CLIENT_ID=<avatarsdk_client_id>
VITE_AVATARSDK_CLIENT_SECRET=<avatarsdk_client_secret>
VITE_AVATARSDK_PLAYER_UID=<optional_per_user_or_device_uuid>
VITE_AVATARSDK_PIPELINE=metaperson_2.0
VITE_AVATARSDK_PIPELINE_SUBTYPE=male

# Thirdweb Configuration (for blockchain features)
VITE_THIRDWEB_CLIENT_ID=your_thirdweb_client_id
VITE_THIRDWEB_SECRET_KEY=your_thirdweb_secret_key

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

This README reflects the current project structure and aligns with the documented roadmaps:

- **[History & Roadmap](docs/docs/history.md)**: Connect wallet to load profiles or mint files; AI personality for VRM; optional profiles/personality from user‑controlled personal data exports; integration with external 3D launchpads for minting avatars and wearables; **[moeChat](https://github.com/moeru-ai/chat)** ([demo](https://chat.moeru.ai/)) as **default** companion runtime for “talk to your VRM” (WebXR); **optional [AIRI](https://github.com/AlfaOmegaGrafx/airi)** — export/handoff only, not merged into this repo
- **[Monetization Roadmap](MONETIZATION_ROADMAP.md)**: Revenue streams (x402, SaaS tiers, NFT marketplace) including **§11** personalized AI (DataConnect → Character Studio → 3DAIGC-API), **3d-anvil** launchpad economics, **moeChat-first** companion handoff + optional **AIRI** (v **3.2.7**)
- **[Wallet-Owned Assets Approach](docs/WALLET_OWNED_ASSETS_AVATAR_APPROACH.md)**: Programmatic avatar/wearables from connected wallet (RMRK EVM, Thirdweb); soulbound base body + equippable wearables
- **[Technical Roadmap: RPM Migration](docs/TECHNICAL_ROADMAP_RPM_MIGRATION.md)**: Ready Player Me migration opportunity (avatar API, GLB export, SDKs)

Character Studio’s planned avatar model: **soulbound base body** (layer 0, non-transferable) with **equippable** clothing, hair, and accessories—supporting wallet-driven assembly when implemented.

## 📚 Additional Documentation

### Open3DStudio Documentation
Open3DStudio was the original foundation of this project, providing core 3D AIGC capabilities with WebGL rendering. The [Three.js WebGPU & WebXR Migration Guide](docs/THREEJS_WEBGPU_WEBXR_MIGRATION.md) documents the evolution from Open3DStudio's WebGL-only SceneManager to OpenNexus3DStudio's enhanced rendering stack. Open3DStudio features include:
- Basic 3D AIGC workflows and model processing
- WebGL-based rendering
- File format support and import/export capabilities
- Task management and progress tracking

### OpenNexus3DStudio Documentation
- [WebXR Floor Anchoring & Backgrounds](docs/XR_MODE_FLOOR_ANCHORING_AND_BACKGROUNDS.md) - XR implementation details
- [HTTPS Setup Guide](docs/HTTPS_SETUP.md) - WebXR development setup
- [Three.js WebGPU & WebXR Migration](docs/THREEJS_WEBGPU_WEBXR_MIGRATION.md) - Technical migration guide
- [x402 & Thirdweb Integration](INTEGRATION_SUMMARY.md) - Blockchain integration details
- [VR Positioning](docs/VR_POSITIONING.md) - VR positioning configuration
- [AR Floor Anchoring Fix](docs/AR_FLOOR_ANCHORING_FIX.md) - AR implementation details
- [Android XR Floor Anchoring](docs/ANDROID_XR_FLOOR_ANCHORING.md) - Android XR compatibility
- [Shared 3D Viewer System](src/components/Shared3DViewer_README.md) - Unified viewer documentation
- [Core3D Integration](src/components/Core3D_README.md) - Core3D API integration guide

### Character Studio Documentation
- [Character Studio Quickstart](docs/docs/quickstart.md) - Getting started with Character Studio
- [Create an Avatar](docs/docs/General/create-an-avatar.md) - Avatar creation guide (includes programmatic/wallet-driven goals)
- [Optimize Avatars](docs/docs/General/optimize-avatars.md) - Avatar optimization guide
- [Wallet-Owned Assets Approach](docs/WALLET_OWNED_ASSETS_AVATAR_APPROACH.md) - Configure avatars from connected wallet (RMRK EVM, Thirdweb)
- [Model Format Specification](docs/model-format-specification.md) - Format compatibility between applications
- [Modder Documentation](docs/docs/Modders/getting-started.md) - Guide for custom assets and manifests (base body = layer 0, soulbound)
- [Developer Documentation](docs/docs/Developers/overview.md) - API and architecture documentation
- [History & Roadmap](docs/docs/history.md) - Project history and roadmap (wallet load profiles, mint files, AI personality)
- [Monetization Roadmap](MONETIZATION_ROADMAP.md) - Spacetime revenue model (**§11**, x402, 3d-anvil, **moeChat-first** companion + optional **AIRI** v3.2.7+)

## 📄 License

**OpenNexus3DStudio** (including **Character Studio**) is licensed under [Apache2.0 License](LICENSE). The code and application maintain continuity with the original Open3DStudio project while evolving as OpenNexus3DStudio: SPACE-TIME EDITION, which now includes the integrated Character Studio functionality.

## 🙏 Acknowledgments

- [Three.js](https://threejs.org/) for 3D rendering
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) for VRM model support
- [3DAIGC-API](https://github.com/FishWoWater/3DAIGC-API) for the backend API
- [TripoStudio](https://studio.tripo3d.ai/) for inspiration
- [Minimal3DStudio](https://github.com/FishWoWater/Minimal3DStudio) for the foundation
- [M3-org](https://github.com/M3-org) for Character Studio foundation and inspiration
