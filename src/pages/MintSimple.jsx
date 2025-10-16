import React, { useState } from 'react';
import styles from './Mint.module.scss';

// Import actual icons from the project
import infinityIcon from '../images/randomize.png';
import ethereumIcon from '/ui/mint/ethereum.png';
import backButtonIcon from '/ui/backButton_white.png';

const MintSimple = ({ onNavigate }) => {
  const [minting, setMinting] = useState(false);
  const [status, setStatus] = useState('');

  const handleMint = async (edition) => {
    setMinting(true);
    setStatus('Please check your wallet...');
    
    try {
      // Simulate minting process
      await new Promise(resolve => setTimeout(resolve, 2000));
      setStatus(`Successfully minted ${edition}!`);
    } catch (error) {
      setStatus('Minting failed. Please try again.');
    } finally {
      setMinting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className="sectionTitle">Mint Your Character</div>
      
      <div className={styles.mintContainer}>
        <div className={styles.mainTitleWrap}>
          <div className={styles.topLine} />
          <div className={styles.mainTitle}>Mint</div>
        </div>
        
        <div className={styles.mintButtonContainer}>
          <button
            className={`${styles.mintButton} ${!minting ? styles.active : ''}`}
            onClick={() => handleMint('Open Edition')}
            disabled={minting}
          >
            <img src={infinityIcon} alt="Infinity" className={styles.buttonIcon} />
            {minting ? 'Minting...' : 'Open Edition'}
          </button>

          <div className={styles.divider}></div>

          <button
            className={styles.mintButton}
            disabled={true}
          >
            <img src={ethereumIcon} alt="Ethereum" className={styles.buttonIcon} />
            Genesis Edition
          </button>
          <span className={styles.genesisText}>
            (<span className={styles.required}>Coming Soon!</span>)
          </span>
        </div>
        
        {status && (
          <div className={styles.statusMessage}>
            {status}
          </div>
        )}
      </div>

              <div className={styles.bottomContainer}>
                <button 
                  className={styles.buttonLeft}
                  onClick={() => onNavigate && onNavigate('back')}
                >
                  <img src={backButtonIcon} alt="Back" className={styles.buttonIcon} />
                  Back
                </button>
                <button 
                  className={styles.buttonRight}
                  onClick={() => onNavigate && onNavigate('next')}
                >
                  Next
                </button>
              </div>
    </div>
  );
};

export default MintSimple;
