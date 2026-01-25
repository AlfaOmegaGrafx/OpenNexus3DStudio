# OpenNexus3DStudio: SPACE-TIME EDITION

[![Apache2.0 License](https://img.shields.io/badge/license-Apache2.0-green.svg)](LICENSE)
[![Cross-Platform](https://img.shields.io/badge/platform-MacOS%20%7C%20Windows%20%7C%20Web%20%7C%20XR-blue)](#)

**OpenNexus3DStudio: SPACE-TIME EDITION** (also known as **Open3DStudio** in earlier versions) is a 3D AIGC application with advanced WebXR support. It works closely with the [3DAIGC-API](https://github.com/FishWoWater/3DAIGC-API) to provide **completely locally deployed** and **free** 3DAIGC workflows. Basically it's an advanced version of the **[Minimal3DStudio](https://github.com/FishWoWater/Minimal3DStudio)** and much like a **replicate of [TripoStudio](https://studio.tripo3d.ai/home?lng=en)**.

The supported workflows include text-to-3d, image-to-3d, mesh segmentation, texture generation, auto-rigging, part completion, VRM model optimization, and more.

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
- Multiple rendering modes (Solid/Rendered/WireFrame/Skeleton/PartColorize)
- Task management with progress and history
- Multi-format support: GLB, GLTF, OBJ, FBX, VRM, DAE, STL
- File uploading: uploading images / meshes for later processing
- **WebXR Support**: Full VR/AR experiences with floor anchoring
  - VR mode with virtual sky backgrounds
  - AR mode with pass-through transparency
  - Android XR compatibility (Samsung Galaxy XR)
  - Floor-aligned reference spaces for proper positioning
- **WebGPU Rendering**: Automatic WebGPU detection with WebGL fallback
- **Blockchain Integration**: x402 protocol micropayments, Thirdweb wallet support, Base network
- **VRM Model Support**: Advanced VRM character management with optimization
- All locally deployed, it's scalable and easy to add a feature/model both at the frontend and backend

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
   - `https://YOUR_IP:3000` (for XR device access)

See [docs/HTTPS_SETUP.md](docs/HTTPS_SETUP.md) for detailed instructions.

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
- `Scene3D`: Main 3D viewport with Three.js integration
- `TaskManager`: Handles AI generation tasks and progress tracking
- `FileUpload`: Drag & drop file upload with format validation
- `RenderModeSelector`: Switch between different rendering modes
- `APIStatus`: Monitor API connection and configure endpoints

### State Management
- `taskStore`: Manages AI generation tasks, progress, and history
- `sceneStore`: Handles 3D scene state, models, and rendering modes

## 🎨 Features

### 3D Rendering Modes
- **Solid**: Standard solid rendering
- **Rendered**: Realistic materials and lighting
- **Wireframe**: Wireframe visualization
- **Skeleton**: Transparent wireframe for structure analysis
- **Part Colorize**: Different colors for different mesh parts

### File Support
- **3D Models**: GLB, GLTF, OBJ, FBX, DAE, STL
- **Images**: JPG, PNG, BMP, TGA (for image-to-3D workflows)

### AI Workflows
- **Text-to-3D**: Generate 3D models from text descriptions
- **Image-to-3D**: Convert 2D images to 3D models
- **Mesh Painting**: Apply textures and materials to 3D models
- **Mesh Segmentation**: Segment 3D models into parts
- **Part Completion**: Complete missing parts of 3D models
- **Auto Rigging**: Automatically rig 3D models for animation

### WebXR Features
- **VR Mode**: Immersive virtual reality with floor-anchored content
- **AR Mode**: Augmented reality with pass-through transparency
- **Floor Anchoring**: Automatic model positioning at floor level
- **Reference Spaces**: Support for `bounded-floor`, `local-floor`, `local`, and `viewer` spaces
- **Android XR**: Optimized for Samsung Galaxy XR and other Android XR devices
- **Background Management**: Virtual sky for VR, transparent pass-through for AR

### Blockchain & Payments
- **x402 Protocol**: Micropayment support for AI services
- **Thirdweb Integration**: Multi-chain wallet support (170+ EVM chains + Solana)
- **Base Network**: Native Base mainnet and testnet support
- **Smart Wallets**: ERC-4337 Account Abstraction support
- **In-App Wallets**: Email, social, phone, and passkey authentication

## 🔧 Configuration

### API Endpoint
The application connects to a 3DAIGC-API backend. You can configure the endpoint in the API Status panel or by setting the `VITE_API_ENDPOINT` environment variable.

### Environment Variables
```env
# API Configuration
VITE_API_ENDPOINT=http://127.0.0.1:7842

# Thirdweb Configuration (for blockchain features)
VITE_THIRDWEB_CLIENT_ID=your_thirdweb_client_id
VITE_THIRDWEB_SECRET_KEY=your_thirdweb_secret_key

# Base x402 Configuration (when SDK is available)
VITE_BASE_X402_API_KEY=your_base_api_key
```

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

## 📚 Additional Documentation

- [WebXR Floor Anchoring & Backgrounds](docs/XR_MODE_FLOOR_ANCHORING_AND_BACKGROUNDS.md) - XR implementation details
- [HTTPS Setup Guide](docs/HTTPS_SETUP.md) - WebXR development setup
- [Three.js WebGPU & WebXR Migration](docs/THREEJS_WEBGPU_WEBXR_MIGRATION.md) - Technical migration guide
- [x402 & Thirdweb Integration](INTEGRATION_SUMMARY.md) - Blockchain integration details

## 📄 License

**OpenNexus3DStudio** is licensed under [Apache2.0 License](LICENSE). The code and application maintain continuity with the original Open3DStudio project while evolving as OpenNexus3DStudio: SPACE-TIME EDITION.

## 🙏 Acknowledgments

- [Three.js](https://threejs.org/) for 3D rendering
- [3DAIGC-API](https://github.com/FishWoWater/3DAIGC-API) for the backend API
- [TripoStudio](https://studio.tripo3d.ai/) for inspiration
- [Minimal3DStudio](https://github.com/FishWoWater/Minimal3DStudio) for the foundation