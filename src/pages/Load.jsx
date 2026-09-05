import React, { useContext, useEffect, useState } from 'react';
import styles from './Load.module.css';
import { ethers } from 'ethers';
import { ViewContext, ViewMode } from '../context/ViewContext';
import { AccountContext } from '../context/AccountContext';
import { SoundContext } from '../context/SoundContext';
import { AudioContext } from '../context/AudioContext';
import { connectWithThirdweb } from '../library/thirdwebWalletConnect.js';

import bodyIcon from '/loot-assets/icons/BODY.svg';
import headIcon from '/loot-assets/icons/HEAD.svg';
import weaponIcon from '/loot-assets/icons/WEAPON.svg';
import chestIcon from '/loot-assets/icons/CHEST.svg';
import handsIcon from '/loot-assets/icons/HANDS.svg';
import shoesIcon from '/loot-assets/icons/SHOES.svg';
import hairIcon from '/loot-assets/icons/HAIR.svg';
import eyesIcon from '/loot-assets/icons/EYES.svg';
import hatIcon from '/loot-assets/icons/HATS.svg';
import maskIcon from '/loot-assets/icons/MASKS.svg';
import wingsIcon from '/loot-assets/icons/WINGS.svg';
import tailIcon from '/loot-assets/icons/TAIL.svg';
import sigilIcon from '/loot-assets/icons/SIGIL.svg';

/** Loot / character NFT — Polygon */
const LOAD_NETWORK = 'polygon';
const CONTRACT_ADDRESS = '0x69341F01C2113E2d09Cd4837bbF1786dfbBc41d7';
const CONTRACT_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
];

function Load() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [characters, setCharacters] = useState([]);
  const { setViewMode } = useContext(ViewContext);
  const accountCtx = useContext(AccountContext) || {};
  const {
    setWalletAddress,
    setConnected,
    setWalletType,
    setChain,
  } = accountCtx;
  const { playSound } = useContext(SoundContext);
  const { isMute } = useContext(AudioContext);

  const getTraitIcon = (traitType) => {
    const iconMap = {
      body: bodyIcon,
      head: headIcon,
      weapon: weaponIcon,
      chest: chestIcon,
      hands: handsIcon,
      shoes: shoesIcon,
      hair: hairIcon,
      eyes: eyesIcon,
      hat: hatIcon,
      mask: maskIcon,
      wings: wingsIcon,
      tail: tailIcon,
      sigil: sigilIcon,
    };
    return iconMap[traitType] || bodyIcon;
  };

  useEffect(() => {
    if (!account || !provider) return;

    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    let cancelled = false;

    (async () => {
      try {
        const balance = await contract.balanceOf(account);
        const tokenIds = [];
        for (let i = 0; i < balance; i++) {
          tokenIds.push(await contract.tokenOfOwnerByIndex(account, i));
        }
        const uris = await Promise.all(tokenIds.map((id) => contract.tokenURI(id)));
        if (!cancelled) setCharacters(uris);
      } catch (err) {
        console.error('Failed to load characters from contract:', err);
        if (!cancelled) setConnectError(err?.message || 'Failed to load NFTs');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account, provider]);

  const connectWallet = async (walletKind = 'metamask') => {
    setConnecting(true);
    setConnectError('');
    try {
      const session = await connectWithThirdweb({
        walletKind,
        network: LOAD_NETWORK,
      });
      setAccount(session.address);
      setProvider(session.provider);
      setWalletAddress?.(session.address);
      setConnected?.(true);
      setWalletType?.(session.walletType);
      setChain?.(LOAD_NETWORK);
    } catch (err) {
      console.error('Thirdweb wallet connect failed:', err);
      setConnectError(err?.message || 'Wallet connect failed');
    } finally {
      setConnecting(false);
    }
  };

  const loadCharacter = () => {
    !isMute && playSound('backNextButton');
    setViewMode(ViewMode.APPEARANCE);
  };

  const back = () => {
    setViewMode(ViewMode.LANDING);
    !isMute && playSound('backNextButton');
  };

  return (
    <div className={styles.container}>
      {!account && (
        <div className={styles.message}>
          Please connect your wallet to load your characters
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <button
              className={styles.button}
              disabled={connecting}
              onClick={() => connectWallet('metamask')}
            >
              {connecting ? 'Connecting…' : 'Connect MetaMask'}
            </button>
            <button
              className={styles.button}
              disabled={connecting}
              onClick={() => connectWallet('thirdweb-smart')}
              title="Enterprise / branded smart wallet (Thirdweb)"
            >
              Connect smart wallet
            </button>
            <button
              className={styles.button}
              disabled={connecting}
              onClick={() => connectWallet('thirdweb-inapp')}
              title="Email / social in-app wallet (Thirdweb)"
            >
              Connect in-app wallet
            </button>
          </div>
          {connectError ? (
            <p style={{ color: '#c44', marginTop: 8, fontSize: 12 }}>{connectError}</p>
          ) : null}
        </div>
      )}
      <div className={styles.characterContainer}>
        <div className={styles.title}>Load Character</div>
        <div className={styles.charactersGrid}>
          {characters.map((character, i) => {
            const characterData = typeof character === 'string' ? JSON.parse(character) : character;
            const traits = characterData.attributes || characterData.traits || {};

            return (
              <div
                key={i}
                className={styles.characterCard}
                onClick={() => {
                  loadCharacter(character);
                }}
              >
                <div className={styles.characterThumbnail}>
                  <img src={getTraitIcon('body')} alt="Character" />
                </div>
                <div className={styles.characterInfo}>
                  <h4>{characterData.name || `Character #${i + 1}`}</h4>
                  <div className={styles.traitIcons}>
                    {Object.keys(traits)
                      .slice(0, 4)
                      .map((traitType) => (
                        <div key={traitType} className={styles.traitIcon} title={traits[traitType]}>
                          <img src={getTraitIcon(traitType)} alt={traitType} />
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <button className={styles.button} onClick={() => back()}>
        Back
      </button>
    </div>
  );
}

export default Load;
