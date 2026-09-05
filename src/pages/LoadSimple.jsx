import React, { useContext, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import styles from './Load.module.css';
import { AccountContext } from '../context/AccountContext';
import { connectWithThirdweb } from '../library/thirdwebWalletConnect.js';

import walletIcon from '../images/wallet.png';
import backButtonIcon from '/ui/backButton_white.png';
import loadingIcon from '/ui/loading.svg';

const LOAD_NETWORK = 'polygon';
const CONTRACT_ADDRESS = '0x69341F01C2113E2d09Cd4837bbF1786dfbBc41d7';
const CONTRACT_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
];

const LoadSimple = ({ onNavigate }) => {
  const [characters, setCharacters] = useState([]);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setLocalAddress] = useState('');
  const [walletKind, setWalletKind] = useState('metamask');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [provider, setProvider] = useState(null);

  const accountCtx = useContext(AccountContext) || {};
  const {
    setWalletAddress,
    setConnected,
    setWalletType,
    setChain,
  } = accountCtx;

  useEffect(() => {
    if (!walletConnected || !provider || !walletAddress) return;
    let cancelled = false;

    (async () => {
      try {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const balance = await contract.balanceOf(walletAddress);
        const list = [];
        for (let i = 0; i < balance; i++) {
          const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, i);
          let meta = { id: String(tokenId), name: `Character #${tokenId}`, thumbnail: loadingIcon, rarity: 'Common' };
          try {
            const uri = await contract.tokenURI(tokenId);
            const parsed = typeof uri === 'string' && uri.startsWith('{') ? JSON.parse(uri) : null;
            if (parsed) {
              meta = {
                id: String(tokenId),
                name: parsed.name || meta.name,
                thumbnail: parsed.image || loadingIcon,
                rarity: parsed.rarity || 'Common',
                raw: parsed,
              };
            }
          } catch { /* keep stub */ }
          list.push(meta);
        }
        if (!cancelled) setCharacters(list);
      } catch (err) {
        console.warn('NFT load failed after Thirdweb connect:', err);
        if (!cancelled) setCharacters([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletConnected, provider, walletAddress]);

  const handleWalletConnect = async (kind = 'metamask') => {
    if (walletConnected) {
      setWalletConnected(false);
      setLocalAddress('');
      setProvider(null);
      setCharacters([]);
      setSelectedCharacter(null);
      setConnected?.(false);
      setWalletAddress?.(null);
      setWalletType?.(null);
      return;
    }

    setConnecting(true);
    setConnectError('');
    setWalletKind(kind);
    try {
      const session = await connectWithThirdweb({
        walletKind: kind,
        network: LOAD_NETWORK,
      });
      setLocalAddress(session.address);
      setProvider(session.provider);
      setWalletConnected(true);
      setWalletAddress?.(session.address);
      setConnected?.(true);
      setWalletType?.(session.walletType);
      setChain?.(LOAD_NETWORK);
    } catch (err) {
      console.error('Thirdweb connect failed:', err);
      setConnectError(err?.message || 'Wallet connect failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleCharacterSelect = (character) => {
    setSelectedCharacter(character);
  };

  const handleLoadCharacter = () => {
    if (selectedCharacter) {
      console.log(`Loading character: ${selectedCharacter.name}`);
    }
  };

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : '';

  return (
    <div className={styles.container}>
      <div className="sectionTitle">Load Character</div>

      <div className={styles.walletSection}>
        <button
          className={`${styles.walletButton} ${walletConnected ? styles.connected : ''}`}
          disabled={connecting}
          onClick={() => handleWalletConnect('metamask')}
        >
          <img src={walletIcon} alt="Wallet" className={styles.walletIcon} />
          {connecting && walletKind === 'metamask'
            ? 'Connecting…'
            : walletConnected
              ? `Connected ${shortAddr}`
              : 'Connect MetaMask'}
        </button>
        {!walletConnected && (
          <>
            <button
              className={styles.walletButton}
              disabled={connecting}
              onClick={() => handleWalletConnect('thirdweb-smart')}
              title="Enterprise branded smart wallet (Thirdweb)"
            >
              {connecting && walletKind === 'thirdweb-smart' ? 'Connecting…' : 'Smart wallet'}
            </button>
            <button
              className={styles.walletButton}
              disabled={connecting}
              onClick={() => handleWalletConnect('thirdweb-inapp')}
              title="Email / social in-app wallet (Thirdweb)"
            >
              {connecting && walletKind === 'thirdweb-inapp' ? 'Connecting…' : 'In-app wallet'}
            </button>
          </>
        )}
        {connectError ? (
          <p style={{ color: '#c44', fontSize: 12, marginTop: 8 }}>{connectError}</p>
        ) : null}
      </div>

      {walletConnected && (
        <div className={styles.charactersSection}>
          <h3>Your Characters</h3>
          {characters.length === 0 ? (
            <p style={{ fontSize: 13, opacity: 0.8 }}>No characters found for this wallet on Polygon.</p>
          ) : (
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
                    <span className={`${styles.rarity} ${styles[String(character.rarity || 'common').toLowerCase()]}`}>
                      {character.rarity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
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
        <button
          className={styles.buttonLeft}
          onClick={() => onNavigate && onNavigate('back')}
        >
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
