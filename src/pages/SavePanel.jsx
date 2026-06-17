import React, { useContext, useState } from "react";
import { SceneContext } from "../context/SceneContext";
import { SoundContext } from "../context/SoundContext";
import { AudioContext } from "../context/AudioContext";
import { LanguageContext } from "../context/LanguageContext";
import styles from "./Save.module.css";
import "./PanelStyles.css";

// Import icons
import downloadIcon from "/ui/download.svg";
import backButtonIcon from "/ui/backButton_white.png";
import mintIcon from "/ui/mint.svg";
// Import loot-assets icons
import saveIcon from "/loot-assets/icons/CHEST.svg";
import fileIcon from "/loot-assets/icons/TYPE.svg";
import formatIcon from "/loot-assets/icons/Special.svg";

function SavePanel({ onNavigate }) {
  const { characterManager, model } = useContext(SceneContext);
  const { playSound } = useContext(SoundContext);
  const { isMute } = useContext(AudioContext);
  const { t } = useContext(LanguageContext);

  const [saveFormat, setSaveFormat] = useState('vrm');
  const [fileName, setFileName] = useState('character');
  const [isSaving, setIsSaving] = useState(false);

  const handleBack = () => {
    !isMute && playSound('backNextButton');
    onNavigate('back');
  };

  const handleMint = () => {
    !isMute && playSound('backNextButton');
    onNavigate('next');
  };

  const handleSave = async () => {
    if (!model) {
      alert('No model to save');
      return;
    }

    setIsSaving(true);
    !isMute && playSound('save');

    try {
      if (saveFormat === 'vrm') {
        await characterManager.exportVRM(fileName);
      } else if (saveFormat === 'glb') {
        await characterManager.exportGLB(fileName);
      }
      alert('Model saved successfully!');
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save model');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.savePanel}>
      <div className={styles.panelHeader}>
        <h2>Save Character</h2>
      </div>

      <div className={styles.saveOptions}>
        <div className={styles.optionGroup}>
          <label>
            <img src={fileIcon} alt="File" className={styles.labelIcon} />
            File Name:
          </label>
          <input
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            className={styles.fileNameInput}
          />
        </div>

        <div className={styles.optionGroup}>
          <label>
            <img src={formatIcon} alt="Format" className={styles.labelIcon} />
            Format:
          </label>
          <select
            value={saveFormat}
            onChange={(e) => setSaveFormat(e.target.value)}
            className={styles.formatSelect}
          >
            <option value="vrm">VRM</option>
            <option value="glb">GLB</option>
          </select>
        </div>

        <div className={styles.saveButtonContainer}>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={styles.saveButton}
          >
            <img src={saveIcon} alt="Save" className={styles.saveIcon} />
            {isSaving ? 'Saving...' : 'Save Character'}
          </button>
        </div>
      </div>

      <div className={styles.characterPreview}>
        <h3>Character Preview</h3>
        <div className={styles.previewContainer}>
          {model ? (
            <div className={styles.modelInfo}>
              <p>Model loaded: {model.name || 'Character'}</p>
              <p>Format: {saveFormat.toUpperCase()}</p>
            </div>
          ) : (
            <p>No character loaded</p>
          )}
        </div>
      </div>

      <div className={styles.navigationButtons}>
        <button onClick={handleBack} className={styles.navButton}>
          Back
        </button>
        <button onClick={handleMint} className={styles.navButton}>
          Mint
        </button>
      </div>
    </div>
  );
}

export default SavePanel;
