import React, { useState } from 'react';
import { useScene } from '../context/SceneContext';
import { useCore3D } from '../context/Core3DContext';
import { bootstrapLootCharacter, LOOT_MODELS_MANIFEST_URL } from '../library/lootAssetsConfig';
import styles from './Tools.module.css';

const ToolsSimple = ({ onNavigate }) => {
  const {
    currentModel,
    exportModel,
    sceneManager,
    characterManager
  } = useScene();

  const {
    isInitialized: core3dInitialized,
    currentDesign,
    selectedModel: core3dModel,
    selectedMaterial: core3dMaterial,
    generateDesign,
    exportDesign
  } = useCore3D();

  // Export options state
  const [exportOptions, setExportOptions] = useState({
    createAtlas: true,
    mergeAtlasType: 'standard', // 'toon', 'standard', 'both'
    shaderType: 'standard', // 'standard' or 'toon'
    ktxCompression: false,
    filename: 'opennexus3dstudio_export.vrm',
    vrmVersion: '0.0',
    title: 'OpenNexus3DStudio Export',
    author: 'OpenNexus3DStudio',
    version: '1.0.0',
    allowedUserName: 'Everyone',
    commercialUssageName: 'Allow',
    optimize: true,
    includeExpressions: true,
    includeHumanoidBones: true
  });

  const [isExporting, setIsExporting] = useState(false);

  // Handle export with selected options
  const handleExport = async () => {
    if (!currentModel) {
      alert('No model loaded to export');
      return;
    }

    setIsExporting(true);
    try {
      // Import downloadVRMWithAvatar
      const { downloadVRMWithAvatar } = await import('../library/download-utils');
      
      // Determine shader type and atlas options based on selections
      const useStandardShader = exportOptions.shaderType === 'standard';
      const mergeToToon = exportOptions.mergeAtlasType === 'toon' || exportOptions.mergeAtlasType === 'both';
      const mergeToStandard = exportOptions.mergeAtlasType === 'standard' || exportOptions.mergeAtlasType === 'both';
      
      // Build export options
      const finalExportOptions = {
        vrmMeta: {
          title: exportOptions.title,
          author: exportOptions.author,
          version: exportOptions.version,
          allowedUserName: exportOptions.allowedUserName,
          commercialUssageName: exportOptions.commercialUssageName
        },
        createTextureAtlas: exportOptions.createAtlas,
        mergeAppliedMorphs: exportOptions.optimize,
        // Set atlas type based on mergeAtlasType selection
        exportMtoonAtlas: mergeToToon,
        exportStdAtlas: mergeToStandard,
        mToonAtlasSize: 2048,
        mToonAtlasSizeTransp: 1024,
        stdAtlasSize: 2048,
        stdAtlasSizeTransp: 1024,
        isVrm0: exportOptions.vrmVersion === '0.0',
        outputVRM0: exportOptions.vrmVersion === '0.0',
        ktxCompression: exportOptions.ktxCompression,
        shaderType: exportOptions.shaderType,
        screenshotResolution: [512, 512],
        screenshotFaceDistance: 1,
        screenshotFaceOffset: [0, 0, 0],
        screenshotBackground: [0.1, 0.1, 0.1],
        screenshotFOV: 75
      };

      console.log('🔄 Export options:', finalExportOptions);

      // Get model and avatar
      const vrmModel = sceneManager?.currentVRM?.scene || currentModel;
      let avatarToUse = characterManager?.avatar || {};
      
      // If avatar is empty, construct from VRM
      if (!avatarToUse || Object.keys(avatarToUse).length === 0) {
        const vrmData = sceneManager?.currentVRM;
        if (vrmData) {
          avatarToUse = {
            "CUSTOM": {
              vrm: vrmData,
              model: vrmModel
            }
          };
        } else {
          avatarToUse = {
            "CUSTOM": {
              vrm: {
                meta: finalExportOptions.vrmMeta || {},
                humanoid: {},
                materials: [],
                scene: vrmModel
              },
              model: vrmModel
            }
          };
        }
      }

      const filenameWithoutExt = exportOptions.filename.replace(/\.vrm$/i, '');
      
      await downloadVRMWithAvatar(vrmModel, avatarToUse, filenameWithoutExt, finalExportOptions);
      
      alert(`VRM model exported successfully as ${exportOptions.filename}`);
    } catch (error) {
      console.error('VRM export failed:', error);
      alert(`VRM export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleOptionChange = (option, value) => {
    setExportOptions(prev => ({
      ...prev,
      [option]: value
    }));
  };

  const handleMergeAtlasTypeChange = (direction) => {
    const types = ['toon', 'standard', 'both'];
    const currentIndex = types.indexOf(exportOptions.mergeAtlasType);
    let newIndex;
    
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % types.length;
    } else {
      newIndex = (currentIndex - 1 + types.length) % types.length;
    }
    
    setExportOptions(prev => ({
      ...prev,
      mergeAtlasType: types[newIndex]
    }));
  };

  // Loot assets state
  const [lootAssetsLoaded, setLootAssetsLoaded] = useState(false);
  const [availableTraits, setAvailableTraits] = useState([]);
  const [currentLootCharacter, setCurrentLootCharacter] = useState(null);

  // Button handlers for OpenNexus3DStudio avatar tools
  const handleVRMExport = async () => {
    if (!currentModel) {
      alert('No model loaded to export');
      return;
    }
    try {
      await exportModel('vrm');
      alert('VRM exported successfully!');
    } catch (error) {
      alert(`VRM export failed: ${error.message}`);
    }
  };

  const handleGLBExport = async () => {
    if (!currentModel) {
      alert('No model loaded to export');
      return;
    }
    try {
      await exportModel('glb');
      alert('GLB exported successfully!');
    } catch (error) {
      alert(`GLB export failed: ${error.message}`);
    }
  };

  const handleMaterialEditor = () => {
    alert('Material Editor - This would open the material editing interface');
  };

  const handleBlendShapes = () => {
    alert('Blend Shapes - This would open the facial expression controls');
  };

  const handleCore3DGenerate = async () => {
    if (!core3dModel || !core3dMaterial) {
      alert('Please select both a model and material in the Core3D panel first');
      return;
    }
    try {
      await generateDesign(core3dModel.id, core3dMaterial.id);
      alert('Core3D design generated successfully!');
    } catch (error) {
      alert(`Core3D generation failed: ${error.message}`);
    }
  };

  const handleCore3DExport = async () => {
    if (!currentDesign) {
      alert('No Core3D design to export');
      return;
    }
    try {
      await exportDesign(currentDesign.id);
      alert('Core3D design exported successfully!');
    } catch (error) {
      alert(`Core3D export failed: ${error.message}`);
    }
  };

  // Loot Assets functionality (public/loot-assets/)
  const handleLoadLootAssets = async () => {
    if (!characterManager) {
      alert('3D scene is not ready yet');
      return;
    }
    try {
      if (sceneManager?.scene && !characterManager.parentModel) {
        characterManager.setParentModel(sceneManager.scene);
      }
      if (sceneManager?.camera) {
        characterManager.setRenderCamera(sceneManager.camera);
      }

      const response = await fetch(LOOT_MODELS_MANIFEST_URL);
      const manifest = await response.json();

      const traits = manifest.traits.map((trait) => ({
        name: trait.name,
        trait: trait.trait,
        icon: trait.iconSvg,
        collection: trait.collection,
      }));

      setAvailableTraits(traits);
      setLootAssetsLoaded(true);
      alert(`Loaded ${traits.length} loot asset traits from public/loot-assets`);
    } catch (error) {
      alert(`Failed to load loot assets: ${error.message}`);
    }
  };

  const handleLoadLootCharacter = async () => {
    if (!characterManager) {
      alert('3D scene is not ready yet');
      return;
    }

    try {
      if (!lootAssetsLoaded) {
        await handleLoadLootAssets();
      }
      await bootstrapLootCharacter(characterManager);
      setCurrentLootCharacter(characterManager.avatar);
      alert('Loot character loaded in the viewport. Use the animation bar to cycle clips.');
    } catch (error) {
      alert(`Failed to load loot character: ${error.message}`);
    }
  };

  const handleRandomizeLootCharacter = async () => {
    if (!characterManager) {
      alert('3D scene is not ready yet');
      return;
    }

    try {
      if (!characterManager.manifestDataManager?.hasExistingManifest?.()) {
        await bootstrapLootCharacter(characterManager);
        setLootAssetsLoaded(true);
      }
      await characterManager.loadRandomTraits();
      setCurrentLootCharacter(characterManager.avatar);
      alert('Random loot character generated!');
    } catch (error) {
      alert(`Failed to randomize character: ${error.message}`);
    }
  };

  const handleExportLootCharacter = async () => {
    if (!currentLootCharacter) {
      alert('No loot character to export');
      return;
    }
    
    try {
      await exportModel('vrm');
      alert('Loot character exported successfully!');
    } catch (error) {
      alert(`Failed to export loot character: ${error.message}`);
    }
  };

  const getMergeAtlasTypeLabel = () => {
    switch (exportOptions.mergeAtlasType) {
      case 'toon':
        return 'Merge to Toon';
      case 'standard':
        return 'Merge to Standard';
      case 'both':
        return 'Merge to Both';
      default:
        return 'Merge to Standard';
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>3D Tools & Export</h2>
        <p className={styles.subtitle}>Enhanced 3D viewing with OpenNexus3DStudio features</p>
      </div>

      <div className={styles.content}>
        {/* Export Configuration Section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Export Configuration</h3>
          
          {/* Create Atlas Checkbox */}
          <div className={styles.optionGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={exportOptions.createAtlas}
                onChange={(e) => handleOptionChange('createAtlas', e.target.checked)}
                className={styles.checkbox}
              />
              <span>Create Atlas</span>
            </label>
          </div>

          {/* Merge Atlas Type Selection */}
          {exportOptions.createAtlas && (
            <div className={styles.optionGroup}>
              <label className={styles.label}>Merge Atlas Type:</label>
              <div className={styles.mergeAtlasSelector}>
                <button
                  className={styles.arrowButton}
                  onClick={() => handleMergeAtlasTypeChange('prev')}
                  title="Previous option"
                >
                  &lt;
                </button>
                <span className={styles.mergeAtlasValue}>{getMergeAtlasTypeLabel()}</span>
                <button
                  className={styles.arrowButton}
                  onClick={() => handleMergeAtlasTypeChange('next')}
                  title="Next option"
                >
                  &gt;
                </button>
              </div>
            </div>
          )}

          {/* Shader Type Selection */}
          <div className={styles.optionGroup}>
            <label className={styles.label}>Shader Type:</label>
            <select
              value={exportOptions.shaderType}
              onChange={(e) => handleOptionChange('shaderType', e.target.value)}
              className={styles.select}
            >
              <option value="standard">Standard (PBR with ORM textures)</option>
              <option value="toon">Toon (MToon - no ORM textures)</option>
            </select>
            <p className={styles.helpText}>
              Standard shader supports ORM (Occlusion/Roughness/Metalness) textures. Toon shader is optimized for anime-style rendering.
            </p>
          </div>

          {/* KTX Compression */}
          <div className={styles.optionGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={exportOptions.ktxCompression}
                onChange={(e) => handleOptionChange('ktxCompression', e.target.checked)}
                className={styles.checkbox}
              />
              <span>KTX Compression</span>
            </label>
            <p className={styles.helpText}>
              Enable KTX2 texture compression for smaller file sizes
            </p>
          </div>

          {/* Filename */}
          <div className={styles.optionGroup}>
            <label className={styles.label}>Filename:</label>
            <input
              type="text"
              value={exportOptions.filename}
              onChange={(e) => {
                let filename = e.target.value;
                if (!filename.endsWith('.vrm')) {
                  filename = filename + '.vrm';
                }
                handleOptionChange('filename', filename);
              }}
              className={styles.input}
              placeholder="export.vrm"
            />
          </div>

          {/* VRM Version */}
          <div className={styles.optionGroup}>
            <label className={styles.label}>VRM Version:</label>
            <select
              value={exportOptions.vrmVersion}
              onChange={(e) => handleOptionChange('vrmVersion', e.target.value)}
              className={styles.select}
            >
              <option value="0.0">VRM 0.0</option>
              <option value="1.0">VRM 1.0</option>
            </select>
          </div>

          {/* Metadata */}
          <div className={styles.optionGroup}>
            <label className={styles.label}>Title:</label>
            <input
              type="text"
              value={exportOptions.title}
              onChange={(e) => handleOptionChange('title', e.target.value)}
              className={styles.input}
              placeholder="Model Title"
            />
          </div>

          <div className={styles.optionGroup}>
            <label className={styles.label}>Author:</label>
            <input
              type="text"
              value={exportOptions.author}
              onChange={(e) => handleOptionChange('author', e.target.value)}
              className={styles.input}
              placeholder="Author Name"
            />
          </div>

          {/* Export Button */}
          <div className={styles.exportButtonContainer}>
            <button
              onClick={handleExport}
              disabled={isExporting || !currentModel}
              className={`${styles.button} ${styles.exportButton}`}
            >
              {isExporting ? (
                <>
                  <div className={styles.spinner}></div>
                  Exporting...
                </>
              ) : (
                'Continue to Export'
              )}
            </button>
          </div>
        </div>

        {/* Export Tools Section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Quick Export Tools</h3>
          <div className={styles.buttonGrid}>
            <button 
              onClick={handleVRMExport}
              className={`${styles.button} ${styles.vrmButton}`}
              disabled={!currentModel}
              title="Export current model as VRM"
            >
              🎭 Export VRM
            </button>
            <button 
              onClick={handleGLBExport}
              className={`${styles.button} ${styles.glbButton}`}
              disabled={!currentModel}
              title="Export current model as GLB"
            >
              📦 Export GLB
            </button>
          </div>
        </div>

        {/* OpenNexus3DStudio Features */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>OpenNexus3DStudio Features</h3>
          <div className={styles.buttonGrid}>
            <button 
              onClick={handleMaterialEditor}
              className={`${styles.button} ${styles.materialButton}`}
              title="Open material editor"
            >
              🎨 Material Editor
            </button>
            <button 
              onClick={handleBlendShapes}
              className={`${styles.button} ${styles.blendButton}`}
              title="Open blend shapes controls"
            >
              ✨ Blend Shapes
            </button>
          </div>
        </div>

        {/* Core3D Integration */}
        {core3dInitialized && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Core3D Integration</h3>
            <div className={styles.buttonGrid}>
              <button 
                onClick={handleCore3DGenerate}
                className={`${styles.button} ${styles.core3dGenerateButton}`}
                disabled={!core3dModel || !core3dMaterial}
                title="Generate Core3D design with selected model and material"
              >
                ✨ Generate Design
              </button>
              <button 
                onClick={handleCore3DExport}
                className={`${styles.button} ${styles.core3dExportButton}`}
                disabled={!currentDesign}
                title="Export current Core3D design"
              >
                📤 Export Design
              </button>
            </div>
          </div>
        )}

        {/* Status Information */}
        <div className={styles.statusSection}>
          <h3 className={styles.sectionTitle}>Status</h3>
          <div className={styles.statusGrid}>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>Model:</span>
              <span className={styles.statusValue}>{currentModel ? '✅ Loaded' : '❌ None'}</span>
            </div>
            {core3dInitialized && (
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>Core3D:</span>
                <span className={styles.statusValue}>✅ Connected</span>
              </div>
            )}
            {currentDesign && (
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>Design:</span>
                <span className={styles.statusValue}>✅ Ready</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolsSimple;
