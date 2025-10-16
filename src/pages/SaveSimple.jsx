import React, { useState } from 'react';
import styles from './Save.module.css';

// Import actual icons from the project
import downloadIcon from '/ui/download.svg';
import backButtonIcon from '/ui/backButton_white.png';
import mintIcon from '/ui/mint.svg';

const SaveSimple = ({ onNavigate }) => {
  const [downloadOptions, setDownloadOptions] = useState({
    downloadVRM: true,
    downloadVRMPreview: true,
    downloadLoraData: false,
    downloadSpritesData: false,
    createAtlas: true
  });

  const [atlasSettings, setAtlasSettings] = useState({
    opaqueSize: 1024,
    transparentSize: 1024,
    twoSidedMaterial: false
  });

  const handleOptionChange = (option) => {
    setDownloadOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  const handleAtlasChange = (setting, value) => {
    setAtlasSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  const handleDownload = (format) => {
    console.log(`Downloading ${format}...`);
    // Implement download logic here
  };

  return (
    <div className={styles.container}>
      <div className="sectionTitle">Save Your Character</div>
      
      <div className={styles.downloadOptions}>
        <h3>Download Options</h3>
        <div className={styles.checkboxGroup}>
          <label className={styles.checkboxLabel}>
            <input 
              type="checkbox" 
              checked={downloadOptions.downloadVRM}
              onChange={() => handleOptionChange('downloadVRM')}
            />
            Download VRM
          </label>
          <label className={styles.checkboxLabel}>
            <input 
              type="checkbox" 
              checked={downloadOptions.downloadVRMPreview}
              onChange={() => handleOptionChange('downloadVRMPreview')}
            />
            Download VRM Preview
          </label>
          <label className={styles.checkboxLabel}>
            <input 
              type="checkbox" 
              checked={downloadOptions.downloadLoraData}
              onChange={() => handleOptionChange('downloadLoraData')}
            />
            Download Lora Data
          </label>
          <label className={styles.checkboxLabel}>
            <input 
              type="checkbox" 
              checked={downloadOptions.downloadSpritesData}
              onChange={() => handleOptionChange('downloadSpritesData')}
            />
            Download Sprites Data
          </label>
          <label className={styles.checkboxLabel}>
            <input 
              type="checkbox" 
              checked={downloadOptions.createAtlas}
              onChange={() => handleOptionChange('createAtlas')}
            />
            Create Atlas
          </label>
        </div>
      </div>

      <div className={styles.atlasSettings}>
        <h3>Standard Atlas Size</h3>
        <div className={styles.atlasControl}>
          <label>Opaque: {atlasSettings.opaqueSize} x {atlasSettings.opaqueSize}</label>
          <input 
            type="range" 
            min="256" 
            max="2048" 
            step="256"
            value={atlasSettings.opaqueSize}
            onChange={(e) => handleAtlasChange('opaqueSize', parseInt(e.target.value))}
          />
        </div>
        <div className={styles.atlasControl}>
          <label>Transparent: {atlasSettings.transparentSize} x {atlasSettings.transparentSize}</label>
          <input 
            type="range" 
            min="256" 
            max="2048" 
            step="256"
            value={atlasSettings.transparentSize}
            onChange={(e) => handleAtlasChange('transparentSize', parseInt(e.target.value))}
          />
        </div>
        <label className={styles.checkboxLabel}>
          <input 
            type="checkbox" 
            checked={atlasSettings.twoSidedMaterial}
            onChange={() => handleAtlasChange('twoSidedMaterial', !atlasSettings.twoSidedMaterial)}
          />
          Two Sided Material
        </label>
      </div>

              <div className={styles.buttonContainer}>
                <button 
                  className={styles.buttonLeft}
                  onClick={() => onNavigate && onNavigate('back')}
                >
                  <img src={backButtonIcon} alt="Back" className={styles.buttonIcon} />
                  Back
                </button>
                <button 
                  className={styles.downloadButton}
                  onClick={() => handleDownload('GLB')}
                >
                  <img src={downloadIcon} alt="Download" className={styles.buttonIcon} />
                  GLB
                </button>
                <button 
                  className={styles.downloadButton}
                  onClick={() => handleDownload('VRM')}
                >
                  <img src={downloadIcon} alt="Download" className={styles.buttonIcon} />
                  VRM
                </button>
                <button 
                  className={styles.buttonRight}
                  onClick={() => onNavigate && onNavigate('next')}
                >
                  <img src={mintIcon} alt="Mint" className={styles.buttonIcon} />
                  Mint
                </button>
              </div>
    </div>
  );
};

export default SaveSimple;
