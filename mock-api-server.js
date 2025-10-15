/**
 * Mock API Server for Open3DStudio Development
 * This provides a simple mock API for testing the frontend without the full 3DAIGC-API backend
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    message: 'Mock API server is running',
    timestamp: new Date().toISOString()
  });
});

// Get available models
app.get('/models', (req, res) => {
  res.json({
    models: [
      {
        id: 'text-to-3d',
        name: 'Text to 3D',
        description: 'Generate 3D models from text descriptions',
        status: 'available'
      },
      {
        id: 'image-to-3d',
        name: 'Image to 3D',
        description: 'Convert 2D images to 3D models',
        status: 'available'
      },
      {
        id: 'mesh-segmentation',
        name: 'Mesh Segmentation',
        description: 'Segment 3D models into parts',
        status: 'available'
      },
      {
        id: 'mesh-painting',
        name: 'Mesh Painting',
        description: 'Apply textures and materials to 3D models',
        status: 'available'
      },
      {
        id: 'part-completion',
        name: 'Part Completion',
        description: 'Complete missing parts of 3D models',
        status: 'available'
      },
      {
        id: 'auto-rigging',
        name: 'Auto Rigging',
        description: 'Automatically rig 3D models for animation',
        status: 'available'
      }
    ]
  });
});

// Create a new task
app.post('/tasks', (req, res) => {
  const { type, prompt, imageFile } = req.body;
  
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Simulate task creation
  const task = {
    id: taskId,
    type,
    prompt,
    status: 'pending',
    progress: 0,
    createdAt: new Date().toISOString(),
    estimatedTime: '2-5 minutes'
  };
  
  console.log(`Created task: ${taskId} (${type})`);
  
  res.json(task);
});

// Get task status
app.get('/tasks/:taskId', (req, res) => {
  const { taskId } = req.params;
  
  // Simulate task progress
  const progress = Math.min(100, Math.floor(Math.random() * 100));
  const status = progress === 100 ? 'completed' : 'running';
  
  const task = {
    id: taskId,
    status,
    progress,
    updatedAt: new Date().toISOString()
  };
  
  if (status === 'completed') {
    task.result = {
      modelUrl: '/mock-models/sample-model.glb',
      thumbnailUrl: '/mock-models/sample-thumbnail.jpg',
      metadata: {
        vertices: 1234,
        faces: 5678,
        materials: 2
      }
    };
  }
  
  res.json(task);
});

// Get all tasks
app.get('/tasks', (req, res) => {
  res.json({
    tasks: [
      {
        id: 'task_1',
        type: 'text-to-3d',
        prompt: 'A cute robot',
        status: 'completed',
        progress: 100,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        result: {
          modelUrl: '/mock-models/robot.glb',
          thumbnailUrl: '/mock-models/robot-thumbnail.jpg'
        }
      },
      {
        id: 'task_2',
        type: 'image-to-3d',
        prompt: 'Convert this image to 3D',
        status: 'running',
        progress: 65,
        createdAt: new Date(Date.now() - 1800000).toISOString()
      }
    ]
  });
});

// Delete task
app.delete('/tasks/:taskId', (req, res) => {
  const { taskId } = req.params;
  console.log(`Deleted task: ${taskId}`);
  res.json({ message: 'Task deleted successfully' });
});

// Upload file
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`
  });
});

// Get task results
app.get('/tasks/:taskId/result', (req, res) => {
  const { taskId } = req.params;
  
  // Simulate result download
  res.json({
    taskId,
    status: 'completed',
    result: {
      modelUrl: '/mock-models/sample-result.glb',
      thumbnailUrl: '/mock-models/sample-result-thumbnail.jpg',
      metadata: {
        vertices: 2048,
        faces: 4096,
        materials: 3,
        fileSize: '2.5MB'
      }
    }
  });
});

// Generate endpoints that TaskManager expects
app.post('/generate/text-to-3d', (req, res) => {
  let prompt, options;
  
  // Handle both JSON and form data
  if (req.headers['content-type']?.includes('application/json')) {
    prompt = req.body.prompt;
    options = req.body.options;
  } else {
    // Handle multipart/form-data
    prompt = req.body.prompt;
    options = req.body.options ? JSON.parse(req.body.options) : {};
  }
  
  console.log(`Text-to-3D generation request: "${prompt}"`);
  console.log('Request body:', req.body);
  console.log('Content-Type:', req.headers['content-type']);
  
  // Simulate processing time
  setTimeout(() => {
    res.json({
      success: true,
      taskId: `text-to-3d_${Date.now()}`,
      result: {
        modelUrl: '/mock-models/text-to-3d-result.glb',
        thumbnailUrl: '/mock-models/text-to-3d-thumbnail.jpg',
        metadata: {
          prompt: prompt,
          vertices: 1500,
          faces: 3000,
          materials: 2,
          fileSize: '1.8MB'
        }
      }
    });
  }, 2000);
});

app.post('/generate/image-to-3d', upload.single('image'), (req, res) => {
  let prompt, options;
  
  // Handle both JSON and form data
  if (req.headers['content-type']?.includes('application/json')) {
    prompt = req.body.prompt;
    options = req.body.options;
  } else {
    prompt = req.body.prompt;
    options = req.body.options ? JSON.parse(req.body.options) : {};
  }
  
  console.log(`Image-to-3D generation request: "${prompt}"`);
  console.log('Request body:', req.body);
  console.log('Content-Type:', req.headers['content-type']);
  
  setTimeout(() => {
    res.json({
      success: true,
      taskId: `image-to-3d_${Date.now()}`,
      result: {
        modelUrl: '/mock-models/image-to-3d-result.glb',
        thumbnailUrl: '/mock-models/image-to-3d-thumbnail.jpg',
        metadata: {
          prompt: prompt,
          vertices: 2000,
          faces: 4000,
          materials: 3,
          fileSize: '2.2MB'
        }
      }
    });
  }, 3000);
});

app.post('/generate/mesh-painting', upload.single('image'), (req, res) => {
  let prompt, options;
  
  // Handle both JSON and form data
  if (req.headers['content-type']?.includes('application/json')) {
    prompt = req.body.prompt;
    options = req.body.options;
  } else {
    prompt = req.body.prompt;
    options = req.body.options ? JSON.parse(req.body.options) : {};
  }
  
  console.log(`Mesh painting request: "${prompt}"`);
  
  setTimeout(() => {
    res.json({
      success: true,
      taskId: `mesh-painting_${Date.now()}`,
      result: {
        modelUrl: '/mock-models/mesh-painting-result.glb',
        thumbnailUrl: '/mock-models/mesh-painting-thumbnail.jpg',
        metadata: {
          prompt: prompt,
          vertices: 1800,
          faces: 3600,
          materials: 4,
          fileSize: '2.0MB'
        }
      }
    });
  }, 2500);
});

app.post('/generate/mesh-segmentation', (req, res) => {
  let options;
  
  // Handle both JSON and form data
  if (req.headers['content-type']?.includes('application/json')) {
    options = req.body.options;
  } else {
    options = req.body.options ? JSON.parse(req.body.options) : {};
  }
  
  console.log('Mesh segmentation request');
  
  setTimeout(() => {
    res.json({
      success: true,
      taskId: `mesh-segmentation_${Date.now()}`,
      result: {
        segments: [
          { id: 'head', name: 'Head', vertices: 500 },
          { id: 'torso', name: 'Torso', vertices: 800 },
          { id: 'arms', name: 'Arms', vertices: 400 },
          { id: 'legs', name: 'Legs', vertices: 600 }
        ],
        metadata: {
          totalSegments: 4,
          totalVertices: 2300
        }
      }
    });
  }, 1500);
});

app.post('/generate/part-completion', (req, res) => {
  let prompt, options;
  
  // Handle both JSON and form data
  if (req.headers['content-type']?.includes('application/json')) {
    prompt = req.body.prompt;
    options = req.body.options;
  } else {
    prompt = req.body.prompt;
    options = req.body.options ? JSON.parse(req.body.options) : {};
  }
  
  console.log(`Part completion request: "${prompt}"`);
  
  setTimeout(() => {
    res.json({
      success: true,
      taskId: `part-completion_${Date.now()}`,
      result: {
        modelUrl: '/mock-models/part-completion-result.glb',
        thumbnailUrl: '/mock-models/part-completion-thumbnail.jpg',
        metadata: {
          prompt: prompt,
          vertices: 2200,
          faces: 4400,
          materials: 3,
          fileSize: '2.3MB'
        }
      }
    });
  }, 4000);
});

app.post('/generate/auto-rigging', (req, res) => {
  let options;
  
  // Handle both JSON and form data
  if (req.headers['content-type']?.includes('application/json')) {
    options = req.body.options;
  } else {
    options = req.body.options ? JSON.parse(req.body.options) : {};
  }
  
  console.log('Auto rigging request');
  
  setTimeout(() => {
    res.json({
      success: true,
      taskId: `auto-rigging_${Date.now()}`,
      result: {
        riggedModelUrl: '/mock-models/auto-rigging-result.glb',
        thumbnailUrl: '/mock-models/auto-rigging-thumbnail.jpg',
        bones: [
          { name: 'Hips', position: [0, 0, 0] },
          { name: 'Spine', position: [0, 0.5, 0] },
          { name: 'Chest', position: [0, 1.0, 0] },
          { name: 'Neck', position: [0, 1.3, 0] },
          { name: 'Head', position: [0, 1.6, 0] }
        ],
        metadata: {
          bones: 5,
          vertices: 2500,
          faces: 5000,
          fileSize: '2.8MB'
        }
      }
    });
  }, 5000);
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Mock API server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📋 Available models: http://localhost:${PORT}/models`);
  console.log(`📁 Upload endpoint: http://localhost:${PORT}/upload`);
  console.log('\n💡 This is a mock server for development. For production, use the full 3DAIGC-API backend.');
});

module.exports = app;
