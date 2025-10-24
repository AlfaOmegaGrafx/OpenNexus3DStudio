import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import core3dService from '../services/core3dService';

const Core3DContext = createContext();

export const useCore3D = () => {
  const context = useContext(Core3DContext);
  if (!context) {
    throw new Error('useCore3D must be used within a Core3DProvider');
  }
  return context;
};

export const Core3DProvider = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('core3d_api_key') || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Data states
  const [models, setModels] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [userDesigns, setUserDesigns] = useState([]);
  const [currentDesign, setCurrentDesign] = useState(null);
  
  // UI states
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  // Initialize Core3D service
  const initializeCore3D = useCallback(async (key) => {
    if (!key) {
      setError('API key is required');
      return false;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      core3dService.initialize(key);
      setApiKey(key);
      localStorage.setItem('core3d_api_key', key);
      setIsInitialized(true);
      
      // Load initial data
      await Promise.all([
        loadModels(),
        loadMaterials(),
        loadUserDesigns()
      ]);
      
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load models
  const loadModels = useCallback(async () => {
    try {
      const modelsData = await core3dService.getModels();
      setModels(modelsData);
      return modelsData;
    } catch (err) {
      console.error('Failed to load models:', err);
      setError(err.message);
      return [];
    }
  }, []);

  // Load materials
  const loadMaterials = useCallback(async () => {
    try {
      const materialsData = await core3dService.getMaterials();
      setMaterials(materialsData);
      return materialsData;
    } catch (err) {
      console.error('Failed to load materials:', err);
      setError(err.message);
      return [];
    }
  }, []);

  // Load user designs
  const loadUserDesigns = useCallback(async () => {
    try {
      const designsData = await core3dService.getUserDesigns();
      setUserDesigns(designsData);
      return designsData;
    } catch (err) {
      console.error('Failed to load user designs:', err);
      setError(err.message);
      return [];
    }
  }, []);

  // Generate design
  const generateDesign = useCallback(async (modelId, materialId, options = {}) => {
    if (!isInitialized) {
      throw new Error('Core3D not initialized');
    }

    try {
      setIsGenerating(true);
      setGenerationProgress(0);
      setError(null);

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setGenerationProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const design = await core3dService.generateDesign(modelId, materialId, options);
      
      clearInterval(progressInterval);
      setGenerationProgress(100);
      
      setCurrentDesign(design);
      await loadUserDesigns(); // Refresh user designs
      
      return design;
    } catch (err) {
      console.error('Failed to generate design:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  }, [isInitialized, loadUserDesigns]);

  // Export design
  const exportDesign = useCallback(async (designId, options = {}) => {
    if (!isInitialized) {
      throw new Error('Core3D not initialized');
    }

    try {
      setIsLoading(true);
      const blob = await core3dService.exportDesign(designId, options);
      return blob;
    } catch (err) {
      console.error('Failed to export design:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized]);

  // Upload model
  const uploadModel = useCallback(async (file, metadata = {}) => {
    if (!isInitialized) {
      throw new Error('Core3D not initialized');
    }

    try {
      setIsLoading(true);
      const result = await core3dService.uploadModel(file, metadata);
      await loadModels(); // Refresh models list
      return result;
    } catch (err) {
      console.error('Failed to upload model:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, loadModels]);

  // Upload material
  const uploadMaterial = useCallback(async (file, metadata = {}) => {
    if (!isInitialized) {
      throw new Error('Core3D not initialized');
    }

    try {
      setIsLoading(true);
      const result = await core3dService.uploadMaterial(file, metadata);
      await loadMaterials(); // Refresh materials list
      return result;
    } catch (err) {
      console.error('Failed to upload material:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, loadMaterials]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-initialize if API key exists
  useEffect(() => {
    if (apiKey && !isInitialized) {
      initializeCore3D(apiKey);
    }
  }, [apiKey, isInitialized, initializeCore3D]);

  // Set up event listeners
  useEffect(() => {
    const handleError = (data) => {
      setError(data.error.message);
    };

    const handleModelsLoaded = (data) => {
      setModels(data);
    };

    const handleMaterialsLoaded = (data) => {
      setMaterials(data);
    };

    const handleDesignGenerated = (data) => {
      setCurrentDesign(data.design);
    };

    core3dService.on('error', handleError);
    core3dService.on('modelsLoaded', handleModelsLoaded);
    core3dService.on('materialsLoaded', handleMaterialsLoaded);
    core3dService.on('designGenerated', handleDesignGenerated);

    return () => {
      core3dService.off('error', handleError);
      core3dService.off('modelsLoaded', handleModelsLoaded);
      core3dService.off('materialsLoaded', handleMaterialsLoaded);
      core3dService.off('designGenerated', handleDesignGenerated);
    };
  }, []);

  const value = {
    // State
    isInitialized,
    apiKey,
    isLoading,
    error,
    models,
    materials,
    userDesigns,
    currentDesign,
    selectedModel,
    selectedMaterial,
    isGenerating,
    generationProgress,
    
    // Actions
    initializeCore3D,
    loadModels,
    loadMaterials,
    loadUserDesigns,
    generateDesign,
    exportDesign,
    uploadModel,
    uploadMaterial,
    setSelectedModel,
    setSelectedMaterial,
    setCurrentDesign,
    clearError
  };

  return (
    <Core3DContext.Provider value={value}>
      {children}
    </Core3DContext.Provider>
  );
};

export default Core3DContext;
