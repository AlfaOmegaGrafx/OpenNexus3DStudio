import React, { useContext, useState } from "react";
import { SceneContext } from "../context/SceneContext";
import { SoundContext } from "../context/SoundContext";
import { AudioContext } from "../context/AudioContext";
import { LanguageContext } from "../context/LanguageContext";
import styles from "./Load.module.css";
import "./PanelStyles.css";

// Import icons
import backButtonIcon from "/ui/backButton_white.png";
import loadingIcon from "/ui/loading.svg";
// Import loot-assets icons
import uploadIcon from "/loot-assets/icons/WEAPON.svg";
import urlIcon from "/loot-assets/icons/SIGIL.svg";
import fileIcon from "/loot-assets/icons/BODY.svg";

function LoadPanel({ onNavigate }) {
  const { characterManager, loadModel } = useContext(SceneContext);
  const { playSound } = useContext(SoundContext);
  const { isMute } = useContext(AudioContext);
  const { t } = useContext(LanguageContext);

  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const handleBack = () => {
    !isMute && playSound('backNextButton');
    onNavigate('back');
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      !isMute && playSound('uiClick');
    }
  };

  const handleLoad = async () => {
    if (!selectedFile) {
      alert('Please select a file first');
      return;
    }

    setIsLoading(true);
    !isMute && playSound('load');

    try {
      await loadModel(selectedFile);
      alert('Model loaded successfully!');
    } catch (error) {
      console.error('Load error:', error);
      alert('Failed to load model');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadFromURL = async () => {
    const url = prompt('Enter model URL:');
    if (!url) return;

    setIsLoading(true);
    !isMute && playSound('load');

    try {
      await loadModel(url);
      alert('Model loaded successfully!');
    } catch (error) {
      console.error('Load error:', error);
      alert('Failed to load model');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.loadPanel}>
      <div className={styles.panelHeader}>
        <h2>Load Character</h2>
      </div>

      <div className={styles.loadOptions}>
        <div className={styles.fileUpload}>
          <h3>
            <img src={fileIcon} alt="File" className={styles.sectionIcon} />
            Upload File
          </h3>
          <input
            type="file"
            accept=".vrm,.glb,.gltf,.fbx,.obj"
            onChange={handleFileSelect}
            className={styles.fileInput}
          />
          {selectedFile && (
            <div className={styles.selectedFile}>
              <p>Selected: {selectedFile.name}</p>
              <p>Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          )}
        </div>

        <div className={styles.urlLoad}>
          <h3>
            <img src={urlIcon} alt="URL" className={styles.sectionIcon} />
            Load from URL
          </h3>
          <button onClick={handleLoadFromURL} className={styles.urlButton}>
            <img src={urlIcon} alt="URL" className={styles.buttonIcon} />
            Load from URL
          </button>
        </div>

        <div className={styles.loadButton}>
          <button
            onClick={handleLoad}
            disabled={!selectedFile || isLoading}
            className={styles.loadButton}
          >
            {isLoading ? (
              <>
                <img src={loadingIcon} alt="Loading" className={styles.loadingIcon} />
                Loading...
              </>
            ) : (
              <>
                <img src={uploadIcon} alt="Load" className={styles.buttonIcon} />
                Load Character
              </>
            )}
          </button>
        </div>
      </div>

      <div className={styles.supportedFormats}>
        <h3>Supported Formats</h3>
        <ul>
          <li>VRM (.vrm)</li>
          <li>GLB (.glb)</li>
          <li>GLTF (.gltf)</li>
          <li>FBX (.fbx)</li>
          <li>OBJ (.obj)</li>
        </ul>
      </div>

      <div className={styles.navigationButtons}>
        <button onClick={handleBack} className={styles.navButton}>
          Back
        </button>
      </div>
    </div>
  );
}

export default LoadPanel;
