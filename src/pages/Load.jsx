import React, { useEffect, useState } from 'react';
import styles from './Load.module.css';
import { ethers } from 'ethers';
import { useWeb3React } from '@web3-react/core';
import { InjectedConnector } from "@web3-react/injected-connector"
import { ViewContext, ViewMode } from '../context/ViewContext';

import { SoundContext } from "../context/SoundContext"
import { AudioContext } from "../context/AudioContext"

import { lootIconUrl } from '../library/lootAssetsConfig';

const bodyIcon = lootIconUrl('BODY.svg');
const headIcon = lootIconUrl('HEAD.svg');
const weaponIcon = lootIconUrl('WEAPON.svg');
const chestIcon = lootIconUrl('CHEST.svg');
const handsIcon = lootIconUrl('HANDS.svg');
const shoesIcon = lootIconUrl('SHOES.svg');
const hairIcon = lootIconUrl('HAIR.svg');
const eyesIcon = lootIconUrl('EYES.svg');
const hatIcon = lootIconUrl('HATS.svg');
const maskIcon = lootIconUrl('MASKS.svg');
const wingsIcon = lootIconUrl('WINGS.svg');
const tailIcon = lootIconUrl('TAIL.svg');
const sigilIcon = lootIconUrl('SIGIL.svg');

function Load() {
    const { account, library, activate } = useWeb3React();
    const [characters, setCharacters] = useState([]);
    const { setViewMode } = React.useContext(ViewContext);
    const { playSound } = React.useContext(SoundContext)
    const { isMute } = React.useContext(AudioContext)

    // Function to get loot icon for a trait type
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
            sigil: sigilIcon
        };
        return iconMap[traitType] || bodyIcon;
    };

    const injectedConnector = new InjectedConnector({
        supportedChainIds: [137, 1, 3, 4, 5, 42, 97],
      })
    
    useEffect(() => {
        if (account && library) {
            const contractAddress = '0x69341F01C2113E2d09Cd4837bbF1786dfbBc41d7';
            const abi = [
                'function balanceOf(address owner) external view returns (uint256)',
                'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
                'function tokenURI(uint256 tokenId) external view returns (string)',
            ];
            const contract = new ethers.Contract(contractAddress, abi, library);
            contract.balanceOf(account).then((balance) => {
                const promises = [];
                for (let i = 0; i < balance; i++) {
                    promises.push(contract.tokenOfOwnerByIndex(account, i));
                }
                Promise.all(promises).then((tokenIds) => {
                    const tokenURIs = tokenIds.map((tokenId) => {
                        return contract.tokenURI(tokenId);
                    });
                    Promise.all(tokenURIs).then((values) => {
                        setCharacters(values);
                    });
                });
            });
        }
    }, [account, library]);

    const connectWallet = () => {
        activate(injectedConnector)
    }

    const loadCharacter = (character) => {
        !isMute && playSound('backNextButton');
        setViewMode(ViewMode.APPEARANCE)
    }

    const back = () => {
        setViewMode(ViewMode.LANDING)
        !isMute && playSound('backNextButton');
    }

    return (
        <div className={styles.container}>
        {/* if the user has not logged in, display a message */}
            {!account && (
                <div className={styles.message}>
                    Please connect your wallet to load your characters
                    {/* show connect button */}
                    <button className={styles.button} onClick={() => connectWallet()}>Connect</button>
                </div>
            )}
            <div className={styles.characterContainer}>
                <div className={styles.title}>Load Character</div>
                <div className={styles.charactersGrid}>
                    {characters.map((character, i) => {
                        // Parse character data to extract traits
                        const characterData = typeof character === 'string' ? JSON.parse(character) : character;
                        const traits = characterData.attributes || characterData.traits || {};
                        
                        return (
                            <div
                                key={i}
                                className={styles.characterCard}
                                onClick={() => {loadCharacter(character)}}
                            >
                                <div className={styles.characterThumbnail}>
                                    <img src={getTraitIcon('body')} alt="Character" />
                                </div>
                                <div className={styles.characterInfo}>
                                    <h4>{characterData.name || `Character #${i + 1}`}</h4>
                                    <div className={styles.traitIcons}>
                                        {Object.keys(traits).slice(0, 4).map((traitType) => (
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
                {/* show back button to return to landing page */}
            <button className={styles.button} onClick={() => back()}>Back</button>
        </div>
    );
}

export default Load;