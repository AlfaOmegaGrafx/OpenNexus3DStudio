import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChromePicker } from 'react-color';
import { useScene } from '../context/SceneContext';
import { useDragToScroll } from '../hooks/useDragToScroll';
import { TokenBox } from '../components/token-box/TokenBox';
import {
  bootstrapLootCharacter,
  normalizeLootAssetUrl,
  resolveLootModelsManifestUrl,
} from '../library/lootAssetsConfig';
import colorPickerIcon from '../images/color-palette.png';
import randomizeIcon from '../images/randomize.png';
import cancelIcon from '../images/cancel.png';
import checkIcon from '../images/tick.svg';
import styles from './Appearance.module.css';

const SubTraitRemoveBadge = ({ active, onRemove, label }) => (
  <button
    type="button"
    className={`${styles.subTraitRemoveButton} ${active ? styles.subTraitRemoveButtonActive : ''}`}
    onClick={(e) => {
      e.stopPropagation();
      if (active) onRemove();
    }}
    disabled={!active}
    title={active ? `Remove ${label}` : `Select ${label} to remove it`}
    aria-label={active ? `Remove ${label}` : `Select ${label} to remove it`}
  >
    <img
      src={active ? checkIcon : cancelIcon}
      alt=""
      className={active ? styles.traitStatusCheckIcon : styles.traitStatusCancelIcon}
    />
  </button>
);

/** Closes the open sub-trait panel (same as re-clicking the main trait group). */
const SubTraitPanelCloseButton = ({ onClose, label }) => (
  <button
    type="button"
    className={styles.subTraitPanelCloseButton}
    onClick={(e) => {
      e.stopPropagation();
      onClose();
    }}
    title={`Close ${label} panel`}
    aria-label={`Close ${label} panel`}
  >
    <img src={cancelIcon} alt="" className={styles.traitStatusCancelIcon} />
  </button>
);

export const TraitPage = {
  TRAIT: 0,
  MORPH: 1,
};

/** @param {string} manifestPath */
function normalizeManifestRef(manifestPath) {
  const s = String(manifestPath || '').trim();
  if (!s) return s;
  if (s.startsWith('http')) return s;
  return normalizeLootAssetUrl(s);
}

const AppearanceSimple = ({ onNavigate }) => {
  const { characterManager, manifest, managersReady, lootBootstrapDone } = useScene();

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [activePackId, setActivePackId] = useState('');
  const [traitGroups, setTraitGroups] = useState([]);
  const [selectedTraitGroup, setSelectedTraitGroup] = useState(null);
  const [traits, setTraits] = useState([]);
  const [selectedTrait, setSelectedTrait] = useState(null);
  const [traitView, setTraitView] = useState(TraitPage.TRAIT);
  const [selectedMorphTraits, setSelectedMorphTraits] = useState({});
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [colorPicked, setColorPicked] = useState({ background: '#ffffff' });

  const { scrollRef: groupsScrollRef, scrollHandlers: groupsScrollHandlers } = useDragToScroll({
    axis: 'y',
    draggingClassName: 'is-drag-scrolling',
  });
  const { scrollRef: optionsScrollRef, scrollHandlers: optionsScrollHandlers } = useDragToScroll({
    axis: 'y',
    draggingClassName: 'is-drag-scrolling',
  });

  const characterPacks = useMemo(() => {
    const fromManifest = Array.isArray(manifest?.characters)
      ? manifest.characters.map((c, index) => ({
          id: `${c.name}-${c.description || index}`,
          name: c.description ? `${c.name} (${c.description})` : c.name,
          manifest: normalizeManifestRef(c.manifest),
          manifestRef: c.manifest,
        }))
      : [];

    const hasLoot = fromManifest.some(
      (p) => p.manifestRef?.includes('models/manifest.json') || p.manifest.includes('models/manifest.json'),
    );
    if (!hasLoot) {
      fromManifest.unshift({
        id: 'Loot',
        name: 'Loot (modular)',
        manifest: resolveLootModelsManifestUrl(),
        manifestRef: './loot-assets/models/manifest.json',
      });
    }
    return fromManifest;
  }, [manifest]);

  const refreshTraitGroups = useCallback(() => {
    if (!characterManager?.manifestDataManager?.hasExistingManifest?.()) {
      setTraitGroups([]);
      return;
    }
    const groups = characterManager.getGroupTraits() || [];
    console.log('[Appearance] Trait groups:', groups.length);
    setTraitGroups(groups);
  }, [characterManager]);

  const canRemoveTraitGroup = useCallback(
    (traitGroupName) => {
      if (!characterManager?.manifestDataManager?.hasExistingManifest?.()) return false;
      return !characterManager.isTraitGroupRequired(traitGroupName);
    },
    [characterManager],
  );

  const getEquippedTrait = useCallback(
    (groupName) => {
      if (!characterManager || !groupName) return null;
      return characterManager.getCurrentTraitData(groupName) ?? null;
    },
    [characterManager],
  );

  const isSameEquippedTrait = useCallback(
    (trait, groupName) => {
      const equipped = getEquippedTrait(groupName);
      if (!equipped) return false;
      return (
        equipped.id === trait.id &&
        (equipped.collectionID ?? '') === (trait.collectionID ?? '')
      );
    },
    [getEquippedTrait],
  );

  const preserveOptionsScroll = useCallback((run) => {
    const el = optionsScrollRef.current;
    const scrollTop = el?.scrollTop ?? 0;
    const scrollLeft = el?.scrollLeft ?? 0;
    return Promise.resolve(run()).finally(() => {
      requestAnimationFrame(() => {
        if (!optionsScrollRef.current) return;
        optionsScrollRef.current.scrollTop = scrollTop;
        optionsScrollRef.current.scrollLeft = scrollLeft;
      });
    });
  }, []);

  const loadCharacterPack = useCallback(
    async (pack, { force = false } = {}) => {
      if (!characterManager || !pack?.manifest) {
        console.warn('[Appearance] loadCharacterPack skipped — no characterManager or pack');
        return;
      }
      setIsLoading(true);
      setLoadError(null);
      setTraitGroups([]);
      setSelectedTraitGroup(null);
      setTraits([]);
      setSelectedTrait(null);
      setTraitView(TraitPage.TRAIT);
      setSelectedMorphTraits({});
      setIsPickingColor(false);

      try {
        if (force || characterManager.manifestDataManager?.hasExistingManifest?.()) {
          characterManager.removeCurrentManifest();
        }
        const manifestUrl = pack.manifest.startsWith('/')
          ? pack.manifest
          : normalizeLootAssetUrl(pack.manifestRef || pack.manifest);

        const isModularLoot = manifestUrl.includes('/models/manifest.json');
        if (isModularLoot) {
          await bootstrapLootCharacter(characterManager, {
            manifestUrl,
            identifier: pack.id,
            force: true,
          });
        } else {
          await characterManager.loadManifest(manifestUrl, pack.id);
          await characterManager.loadInitialTraits();
        }
        characterManager.setCharacterVisible(true);
        setActivePackId(pack.id);
        refreshTraitGroups();
        console.log('[Appearance] Loaded pack:', pack.name, manifestUrl);
      } catch (err) {
        console.error('[Appearance] Failed to load character pack:', err);
        setLoadError(err?.message || 'Failed to load character pack');
      } finally {
        setIsLoading(false);
      }
    },
    [characterManager, refreshTraitGroups],
  );

  useEffect(() => {
    if (!managersReady || !lootBootstrapDone || !characterManager) return;
    if (!characterManager.manifestDataManager?.hasExistingManifest?.()) return;

    const defaultPack =
      characterPacks.find((p) => p.manifest.includes('/models/manifest.json')) ||
      characterPacks[0];

    if (defaultPack && !activePackId) {
      setActivePackId(defaultPack.id);
    }
    refreshTraitGroups();
  }, [managersReady, lootBootstrapDone, characterManager, characterPacks, activePackId, refreshTraitGroups]);

  const closeTraitGroupPanel = useCallback(() => {
    setIsPickingColor(false);
    setSelectedTraitGroup(null);
    setTraits([]);
    setSelectedTrait(null);
    setTraitView(TraitPage.TRAIT);
    setSelectedMorphTraits({});
  }, []);

  const selectTraitGroup = (traitGroup) => {
    if (!characterManager) {
      console.warn('[Appearance] selectTraitGroup — characterManager missing');
      return;
    }

    if (selectedTraitGroup?.trait === traitGroup.trait) {
      closeTraitGroupPanel();
      return;
    }

    setIsPickingColor(false);
    setTraitView(TraitPage.TRAIT);
    const groupTraits = characterManager.getTraits(traitGroup.trait) || [];
    console.log('[Appearance] Selected group:', traitGroup.trait, 'options:', groupTraits.length, groupTraits.slice(0, 3).map((t) => t.id));
    setSelectedTraitGroup(traitGroup);
    setTraits(groupTraits);
    const currentTrait = characterManager.getCurrentTraitData(traitGroup.trait);
    setSelectedTrait(currentTrait);
    if (currentTrait) {
      characterManager.setCharacterVisible(true);
    }
    const morphShapeState = characterManager.getCurrentMorphTraitData(traitGroup.trait);
    setSelectedMorphTraits(
      Object.entries(morphShapeState || {}).reduce((acc, [key, value]) => {
        acc[key] = value.id;
        return acc;
      }, {}),
    );
  };

  const removeTraitFromGroup = useCallback(
    (traitGroupName) => {
      if (!characterManager || !canRemoveTraitGroup(traitGroupName)) return;
      setIsPickingColor(false);
      if (selectedTraitGroup?.trait === traitGroupName) {
        setSelectedTrait(null);
        setSelectedMorphTraits({});
        setTraitView(TraitPage.TRAIT);
      }
      characterManager.removeTrait(traitGroupName);
    },
    [characterManager, canRemoveTraitGroup, selectedTraitGroup?.trait],
  );

  const selectTrait = (trait) => {
    if (!characterManager) return;
    const groupName = trait.traitGroup?.trait || selectedTraitGroup?.trait;
    const isSameTrait = isSameEquippedTrait(trait, groupName);

    if (isSameTrait) {
      if (groupName && canRemoveTraitGroup(groupName)) {
        removeTraitFromGroup(groupName);
        return;
      }
      if (trait.morphTraits?.length > 0) {
        setTraitView(TraitPage.MORPH);
      }
      return;
    }

    setIsPickingColor(false);
    console.log('[Appearance] loadTrait:', trait.traitGroup?.trait, trait.id, trait.collectionID);
    setIsLoading(true);
    preserveOptionsScroll(() =>
      characterManager
        .loadTrait(trait.traitGroup.trait, trait.id, trait.collectionID)
        .then(() => {
          characterManager.setCharacterVisible(true);
          const equipped = characterManager.getCurrentTraitData(trait.traitGroup.trait);
          setSelectedTrait(equipped ?? trait);
          if (trait.morphTraits?.length > 0) {
            const morphShapeState = characterManager.getCurrentMorphTraitData(trait.traitGroup.trait);
            setSelectedMorphTraits(
              Object.entries(morphShapeState || {}).reduce((acc, [key, value]) => {
                acc[key] = value.id;
                return acc;
              }, {}),
            );
            setTraitView(TraitPage.MORPH);
          } else {
            setTraitView(TraitPage.TRAIT);
            setSelectedMorphTraits({});
          }
        })
        .catch((err) => {
          console.error('[Appearance] loadTrait failed:', err);
          setLoadError(err?.message || 'Failed to load trait');
        }),
    ).finally(() => setIsLoading(false));
  };

  const randomTrait = () => {
    if (!characterManager || !selectedTraitGroup) return;
    setIsPickingColor(false);
    setIsLoading(true);
    characterManager
      .loadRandomTrait(selectedTraitGroup.trait)
      .then(() => {
        characterManager.setCharacterVisible(true);
        const nextTrait = characterManager.getCurrentTraitData(selectedTraitGroup.trait);
        setSelectedTrait(nextTrait);
        if (nextTrait?.morphTraits?.length > 0) {
          const morphShapeState = characterManager.getCurrentMorphTraitData(selectedTraitGroup.trait);
          setSelectedMorphTraits(
            Object.entries(morphShapeState || {}).reduce((acc, [key, value]) => {
              acc[key] = value.id;
              return acc;
            }, {}),
          );
        } else {
          setSelectedMorphTraits({});
          setTraitView(TraitPage.TRAIT);
        }
      })
      .finally(() => setIsLoading(false));
  };

  const handleColorChange = (color) => {
    setColorPicked({ background: color.hex });
  };

  const handleColorChangeComplete = (color) => {
    setColorPicked({ background: color.hex });
    if (selectedTraitGroup?.trait) {
      characterManager?.setTraitColor(selectedTraitGroup.trait, color.hex);
    }
  };

  const randomizeAll = () => {
    if (!characterManager) return;
    setIsLoading(true);
    characterManager
      .loadRandomTraits()
      .then(() => {
        characterManager.setCharacterVisible(true);
        if (selectedTraitGroup) {
          setSelectedTrait(characterManager.getCurrentTraitData(selectedTraitGroup.trait));
        }
      })
      .finally(() => setIsLoading(false));
  };

  return (
    <div className={`${styles.container} ${styles.appearanceSidebar}`}>
      {isLoading && (
        <div className={styles.loadingOverlay} aria-hidden="true">
          Loading…
        </div>
      )}

      {loadError && (
        <div className={styles.loadError} role="alert">
          {loadError}
        </div>
      )}

      <div className={styles.packSelector}>
        <label className={styles.packLabel} htmlFor="character-pack-select">
          Character pack
        </label>
        <select
          id="character-pack-select"
          className={styles.packSelect}
          value={activePackId}
          disabled={isLoading || !characterPacks.length}
          onChange={(e) => {
            const pack = characterPacks.find((p) => p.id === e.target.value);
            if (pack) {
              setActivePackId(pack.id);
              void loadCharacterPack(pack, { force: true });
            }
          }}
        >
          {characterPacks.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.randomizeAllButton}
          disabled={isLoading || !traitGroups.length}
          onClick={randomizeAll}
        >
          Randomize all
        </button>
      </div>

      <div className={styles.sideMenu}>
        <div className={styles.titleContainer}>
          <div className={styles.menuTitle}>Choose Appearance</div>
          <div className={styles.bottomLine} />
        </div>
        <div className={styles.traitsContainer}>
          <div
            ref={groupsScrollRef}
            className={`${styles.scrollContainer} ${styles.appearanceScrollRegion}`}
            {...groupsScrollHandlers}
          >
            <div className={styles.editorContainer}>
              {traitGroups.length === 0 && !isLoading && (
                <p className={styles.emptyHint}>
                  {activePackId
                    ? 'Select a character pack above to load traits.'
                    : 'No trait groups loaded. Pick a character pack above.'}
                </p>
              )}
              {traitGroups.map((traitGroup, index) => {
                const equipped = !!getEquippedTrait(traitGroup.trait);
                const canRemove = canRemoveTraitGroup(traitGroup.trait);
                return (
                  <div
                    key={`group_${traitGroup.trait}_${index}`}
                    className={styles.editorButtonWrapper}
                  >
                    <div
                      className={`${styles.editorButton} ${
                        selectedTraitGroup?.trait === traitGroup.trait ? styles.editorButtonActive : ''
                      }`}
                      onClick={() => selectTraitGroup(traitGroup)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') selectTraitGroup(traitGroup);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <TokenBox
                        size={48}
                        icon={normalizeLootAssetUrl(traitGroup.fullIconSvg || traitGroup.iconSvg)}
                        rarity={selectedTraitGroup?.trait === traitGroup.trait ? 'mythic' : 'none'}
                      />
                      <div className={styles.editorText}>{traitGroup.name || traitGroup.trait}</div>
                    </div>
                    {canRemove && (
                      <button
                        type="button"
                        className={`${styles.traitRemoveButton} ${equipped ? styles.subTraitRemoveButtonActive : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTraitFromGroup(traitGroup.trait);
                        }}
                        disabled={!equipped}
                        title={
                          equipped
                            ? `${traitGroup.name || traitGroup.trait} equipped — click to remove`
                            : `Remove ${traitGroup.name || traitGroup.trait}`
                        }
                        aria-label={`Remove ${traitGroup.name || traitGroup.trait}`}
                      >
                        <img
                          src={equipped ? checkIcon : cancelIcon}
                          alt=""
                          className={equipped ? styles.traitStatusCheckIcon : styles.traitStatusCancelIcon}
                        />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {selectedTraitGroup && traits.length > 0 && (
        <div className={styles.selectorContainerPos}>
          <SubTraitPanelCloseButton
            onClose={closeTraitGroupPanel}
            label={selectedTraitGroup.name || selectedTraitGroup.trait}
          />
          <div className={styles.selectorHeader}>
            <div className={styles.selectorTitle}>{selectedTraitGroup.name || selectedTraitGroup.trait}</div>
            <div className={styles.selectorPickerTabs}>
              {selectedTrait && traitView === TraitPage.TRAIT && (
                <button
                  type="button"
                  className={styles.selectorColorPickerButton}
                  onClick={() => setIsPickingColor(!isPickingColor)}
                  title="Trait color"
                >
                  <img className={styles.selectorColorPickerImg} src={colorPickerIcon} alt="" />
                </button>
              )}
              {selectedTrait?.morphTraits?.length > 0 && (
                <button
                  type="button"
                  className={styles.selectorColorPickerButton}
                  onClick={() =>
                    setTraitView(
                      traitView === TraitPage.MORPH ? TraitPage.TRAIT : TraitPage.MORPH,
                    )
                  }
                  title="Morphs"
                >
                  ✦
                </button>
              )}
            </div>
          </div>

          {isPickingColor && selectedTrait && traitView === TraitPage.TRAIT && (
            <div className={styles.selectorColorPickerPanel}>
              <ChromePicker
                color={colorPicked.background}
                onChange={handleColorChange}
                onChangeComplete={handleColorChangeComplete}
                disableAlpha
              />
            </div>
          )}

          <div className={styles.bottomLine} />
          <div
            ref={optionsScrollRef}
            className={`${styles.scrollContainerOptions} ${styles.appearanceScrollRegion}`}
            {...optionsScrollHandlers}
          >
            <div className={styles['selector-container']}>
              {traitView === TraitPage.TRAIT && (
                <>
                  <div
                    className={styles.selectorButton}
                    onClick={randomTrait}
                    role="button"
                    tabIndex={0}
                    title="Random trait"
                  >
                    <TokenBox size={56} icon={randomizeIcon} rarity="none" />
                  </div>

                  {traits.map((trait, index) => {
                    const active = isSameEquippedTrait(trait, selectedTraitGroup.trait);
                    const canRemove = canRemoveTraitGroup(selectedTraitGroup.trait);
                    return (
                      <div
                        key={`${trait.id}_${trait.collectionID}_${index}`}
                        className={styles.selectorButton}
                        data-no-drag-scroll
                        onClick={() => selectTrait(trait)}
                        role="button"
                        tabIndex={0}
                        title={trait.name}
                      >
                        <TokenBox
                          size={56}
                          icon={normalizeLootAssetUrl(trait.fullThumbnail || trait.thumbnail)}
                          rarity={active ? 'mythic' : 'none'}
                        />
                        {canRemove && (
                          <SubTraitRemoveBadge
                            active={active}
                            onRemove={() => removeTraitFromGroup(selectedTraitGroup.trait)}
                            label={trait.name || trait.id}
                          />
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {traitView === TraitPage.MORPH && selectedTrait && (
                <MorphTraitView
                  selectedTrait={selectedTrait}
                  selectedMorphTrait={selectedMorphTraits}
                  setSelectedMorphTrait={setSelectedMorphTraits}
                  onBack={() => setTraitView(TraitPage.TRAIT)}
                  characterManager={characterManager}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className={styles.buttonContainer}>
        <button
          type="button"
          className={styles.buttonLeft}
          onClick={() => onNavigate && onNavigate('back')}
        >
          Back
        </button>
        <button
          type="button"
          className={styles.buttonRight}
          onClick={() => onNavigate && onNavigate('next')}
        >
          Next
        </button>
      </div>
    </div>
  );
};

const MorphTraitView = ({
  selectedTrait,
  selectedMorphTrait,
  setSelectedMorphTrait,
  onBack,
  characterManager,
}) => {
  const groups =
    characterManager?.getMorphGroupTraits(
      selectedTrait?.traitGroup?.trait || '',
      selectedTrait?.id || '',
    ) || [];

  const removeMorphTrait = (traitGroup, morphGroupTrait) => {
    characterManager?.removeMorphTrait(traitGroup, morphGroupTrait.trait);
    setSelectedMorphTrait((prev) => {
      const next = { ...prev };
      delete next[morphGroupTrait.trait];
      return next;
    });
  };

  const selectMorphTrait = (newMorph) => {
    const parent = newMorph.parentGroup;
    const groupKey = parent?.trait || '';
    setSelectedMorphTrait((prev) => {
      if (prev[groupKey] === newMorph.id) {
        characterManager?.removeMorphTrait(selectedTrait.traitGroup.trait, groupKey);
        const next = { ...prev };
        delete next[groupKey];
        return next;
      }
      characterManager?.loadMorphTrait(
        selectedTrait?.traitGroup?.trait || '',
        groupKey,
        newMorph?.id || '',
      );
      return { ...prev, [groupKey]: newMorph.id };
    });
  };

  return (
    <div className={styles['selector-container-column']}>
      <button type="button" className={styles.selectorBackButton} onClick={onBack}>
        Back to traits
      </button>
      {groups.map((group) => (
        <div key={group.trait} className={styles.morphGroup}>
          <div className={styles.morphGroupTitle}>{group.name || group.trait}</div>
          <div className={styles['selector-container']}>
            {group.collection?.map((morphTrait) => {
              const active = morphTrait.id === selectedMorphTrait[group.trait];
              return (
                <div
                  key={morphTrait.id}
                  className={styles.selectorButton}
                  onClick={() => selectMorphTrait(morphTrait)}
                  role="button"
                  tabIndex={0}
                  title={morphTrait.name || morphTrait.id}
                >
                  <TokenBox
                    size={56}
                    icon={normalizeLootAssetUrl(morphTrait.fullThumbnail || morphTrait.thumbnail)}
                    rarity={active ? 'mythic' : 'none'}
                  />
                  <SubTraitRemoveBadge
                    active={active}
                    onRemove={() => removeMorphTrait(selectedTrait.traitGroup.trait, group)}
                    label={morphTrait.name || morphTrait.id}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AppearanceSimple;
