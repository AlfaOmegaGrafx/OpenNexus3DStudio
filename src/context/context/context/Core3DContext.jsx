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
    if (!key || !key.trim()) {
      setError('API key is required');
      return false;
    }

    const trimmedKey = key.trim();
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Update service first
      core3dService.initialize(trimmedKey);
      
      // Then update state and storage
      setApiKey(trimmedKey);
      localStorage.setItem('core3d_api_key', trimmedKey);
      setIsInitialized(true);
      
      console.log('✅ Core3D API key updated and service initialized');
      
      // Don't auto-load data - let users request it explicitly
      // This prevents 404 errors if endpoints don't exist
      
      return true;
    } catch (err) {
      setError(err.message);
      console.error('❌ Core3D API initialization failed:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load models
  const loadModels = useCallback(async () => {
    try {
      const modelsData = await core3dService.getModels();
      if (modelsData) {
        setModels(modelsData);
        return modelsData;
      }
      // 404 or null response - endpoint doesn't exist, that's okay
      return [];
    } catch (err) {
      // Only set error for non-404 errors
      if (err.status !== 404 && !err.message.includes('404')) {
        console.error('Failed to load models:', err);
        setError(err.message);
      }
      return [];
    }
  }, []);

  // Load materials
  const loadMaterials = useCallback(async () => {
    try {
      const materialsData = await core3dService.getMaterials();
      if (materialsData) {
        setMaterials(materialsData);
        return materialsData;
      }
      // 404 or null response - endpoint doesn't exist, that's okay
      return [];
    } catch (err) {
      // Only set error for non-404 errors
      if (err.status !== 404 && !err.message.includes('404')) {
        console.error('Failed to load materials:', err);
        setError(err.message);
      }
      return [];
    }
  }, []);

  // Load user designs
  const loadUserDesigns = useCallback(async () => {
    try {
      const designsData = await core3dService.getUserDesigns();
      if (designsData) {
        setUserDesigns(designsData);
        return designsData;
      }
      // 404 or null response - endpoint doesn't exist, that's okay
      return [];
    } catch (err) {
      // Only set error for non-404 errors
      if (err.status !== 404 && !err.message.includes('404')) {
        console.error('Failed to load user designs:', err);
        setError(err.message);
      }
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

      // Pass progress callback to service for real-time updates
      const design = await core3dService.generateDesign(modelId, materialId, {
        ...options,
        onProgress: (status, progress) => {
          // Update progress based on generation status
          // Status: pending -> 0-90%, ok -> 100%
          if (status === 'pending') {
            setGenerationProgress(Math.min(progress, 90));
          } else if (status === 'ok') {
            setGenerationProgress(100);
          }
        }
      });
      
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

  // Create token
  const createToken = useCallback(async (tokenData = {}) => {
    if (!isInitialized) {
      throw new Error('Core3D not initialized');
    }

    try {
      setIsLoading(true);
      setError(null);
      const token = await core3dService.createToken(tokenData);
      return token;
    } catch (err) {
      console.error('Failed to create token:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-initialize if API key exists in localStorage (but don't use default token)
  useEffect(() => {
    const storedKey = localStorage.getItem('core3d_api_key');
    
    // Only auto-initialize if there's a stored key (not default token)
    if (!isInitialized && storedKey && storedKey.trim() && storedKey !== 'EzrwCUN') {
      setApiKey(storedKey);
      initializeCore3D(storedKey).catch(err => {
        console.error('Auto-initialization failed:', err);
      });
    }
  }, [isInitialized, initializeCore3D]);

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
    createToken,
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
