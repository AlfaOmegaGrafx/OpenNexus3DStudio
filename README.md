# Open3DStudio

[![Apache2.0 License](https://img.shields.io/badge/license-Apache2.0-green.svg)](LICENSE)
[![Cross-Platform](https://img.shields.io/badge/platform-MacOS%20%7C%20Windows%20%7C%20Web-blue)](#)

**Open3DStudio** is a 3D AIGC application. It works closely with the [3DAIGC-API](https://github.com/FishWoWater/3DAIGC-API) to provide **completely locally deployed** and **free** 3DAIGC workflows. Basically it's an advanced version of the **[Minimal3DStudio](https://github.com/FishWoWater/Minimal3DStudio)** and much like a **replicate of [TripoStudio](https://studio.tripo3d.ai/home?lng=en)**.

The supported workflows include text-to-3d, image-to-3d, mesh segmentation, texture generation, auto-rigging, part completion etc.

## Demo 
You can have a try on [Vercel Deployment](https://open3dstudio-n5hap1p9y-fishwowaters-projects.vercel.app) or download the shipped applications from [Releases](https://github.com/FishWoWater/Open3DStudio/releases).

Notice that you need to deploy the API backend on your own machine or server, or try my API endpoint: [http://i-2.gpushare.com:42180](http://i-2.gpushare.com:42180) (it's deployed on a single 3060Ti and ONLY enables the mesh segmentation feature).

## 🚀 Core Principles
- **All Local**: No data leaves your device. 
- **Open Source**: Apache2.0 licensed.
- **Cross-Platform**: Desktop (Windows/MacOS) & Web.

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
- Multi-format support: GLB, OBJ, FBX etc.
- File uploading: uploading images / meshes for later processing
- All locally deployed, it's scalable and easy to add a feature/model both at the frontend and backend

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- For desktop apps: Electron will be installed automatically

### Installation

```bash
# Clone the repository
git clone https://github.com/FishWoWater/Open3DStudio.git
cd Open3DStudio

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
3. Update the API endpoint in Open3DStudio if needed

## 🏗️ Architecture

### Frontend
- **React 19** with modern hooks
- **Three.js** for 3D rendering
- **Zustand** for state management
- **Vite** for fast development and building
- **Electron** for desktop applications

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

## 🔧 Configuration

### API Endpoint
The application connects to a 3DAIGC-API backend. You can configure the endpoint in the API Status panel or by setting the `VITE_API_ENDPOINT` environment variable.

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

## 📄 License

The code and application is licensed under [Apache2.0 License](LICENSE).

## 🙏 Acknowledgments

- [Three.js](https://threejs.org/) for 3D rendering
- [3DAIGC-API](https://github.com/FishWoWater/3DAIGC-API) for the backend API
- [TripoStudio](https://studio.tripo3d.ai/) for inspiration
- [Minimal3DStudio](https://github.com/FishWoWater/Minimal3DStudio) for the foundation