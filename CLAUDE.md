# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Building and Development
- `npm run dev` - Start development server with host flag enabled
- `npm run build` - Build production version using Vite
- `npm run serve` - Preview production build locally
- `npm run electron-dev` - Start development with Electron
- `npm run electron` - Run Electron app

### Desktop Distribution
- `npm run dist-mac` - Build macOS application
- `npm run dist-win` - Build Windows application  
- `npm run dist-linux` - Build Linux application

### Code Quality
- `npm run lint` - Run both JavaScript and Prettier linting
- `npm run lint:js` - Run ESLint on JavaScript/JSX files in src/
- `npm run lint:prettier` - Check code formatting with Prettier

### Testing
- `npm test` - Run tests
- `npm run test:run` - Run tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage

### Asset Management
- `npm run get-assets` - Clone required loot-assets from GitHub into public/ directory

### Deployment
- `npm run deploy` - Deploy to GitHub Pages (runs build first)

## Development Tasks

### Project Management 
---
alwaysApply: true
---
1. You are an expert in frontend web developmemnt, especially in react and 3d. Also you are expert in system design.
2. I am developing a cross-platform software(Windows/MacOS/Web) aimed for 3DAIGC (image-to-3d, text-to-3d, auto-rigging, mesh segmentation, mesh completion etc.)
3. The API documents is provided at @api.md. It contains available endpoints of the backend, including which features/models are available, and how should we query/post each endpoint.
4. If necessary, you can use playwright mcp to browse websites (e.g. checking reference API documents and the style/UI design of the reference website) 
5. Carefully design the task structures, inputs, and outputs of each module. Also you should have good design about the overall framework.
- Make a todo.md list and remember to update it after each task is complete
- Follow the modular architecture patterns established in the library directory
- Use proper error handling and logging throughout the application

## Architecture Overview

### Core Technology Stack
- **Frontend**: React 19 with Vite build system
- **3D Graphics**: Three.js for WebGL rendering with multiple format support, @pixiv/three-vrm for VRM model support
- **State Management**: Context-based state management with custom hooks, Zustand for application state
- **Desktop**: Electron for cross-platform desktop applications
- **Styling**: CSS Modules with modern responsive design, Styled Components
- **API Integration**: Axios for HTTP requests with 3DAIGC-API backend
- **Blockchain**: Ethereum (ethers.js) and Solana (@solana/web3.js) integration
- **Audio**: Web Audio API with lip sync capabilities

### Key Architecture Components

#### SceneManager (Core System)
Located in `src/library/sceneManager.js` - This is the central class that orchestrates all 3D scene functionality:
- Manages 3D scene, camera, renderer, and controls
- Handles model loading, processing, and manipulation
- Provides multiple rendering modes (Solid, Wireframe, Skeleton, etc.)
- Integrates with AssetManager for file operations
- Provides export capabilities for different formats

#### CharacterManager (Core System)
Located in `src/library/characterManager.js` - This is the central class that orchestrates all character-related functionality:
- Manages 3D character models and their traits
- Handles loading, displaying, and manipulating VRM models
- Integrates with AnimationManager, EmotionManager, BlinkManager, and LookAtManager
- Provides VRM export capabilities with optimization features

#### Library Architecture (`src/library/`)
The library directory contains modular utility classes:
- **Scene Management**: `sceneManager.js` - Core 3D scene orchestration
- **Task Management**: `taskManager.js` - AI generation task handling
- **Asset Management**: `assetManager.js` - File operations and format support
- **Character Management**: `vrmManager.js`, `characterManager.js`, `manifestDataManager.js`
- **Animation System**: `animationManager.js`, `blinkManager.js`, `lookatManager.js`, `lipsync.js`
- **Export/Import**: `VRMExporter.js`, `VRMExporterv0.js`, `load-utils.js`, `download-utils.js`, Model export functionality with format conversion
- **Optimization**: `merge-geometry.js`, `cull-mesh.js`, `create-texture-atlas.js`, Model optimization and rendering optimizations
- **Media Generation**: `screenshotManager.js`, `thumbnailsGenerator.js`, `spriteAtlasGenerator.js`
- **Blockchain**: `solanaManager.js`, `mint-utils.js`, `walletCollections.js`
- **Performance**: Model optimization and rendering optimizations

#### Context-Based State Management
React contexts manage different application domains:
- `SceneContext` - 3D scene and rendering state with SceneManager integration
- `TaskContext` - AI task management with TaskManager integration
- `ViewContext` - UI view modes and navigation
- `AccountContext` - User authentication and wallet integration
- `AudioContext` - Audio playback and recording
- `LanguageContext` - Internationalization
- Custom hooks provide easy access to context functionality

#### Asset Management System
- Multi-format support: GLB, GLTF, OBJ, FBX, DAE, STL for 3D models
- Image support: JPG, PNG, BMP, TGA for image-to-3D workflows
- Automatic file validation and format detection
- Drag & drop file upload with progress tracking
- Assets are loaded from `/public/` directory structure
- Manifest-driven asset loading with `manifest.json` files
- Support for multiple asset collections (loot-assets, FUMO, milady, etc.)
- Texture atlasing and optimization for performance

### Key Features Implementation

#### 3D Model Pipeline
1. **Loading**: Multi-format model loading with progress tracking, VRM models loaded via VRMLoaderPlugin
2. **Processing**: Automatic centering, scaling, and optimization
3. **Rendering**: Multiple rendering modes with real-time switching
4. **Export**: Format conversion and model export capabilities
5. **Optimization**: Performance optimizations for large models

#### VRM Model Pipeline
1. **Loading**: VRM models loaded via VRMLoaderPlugin
2. **Customization**: Trait-based system for mixing and matching components
3. **Animation**: Mixamo animation integration with bone remapping
4. **Export**: Optimized VRM export with texture atlasing and mesh merging
5. **Optimization**: One-click optimization reducing models to single draw calls

#### AI Task Management
- Complete task lifecycle management (pending → running → completed/failed)
- Progress tracking with visual indicators
- Task history and cleanup functionality
- Support for all AI workflows: text-to-3D, image-to-3D, mesh painting, etc.
- Real-time API connection monitoring

#### Blockchain Integration
- **Multi-chain Support**: Ethereum (ethers.js) and Solana (@solana/web3.js) integration
- **Wallet Integration**: Web3-React for Ethereum, @solana/web3.js for Solana
- **NFT Management**: Trait verification, ownership checking, and metadata handling
- **Minting Capabilities**: Batch generation and minting for both Ethereum and Solana
- **Metaplex Integration**: Solana NFT standard compliance and marketplace support
- **Smart Contracts**: Integration with custom and standard NFT contracts
- **Transaction Management**: Gas optimization and transaction monitoring
- **Security**: Secure wallet connections and transaction signing

#### Animation System
- **Animation Management**: `animationManager.js` - Core animation orchestration
- **Blink System**: `blinkManager.js` - Automatic eye blinking animations
- **Look-At System**: `lookatManager.js` - Eye tracking and head movement
- **Lip Sync**: `lipsync.js` - Audio-driven facial animation synchronization
- **Mixamo Integration**: Bone remapping and animation retargeting
- **Animation Blending**: Smooth transitions between animation states
- **Performance Optimization**: Efficient animation updates and memory management
- **Custom Animations**: Support for user-defined animation sequences

#### Cross-Platform Desktop Support
- Electron main process with native file dialogs
- Application menus and keyboard shortcuts
- Platform-specific build configurations
- Automatic updates and distribution

#### Blockchain Workflow
1. **Wallet Connection**: Multi-chain wallet integration with secure authentication
2. **NFT Creation**: Trait-based NFT generation with metadata management
3. **Minting Process**: Batch minting with gas optimization
4. **Marketplace Integration**: Direct listing and trading capabilities
5. **Ownership Verification**: Real-time ownership and trait verification
6. **Transaction History**: Complete transaction tracking and management

#### Animation Pipeline
1. **Animation Loading**: Support for multiple animation formats (FBX, GLB, etc.)
2. **Bone Mapping**: Automatic bone remapping for different character rigs
3. **Animation Blending**: Smooth transitions between animation states
4. **Real-time Control**: Live animation parameter adjustment
5. **Performance Optimization**: Efficient animation updates and memory management
6. **Export Capabilities**: Animation export in multiple formats

#### Performance Optimizations
- Automatic face culling system for hidden meshes
- Texture atlas generation to reduce draw calls
- Mesh merging for optimized rendering
- KTX2 texture compression support
- Animation performance optimization with efficient updates
- Blockchain transaction optimization and gas management

## Development Setup Notes

### Required Dependencies
The application requires Node.js 18+ and npm for development. Electron will be installed automatically for desktop builds.

### Required Assets
The application requires external assets to function properly. Run `npm run get-assets` to clone the required loot-assets repository into the public directory.

### Environment Variables
The application uses environment variables for configuration:
- `VITE_API_ENDPOINT` - API backend endpoint (defaults to http://localhost:8000)
- `VITE_ASSET_PATH` environment variable for asset path configuration

### Development Server
The development server runs with `--host` flag enabled for network access, useful for testing on mobile devices and API integration.

### Build Configuration
- Uses Vite with React SWC plugin for fast builds
- Output directory is configured to `./build` for deployment
- Electron builder configuration for cross-platform distribution
- Buffer polyfill configured for file operations

## API Integration

### 3DAIGC-API Backend
The application integrates with the 3DAIGC-API backend for AI generation tasks:
- Text-to-3D generation
- Image-to-3D conversion
- Mesh painting and segmentation
- Part completion and auto-rigging

### API Endpoint Configuration
- Default endpoint: http://localhost:8000
- Configurable through UI or environment variables
- Real-time connection monitoring
- Error handling and retry logic

## Testing and Quality Assurance

### Linting Setup
- ESLint configured with React and import plugins
- Prettier integration for consistent code formatting
- No-inline-styles plugin enforces CSS Modules usage

### Testing Framework
- Vitest for unit and integration testing
- Testing Library for component testing
- Mock implementations for Three.js and Electron APIs

### Code Organization
- Component-based architecture with CSS Modules
- Separation of concerns between UI components and business logic
- Utility functions centralized in library directory
- Context-based state management for clean data flow

## Performance Considerations

### 3D Rendering Optimizations
- Automatic model centering and scaling
- Multiple rendering modes for different use cases
- Efficient material management
- Memory cleanup and disposal patterns

### File Handling
- Streaming file uploads with progress tracking
- Format validation and error handling
- Efficient model processing and optimization
- Proper cleanup of object URLs and resources

### State Management
- Context-based state management for performance
- Event-driven architecture for loose coupling
- Efficient re-rendering with proper dependency arrays
- Memory management with proper cleanup

## Deployment

### Web Deployment
- Build output in `./build` directory
- Static file serving with proper routing
- Environment variable configuration
- API endpoint configuration

### Desktop Distribution
- Cross-platform builds for Windows, macOS, and Linux
- Platform-specific optimizations
- Automatic updates support
- Code signing and notarization (production)

## Common Patterns

### Component Development
- Use functional components with hooks
- Implement proper error boundaries
- Use CSS Modules for styling
- Follow the established context patterns

### Library Development
- Create modular, reusable classes
- Implement proper event systems
- Use async/await for asynchronous operations
- Provide comprehensive error handling

### State Management
- Use contexts for global state
- Implement custom hooks for complex logic
- Follow the established patterns for scene and task management
- Proper cleanup and memory management

### Blockchain Development
- Use secure wallet connection patterns
- Implement proper error handling for transactions
- Follow gas optimization best practices
- Use proper event handling for blockchain events
- Implement proper cleanup for wallet connections

### Animation Development
- Use efficient animation update patterns
- Implement proper bone mapping for different rigs
- Follow performance optimization guidelines
- Use proper cleanup for animation resources
- Implement smooth animation blending