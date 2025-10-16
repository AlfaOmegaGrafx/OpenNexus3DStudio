import React, { useState } from 'react';
import styles from './Appearance.module.css';

// Import actual icons from the project
import bodyIcon from '../images/t-shirt.png';
import headIcon from '../images/portraits.png';
import handsIcon from '../images/t-shirt.png';
import shoesIcon from '../images/t-shirt.png';
import chestIcon from '../images/t-shirt.png';
import neckIcon from '../images/t-shirt.png';
import weaponIcon from '../images/t-shirt.png';
import waistIcon from '../images/t-shirt.png';
import colorPickerIcon from '../images/color-palette.png';
import randomizeIcon from '../images/randomize.png';
import cancelIcon from '../images/cancel.png';

const AppearanceSimple = () => {
  const [selectedTrait, setSelectedTrait] = useState(null);
  const [selectedColor, setSelectedColor] = useState('#ffffff');
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  const traitCategories = [
    { name: 'Body', icon: bodyIcon, traits: ['Default Body', 'Muscular', 'Slim'] },
    { name: 'Head', icon: headIcon, traits: ['Default Head', 'Round', 'Square'] },
    { name: 'Hands', icon: handsIcon, traits: ['Default Hands', 'Gloves', 'Bare'] },
    { name: 'Shoes', icon: shoesIcon, traits: ['Default Shoes', 'Boots', 'Sneakers'] },
    { name: 'Chest', icon: chestIcon, traits: ['Default Shirt', 'T-Shirt', 'Hoodie'] },
    { name: 'Neck', icon: neckIcon, traits: ['Default Neck', 'Necklace', 'Collar'] },
    { name: 'Weapon', icon: weaponIcon, traits: ['No Weapon', 'Sword', 'Hammer'] },
    { name: 'Waist', icon: waistIcon, traits: ['Default Waist', 'Belt', 'Sash'] }
  ];

  const handleTraitSelect = (category, trait) => {
    setSelectedTrait({ category, trait });
  };

  const handleColorChange = (color) => {
    setSelectedColor(color);
  };

  return (
    <div className={styles.container}>
      <div className="sectionTitle">Choose Appearance</div>
      
      {/* Main trait categories */}
      <div className={styles.sideMenu}>
        <div className={styles.scrollContainer}>
          <div className={styles.editorContainer}>
            {traitCategories.map((category, index) => (
              <div 
                key={index}
                className={styles.editorButton}
                onClick={() => setSelectedTrait(selectedTrait?.category === category.name ? null : { category: category.name, traits: category.traits })}
              >
                <img src={category.icon} alt={category.name} className={styles.editorIcon} />
                <div className={styles.editorText}>{category.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trait options */}
      {selectedTrait && (
        <div className={styles.selectorContainerPos}>
          <div className={styles.selectorContainer}>
            <div className={styles.colorPickerSection}>
              <button 
                className={styles.colorPickerButton}
                onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
              >
                <img src={colorPickerIcon} alt="Color Picker" className={styles.colorPickerIcon} />
                Color
              </button>
              {isColorPickerOpen && (
                <div className={styles.colorPicker}>
                  <input 
                    type="color" 
                    value={selectedColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                  />
                </div>
              )}
            </div>
            
            <div className={styles.traitOptions}>
              {selectedTrait.traits.map((trait, index) => (
                <div 
                  key={index}
                  className={styles.traitOption}
                  onClick={() => handleTraitSelect(selectedTrait.category, trait)}
                >
                  {trait}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className={styles.buttonContainer}>
        <button className={styles.buttonLeft}>Back</button>
        <button className={styles.buttonRight}>Next</button>
      </div>
    </div>
  );
};

export default AppearanceSimple;
