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

## Development Tasks

### Project Management 
---
alwaysApply: true
---
1. You are an expert in frontend web developmemnt, especially in react and 3d. Also you are expert in system design.
2. I am developing a cross-platform software(Windows/MacOS/Web) aimed for 3DAIGC (image-to-3d, text-to-3d, auto-rigging, mesh segmentation, mesh completion etc.)
3. The API documents is provided at @api.md. It contains available endpoints of the backend, including which features/models are available, and how should we query/post each endpoint.
4. If necessary, you can use playwright mcp to browse websites (e.g. checking reference API documents and the style/UI design of the reference website) 
5. Carefully design the task structures, inputs, and outputs of each module. Also you should have good design about the overall framework.---
alwaysApply: true
---
1. You are an expert in frontend web developmemnt, especially in react and 3d. Also you are expert in system design.
2. I am developing a cross-platform software(Windows/MacOS/Web) aimed for 3DAIGC (image-to-3d, text-to-3d, auto-rigging, mesh segmentation, mesh completion etc.)
3. The API documents is provided at @api.md. It contains available endpoints of the backend, including which features/models are available, and how should we query/post each endpoint.
4. If necessary, you can use playwright mcp to browse websites (e.g. checking reference API documents and the style/UI design of the reference website) 
5. Carefully design the task structures, inputs, and outputs of each module. Also you should have good design about the overall framework.---
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
- **3D Graphics**: Three.js for WebGL rendering with multiple format support
- **State Management**: Context-based state management with custom hooks
- **Desktop**: Electron for cross-platform desktop applications
- **Styling**: CSS Modules with modern responsive design
- **API Integration**: Axios for HTTP requests with 3DAIGC-API backend

### Key Architecture Components

#### SceneManager (Core System)
Located in `src/library/sceneManager.js` - This is the central class that orchestrates all 3D scene functionality:
- Manages 3D scene, camera, renderer, and controls
- Handles model loading, processing, and manipulation
- Provides multiple rendering modes (Solid, Wireframe, Skeleton, etc.)
- Integrates with AssetManager for file operations
- Provides export capabilities for different formats

#### Library Architecture (`src/library/`)
The library directory contains modular utility classes:
- **Scene Management**: `sceneManager.js` - Core 3D scene orchestration
- **Task Management**: `taskManager.js` - AI generation task handling
- **Asset Management**: `assetManager.js` - File operations and format support
- **Export/Import**: Model export functionality with format conversion
- **Performance**: Model optimization and rendering optimizations

#### Context-Based State Management
React contexts manage different application domains:
- `SceneContext` - 3D scene and rendering state with SceneManager integration
- `TaskContext` - AI task management with TaskManager integration
- Custom hooks provide easy access to context functionality

#### Asset Management System
- Multi-format support: GLB, GLTF, OBJ, FBX, DAE, STL for 3D models
- Image support: JPG, PNG, BMP, TGA for image-to-3D workflows
- Automatic file validation and format detection
- Drag & drop file upload with progress tracking

### Key Features Implementation

#### 3D Model Pipeline
1. **Loading**: Multi-format model loading with progress tracking
2. **Processing**: Automatic centering, scaling, and optimization
3. **Rendering**: Multiple rendering modes with real-time switching
4. **Export**: Format conversion and model export capabilities
5. **Optimization**: Performance optimizations for large models

#### AI Task Management
- Complete task lifecycle management (pending → running → completed/failed)
- Progress tracking with visual indicators
- Task history and cleanup functionality
- Support for all AI workflows: text-to-3D, image-to-3D, mesh painting, etc.
- Real-time API connection monitoring

#### Cross-Platform Desktop Support
- Electron main process with native file dialogs
- Application menus and keyboard shortcuts
- Platform-specific build configurations
- Automatic updates and distribution

## Development Setup Notes

### Required Dependencies
The application requires Node.js 18+ and npm for development. Electron will be installed automatically for desktop builds.

### Environment Variables
The application uses environment variables for configuration:
- `VITE_API_ENDPOINT` - API backend endpoint (defaults to http://localhost:8000)

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