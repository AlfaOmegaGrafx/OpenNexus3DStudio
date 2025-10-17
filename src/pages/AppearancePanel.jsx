import React, { useContext, useState } from "react";
import { SceneContext } from "../context/SceneContext";
import { SoundContext } from "../context/SoundContext";
import { AudioContext } from "../context/AudioContext";
import { LanguageContext } from "../context/LanguageContext";
import styles from "./Appearance.module.css";
import "./PanelStyles.css";

// Import loot-assets icons (using existing project images)
import bodyIcon from "/src/images/t-shirt.png";
import chestIcon from "/src/images/t-shirt.png";
import handsIcon from "/src/images/t-shirt.png";
import headIcon from "/src/images/t-shirt.png";
import neckIcon from "/src/images/t-shirt.png";
import shoesIcon from "/src/images/t-shirt.png";
import waistIcon from "/src/images/t-shirt.png";
import weaponIcon from "/src/images/t-shirt.png";

function AppearancePanel({ onNavigate }) {
  const { characterManager } = useContext(SceneContext);
  const { playSound } = useContext(SoundContext);
  const { isMute } = useContext(AudioContext);
  const { t } = useContext(LanguageContext);

  const [selectedCategory, setSelectedCategory] = useState('body');
  const [selectedTraits, setSelectedTraits] = useState({});

  const categories = [
    { id: 'body', name: 'Body', icon: bodyIcon },
    { id: 'chest', name: 'Chest', icon: chestIcon },
    { id: 'hands', name: 'Hands', icon: handsIcon },
    { id: 'head', name: 'Head', icon: headIcon },
    { id: 'neck', name: 'Neck', icon: neckIcon },
    { id: 'shoes', name: 'Shoes', icon: shoesIcon },
    { id: 'waist', name: 'Waist', icon: waistIcon },
    { id: 'weapon', name: 'Weapon', icon: weaponIcon }
  ];

  const handleCategorySelect = (categoryId) => {
    setSelectedCategory(categoryId);
    !isMute && playSound('uiClick');
  };

  const handleTraitSelect = (traitId) => {
    setSelectedTraits(prev => ({
      ...prev,
      [selectedCategory]: traitId
    }));
    !isMute && playSound('uiClick');
  };

  const handleRandomize = () => {
    !isMute && playSound('randomize');
    // Randomize all traits
    const randomTraits = {};
    categories.forEach(cat => {
      randomTraits[cat.id] = Math.floor(Math.random() * 10); // Random trait ID
    });
    setSelectedTraits(randomTraits);
  };

  const handleBack = () => {
    !isMute && playSound('backNextButton');
    onNavigate('back');
  };

  const handleNext = () => {
    !isMute && playSound('backNextButton');
    onNavigate('next');
  };

  return (
    <div className={styles.appearancePanel}>
      <div className={styles.panelHeader}>
        <h2>Character Appearance</h2>
      </div>

      <div className={styles.categorySelector}>
        {categories.map(category => (
          <button
            key={category.id}
            className={`${styles.categoryButton} ${selectedCategory === category.id ? styles.active : ''}`}
            onClick={() => handleCategorySelect(category.id)}
          >
            <img src={category.icon} alt={category.name} className={styles.categoryIcon} />
            <span>{category.name}</span>
          </button>
        ))}
      </div>

      <div className={styles.traitSelector}>
        <h3>{categories.find(cat => cat.id === selectedCategory)?.name} Options</h3>
        <div className={styles.traitGrid}>
          {Array.from({ length: 8 }, (_, i) => (
            <button
              key={i}
              className={`${styles.traitButton} ${selectedTraits[selectedCategory] === i ? styles.selected : ''}`}
              onClick={() => handleTraitSelect(i)}
            >
              <div className={styles.traitPreview}>
                <img src={`/loot-assets/loot/thumbnails/${selectedCategory}/${i + 1}.png`} 
                     alt={`${selectedCategory} ${i + 1}`} 
                     className={styles.traitImage} />
              </div>
              <span className={styles.traitName}>{selectedCategory} {i + 1}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.actionButtons}>
        <button onClick={handleRandomize} className={styles.randomizeButton}>
          🎲 Randomize
        </button>
      </div>

      <div className={styles.navigationButtons}>
        <button onClick={handleBack} className={styles.navButton}>
          Back
        </button>
        <button onClick={handleNext} className={styles.navButton}>
          Next
        </button>
      </div>
    </div>
  );
}

export default AppearancePanel;
