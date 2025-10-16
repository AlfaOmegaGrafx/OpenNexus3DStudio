import React, { useState } from 'react';
import styles from './Load.module.css';

// Import actual icons from the project
import walletIcon from '../images/wallet.png';
import backButtonIcon from '/ui/backButton_white.png';
import loadingIcon from '/ui/loading.svg';

const LoadSimple = () => {
  const [characters, setCharacters] = useState([
    { id: 1, name: 'Character 1', thumbnail: loadingIcon, rarity: 'Common' },
    { id: 2, name: 'Character 2', thumbnail: loadingIcon, rarity: 'Rare' },
    { id: 3, name: 'Character 3', thumbnail: loadingIcon, rarity: 'Epic' },
    { id: 4, name: 'Character 4', thumbnail: loadingIcon, rarity: 'Legendary' }
  ]);

  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [walletConnected, setWalletConnected] = useState(false);

  const handleWalletConnect = () => {
    setWalletConnected(!walletConnected);
  };

  const handleCharacterSelect = (character) => {
    setSelectedCharacter(character);
  };

  const handleLoadCharacter = () => {
    if (selectedCharacter) {
      console.log(`Loading character: ${selectedCharacter.name}`);
      // Implement character loading logic here
    }
  };

  return (
    <div className={styles.container}>
      <div className="sectionTitle">Load Character</div>
      
      <div className={styles.walletSection}>
        <button 
          className={`${styles.walletButton} ${walletConnected ? styles.connected : ''}`}
          onClick={handleWalletConnect}
        >
          <img src={walletIcon} alt="Wallet" className={styles.walletIcon} />
          {walletConnected ? 'Wallet Connected' : 'Connect Wallet'}
        </button>
      </div>

      {walletConnected && (
        <div className={styles.charactersSection}>
          <h3>Your Characters</h3>
          <div className={styles.charactersGrid}>
            {characters.map((character) => (
              <div 
                key={character.id}
                className={`${styles.characterCard} ${selectedCharacter?.id === character.id ? styles.selected : ''}`}
                onClick={() => handleCharacterSelect(character)}
              >
                <div className={styles.characterThumbnail}>
                  <img src={character.thumbnail} alt={character.name} />
                </div>
                <div className={styles.characterInfo}>
                  <h4>{character.name}</h4>
                  <span className={`${styles.rarity} ${styles[character.rarity.toLowerCase()]}`}>
                    {character.rarity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedCharacter && (
        <div className={styles.characterDetails}>
          <h3>Selected Character</h3>
          <div className={styles.detailsCard}>
            <img src={selectedCharacter.thumbnail} alt={selectedCharacter.name} />
            <div>
              <h4>{selectedCharacter.name}</h4>
              <p>Rarity: {selectedCharacter.rarity}</p>
            </div>
          </div>
        </div>
      )}

      <div className={styles.buttonContainer}>
        <button className={styles.buttonLeft}>
          <img src={backButtonIcon} alt="Back" className={styles.buttonIcon} />
          Back
        </button>
        <button 
          className={styles.buttonRight}
          onClick={handleLoadCharacter}
          disabled={!selectedCharacter}
        >
          Load Character
        </button>
      </div>
    </div>
  );
};

export default LoadSimple;
