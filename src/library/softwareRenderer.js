/**
 * Software Renderer - Fallback rendering system for environments without WebGL support
 * Provides basic 2D canvas rendering capabilities when WebGL is not available
 */

export class SoftwareRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.options = {
      backgroundColor: '#1a1a1a',
      gridSize: 20,
      showGrid: true,
      showAxes: true,
      ...options
    };
    
    this.isInitialized = false;
    this.animationId = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    
    this.initialize();
  }

  initialize() {
    try {
      this.setupCanvas();
      this.setupScene();
      this.isInitialized = true;
      console.log('✅ Software renderer initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize software renderer:', error);
      throw error;
    }
  }

  setupCanvas() {
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  setupScene() {
    // Create a simple 2D scene representation
    this.scene = {
      objects: [],
      lights: [],
      background: this.options.backgroundColor
    };
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.setupCanvas();
  }

  setClearColor(color) {
    this.options.backgroundColor = color;
  }

  setPixelRatio(ratio) {
    // Software renderer doesn't need pixel ratio handling
    // but we'll store it for compatibility
    this.pixelRatio = ratio;
  }

  render() {
    if (!this.isInitialized) return;

    // Clear canvas
    this.ctx.fillStyle = this.options.backgroundColor;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw grid if enabled
    if (this.options.showGrid) {
      this.drawGrid();
    }

    // Draw axes if enabled
    if (this.options.showAxes) {
      this.drawAxes();
    }

    // Draw scene objects
    this.drawScene();
  }

  drawGrid() {
    const gridSize = this.options.gridSize;
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([1, 1]);

    // Vertical lines
    for (let x = 0; x <= this.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y <= this.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }

    this.ctx.setLineDash([]);
  }

  drawAxes() {
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const axisLength = Math.min(this.width, this.height) * 0.3;

    this.ctx.strokeStyle = '#666';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([]);

    // X-axis (red)
    this.ctx.strokeStyle = '#ff4444';
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY);
    this.ctx.lineTo(centerX + axisLength, centerY);
    this.ctx.stroke();

    // Y-axis (green)
    this.ctx.strokeStyle = '#44ff44';
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY);
    this.ctx.lineTo(centerX, centerY - axisLength);
    this.ctx.stroke();

    // Z-axis (blue) - represented as diagonal
    this.ctx.strokeStyle = '#4444ff';
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY);
    this.ctx.lineTo(centerX + axisLength * 0.7, centerY - axisLength * 0.7);
    this.ctx.stroke();

    // Axis labels
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '12px Arial';
    this.ctx.fillText('X', centerX + axisLength + 5, centerY + 5);
    this.ctx.fillText('Y', centerX - 15, centerY - axisLength - 5);
    this.ctx.fillText('Z', centerX + axisLength * 0.7 + 5, centerY - axisLength * 0.7 - 5);
  }

  drawScene() {
    // Draw a placeholder message
    this.ctx.fillStyle = '#888';
    this.ctx.font = '16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Software Rendering Mode', this.width / 2, this.height / 2 - 20);
    
    this.ctx.font = '12px Arial';
    this.ctx.fillText('WebGL is not available on this system', this.width / 2, this.height / 2);
    this.ctx.fillText('Limited 3D functionality', this.width / 2, this.height / 2 + 20);
  }

  startRenderLoop() {
    if (this.animationId) return;

    const animate = () => {
      this.render();
      this.animationId = requestAnimationFrame(animate);
    };
    
    animate();
    console.log('🎬 Software render loop started');
  }

  stopRenderLoop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
      console.log('⏹️ Software render loop stopped');
    }
  }

  dispose() {
    this.stopRenderLoop();
    this.isInitialized = false;
    console.log('🧹 Software renderer disposed');
  }

  // Compatibility methods for Three.js-like API
  getContext() {
    return this.ctx;
  }

  getCanvas() {
    return this.canvas;
  }

  getSize() {
    return { width: this.width, height: this.height };
  }

  // Method to add objects to the scene (placeholder)
  addObject(object) {
    if (this.scene) {
      this.scene.objects.push(object);
    }
  }

  // Method to remove objects from the scene (placeholder)
  removeObject(object) {
    if (this.scene) {
      const index = this.scene.objects.indexOf(object);
      if (index > -1) {
        this.scene.objects.splice(index, 1);
      }
    }
  }

  // Method to set scene background
  setBackground(color) {
    this.options.backgroundColor = color;
  }

  // Method to enable/disable grid
  setGrid(enable) {
    this.options.showGrid = enable;
  }

  // Method to enable/disable axes
  setAxes(enable) {
    this.options.showAxes = enable;
  }
}

/**
 * Factory function to create a software renderer
 */
export function createSoftwareRenderer(canvas, options = {}) {
  return new SoftwareRenderer(canvas, options);
}

/**
 * Check if software rendering is supported
 */
export function isSoftwareRenderingSupported() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    return !!ctx;
  } catch (error) {
    return false;
  }
}

export default SoftwareRenderer;
