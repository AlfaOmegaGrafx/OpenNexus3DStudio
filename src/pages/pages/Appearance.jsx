import React, { useContext } from "react"
import styles from "./Appearance.module.css"
import { ViewMode, ViewContext } from "../context/ViewContext"
import { SceneContext } from "../context/SceneContext"
import CustomButton from "../components/custom-button"
import { LanguageContext } from "../context/LanguageContext"
import { SoundContext } from "../context/SoundContext"
import { AudioContext } from "../context/AudioContext"
import FileDropComponent from "../components/FileDropComponent"
import { getFileNameWithoutExtension } from "../library/utils"
import MenuTitle from "../components/MenuTitle"
import BottomDisplayMenu from "../components/BottomDisplayMenu"
import decalPicker from "../images/sticker.png"
import { TokenBox } from "../components/token-box/TokenBox"
import JsonAttributes from "../components/JsonAttributes"
import cancel from "../images/cancel.png"
import DecalGridView from "../components/decals/decalGrid"
import randomizeIcon from "../images/randomize.png"
import colorPicker from "../images/color-palette.png"
import { ChromePicker   } from 'react-color'
import RightPanel from "../components/RightPanel"
import SaleIcon from "../images/sale-icon.png"

  /**
   * @typedef {import("../library/CharacterManifestData.js").TraitModelsGroup} TraitModelsGroup
   * @typedef {import("../library/CharacterManifestData.js").ModelTrait} ModelTrait
  */

export const TraitPage ={
  TRAIT:0,
  MORPH:1,
  DECAL:2
}

function Appearance() {
  const { isLoading, setViewMode, setIsLoading } = useContext(ViewContext)
  const {
    toggleDebugMode,
    characterManager,
    animationManager,
    moveCamera,
  } = useContext(SceneContext)
  
  const [traitView, setTraitView] = React.useState(TraitPage.TRAIT)

  const { playSound } = useContext(SoundContext)
  const { isMute } = useContext(AudioContext)
  const { t } = useContext(LanguageContext)
  

  const back = () => {
    !isMute && playSound('backNextButton');
    characterManager.removeCurrentCharacter();
    characterManager.removeCurrentManifest();
    setViewMode(ViewMode.CREATE)
    toggleDebugMode(false);
  }

  const [jsonSelectionArray, setJsonSelectionArray] = React.useState(null)
  const [traits, setTraits] = React.useState(null)
  /**
  * @type {[TraitModelsGroup, React.Dispatch<TraitModelsGroup>]} state
  */
  const [selectedTraitGroup, setSelectedTraitGroup] = React.useState(null)
  /**
   * @type {[ModelTrait|null, React.Dispatch<ModelTrait|null>]} state
   */
  const [selectedTrait, setSelectedTrait] = React.useState(null)
  const [selectedMorphTraits, setSelectedMorphTraits] = React.useState({})
  const [selectedVRM, setSelectedVRM] = React.useState(null)
  const [loadedAnimationName, setLoadedAnimationName] = React.useState("");
  const [isPickingColor, setIsPickingColor] = React.useState(false)
  const [colorPicked, setColorPicked] = React.useState({ background: '#ffffff' })

  const next = () => {
    !isMute && playSound('backNextButton');
    setViewMode(ViewMode.SAVE);
    toggleDebugMode(false);
  }

  const randomize = () => {
    setIsLoading(true);
    setJsonSelectionArray(null);
    characterManager.loadRandomTraits().then(() => {
      if (selectedTraitGroup && selectedTraitGroup.trait != ""){
        setSelectedTrait(characterManager.getCurrentTraitData(selectedTraitGroup.trait));
      }
      setIsLoading(false);
    })
    .catch((error) => {
      setIsLoading(false);
      console.error("Error loading random traits:", error.message);
    });
  }

  const handleColorChange = (color) => {
    setColorPicked({ background: color.hex });
  }
  const handleChangeComplete = (color) =>{
    setColorPicked({ background: color.hex });
    characterManager.setTraitColor(selectedTraitGroup?.trait, color.hex);
  } 

  const handleAnimationDrop = async (file) => {
    const animName = getFileNameWithoutExtension(file.name);
    const path = URL.createObjectURL(file);
    await animationManager.loadAnimation(path,false,0, true, "", animName);
    setLoadedAnimationName(animationManager.getCurrentAnimationName());
  }

  const handleImageDrop = (file) => {
    setIsPickingColor(false);
    if (selectedTraitGroup && selectedTraitGroup.trait != ""){
      setIsLoading(true);
      const path = URL.createObjectURL(file);
      characterManager.loadCustomTexture(selectedTraitGroup.trait, path).then(()=>{
        setIsLoading(false);
      })
    }
    else{
      console.warn("Please select a group trait first.")
    }
  }
  const handleVRMDrop = (file) =>{
    setIsPickingColor(false);
    if (selectedTraitGroup && selectedTraitGroup.trait != ""){
      setIsLoading(true);
      const path = URL.createObjectURL(file);
      characterManager.loadCustomTrait(selectedTraitGroup.trait, path).then(()=>{
        setIsLoading(false);
      })
    }
    else{
      console.warn("Please select a group trait first.")
    }
  }
  const selectTrait = (trait) => {
    console.log(trait);
    if(trait.id === selectedTrait?.id && trait.collectionID === selectedTrait?.collectionID){
      if(trait.morphTraits?.length>0){
        setTraitView(TraitPage.MORPH);
      }
      // We already selected this trait, do nothing
      return
    }

    setIsPickingColor(false);
    setIsLoading(true);
    characterManager.loadTrait(trait.traitGroup.trait, trait.id, trait.collectionID).then(()=>{
      setIsLoading(false);
      console.log(characterManager.getCurrentTotalPrice());
      if(trait.morphTraits?.length>0){
        const selectedMorphTrait = characterManager.getCurrentMorphTraitData(trait.traitGroup.trait);
        setSelectedMorphTraits(Object.entries(selectedMorphTrait).reduce((acc,[key,value])=>{acc[key]=value.id;return acc},{}))
        setTraitView(TraitPage.MORPH);
      }
      setSelectedTrait(trait);
    })
  }
  const removeTrait = (traitGroupName) =>{
    setIsPickingColor(false);
    characterManager.removeTrait(traitGroupName);
    setSelectedTrait(null);
  }
  const randomTrait = (traitGroupName) =>{
    setIsPickingColor(false);
    setIsLoading(true);
    characterManager.loadRandomTrait(traitGroupName).then(()=>{
      setIsLoading(false);
      setSelectedTrait(characterManager.getCurrentTraitData(traitGroupName));
    })
    // set selected trait
  }
  const handleJsonDrop = (files) => {
    setIsPickingColor(false);
    const filesArray = Array.from(files);
    const jsonDataArray = [];
    const processFile = (file) => {
      return new Promise((resolve, reject) => {
        if (file && file.name.toLowerCase().endsWith('.json')) {
          const reader = new FileReader();

          // XXX Anata hack to display nft thumbs
          const thumbLocation = `${characterManager.manifestData?.getAssetsDirectory()}/anata/_thumbnails/t_${file.name.split('_')[0]}.jpg`;

          console.log(thumbLocation)
          reader.onload = function (e) {
            try {
              const jsonContent = JSON.parse(e.target.result);
              // XXX Anata hack to display nft thumbs
              jsonContent.thumb = thumbLocation;
              jsonDataArray.push(jsonContent);

              resolve(); // Resolve the promise when processing is complete
            } catch (error) {
              console.error("Error parsing the JSON file:", error);
              reject(error);
            }
          };
          reader.readAsText(file);
        }
      });
    };

    // Use Promise.all to wait for all promises to resolve
    Promise.all(filesArray.map(processFile))
    .then(() => {
      if (jsonDataArray.length > 0){
        // This code will run after all files are processed
        setJsonSelectionArray(jsonDataArray);
        setIsLoading(true);
        characterManager.loadTraitsFromNFTObject(jsonDataArray[0]).then(()=>{
          setIsLoading(false);
        })
      }
    })
    .catch((error) => {
      console.error("Error processing files:", error);
    });
  }

  const handleFilesDrop = async(files) => {
    const file = files[0];
    // Check if the file has the .fbx extension
    if (file && file.name.toLowerCase().endsWith('.fbx')) {
      handleAnimationDrop(file);
    } 
    if (file && (file.name.toLowerCase().endsWith('.png') || file.name.toLowerCase().endsWith('.jpg'))) {
      handleImageDrop(file);
    } 
    if (file && file.name.toLowerCase().endsWith('.vrm')) {
      handleVRMDrop(file);
    } 
    if (file && file.name.toLowerCase().endsWith('.json')) {
      handleJsonDrop(files);
    } 
  };

  const selectTraitGroup = (traitGroup) => {
    !isMute && playSound('optionClick');
    setIsPickingColor(false);
    if (selectedTraitGroup?.trait !== traitGroup.trait){
      setTraitView(TraitPage.TRAIT);
      setTraits(characterManager.getTraits(traitGroup.trait));

      setSelectedTraitGroup(traitGroup);

      const selectedT = characterManager.getCurrentTraitData(traitGroup.trait)
      const selectedMorphTraits = characterManager.getCurrentMorphTraitData(traitGroup.trait);

      setSelectedTrait(selectedT);
      setSelectedMorphTraits(Object.entries(selectedMorphTraits).reduce((acc,[key,value])=>{acc[key]=value.id;return acc},{}))

      setSelectedVRM(characterManager.getCurrentTraitVRM(traitGroup.trait))
      moveCamera({ targetY: traitGroup.cameraTarget.height, distance: traitGroup.cameraTarget.distance})
    }
    else{
      setTraits(null);
      setSelectedTraitGroup(null)
      setSelectedTrait(null);
      setSelectedMorphTraits({})
      moveCamera({ targetY: 0.8, distance: 3.2 })
    }
  }


  const uploadTrait = () =>{
    setIsPickingColor(false);
    var input = document.createElement('input');
    input.type = 'file';
    input.accept=".vrm"
    if(!selectedTraitGroup){
      return console.error("Please select a trait group first")
    }
    input.onchange = e => { 
      var file = e.target.files[0]; 
      if (file.name.endsWith(".vrm")){
        const url = URL.createObjectURL(file);
        setIsLoading(true);
        characterManager.loadCustomTrait(selectedTraitGroup.trait,url).then(()=>{
          setIsLoading(false);
        })
      }
    }
    input.click();
  }

  return (
    <div className={styles.container}>
      <div className={`loadingIndicator ${isLoading ? "active" : ""}`}>
        <img className={"rotate"} src="ui/loading.svg" />
      </div>
      <div className={"sectionTitle"}>{t("pageTitles.chooseAppearance")}</div>
      <FileDropComponent 
         onFilesDrop={handleFilesDrop}
      />
      {/* Main Menu section */}
      <div className={styles["sideMenu"]}>
        <MenuTitle title="Appearance" left={20}/>
        <div className={styles["bottomLine"]} />
        <div className={styles["scrollContainer"]}>
          <div className={styles["editor-container"]}>
            {
              characterManager.getGroupTraits().map((traitGroup, index) => (
                <div key={"options_" + index} 
                className={styles["editorButton"]}
                onClick={() => {
                  selectTraitGroup(traitGroup)
                }}>
                  <TokenBox
                    size={56}
                    icon={ traitGroup.fullIconSvg }
                    rarity={selectedTraitGroup?.trait !== traitGroup.trait ? "none" : "mythic"}
                    
                  />
                  <div className={styles["editorText"]}>{traitGroup.name}</div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Option Selection section */
      !!traits && selectedTraitGroup && (
        <div className={styles["selectorContainerPos"]}>
        
          <MenuTitle title={selectedTraitGroup.trait} width={130} left={20}/>
          <div
              className={styles["selectorPickerTabs"]}
              >
            {/* color section */
              selectedTrait && traitView==TraitPage.TRAIT && (
                <div className={styles["selectorColorPickerButton"]}
                  onClick={()=>{setIsPickingColor(!isPickingColor)}}
                  >
                  <img className={styles["selectorColorPickerImg"]} src={colorPicker}/>
                </div>
                 )}
                {selectedTraitGroup && selectedTraitGroup.getAllDecals()?.length && <div className={styles["selectorColorPickerButton"]}
                  onClick={()=>traitView==TraitPage.DECAL?setTraitView(TraitPage.TRAIT):setTraitView(TraitPage.DECAL)}
                  >
                  <img className={styles["selectorColorPickerImg"]} src={decalPicker}/>
                </div>}
            </div>
            {
          traitView==TraitPage.TRAIT && !!isPickingColor && (<div 
            draggable = {false}
            className={styles["selectorColorPickerUI"]}>
            <ChromePicker 
              styles={{ default: {picker:{ width: '200px' }} }}
              color={ colorPicked.background }
              onChange={ handleColorChange }
              onChangeComplete={ handleChangeComplete }
              />
          </div>)}
          <div className={styles["bottomLine"]} />
          <div className={styles["scrollContainerOptions"]}>
          {traitView == TraitPage.TRAIT && (
            <div className={styles["selector-container"]}>
              {
                <div
                  key={"randomize-trait"}
                  className={`${styles["selectorButton"]}`}
                  onClick={() => {randomTrait(selectedTraitGroup.trait)}}
                >
                  <TokenBox
                    size={56}
                    icon={randomizeIcon}
                    rarity={"none"}
                  />
                </div>
              }
              {/* Null button section */
                !characterManager.isTraitGroupRequired(selectedTraitGroup.trait) ? (
                  <div
                    key={"no-trait"}
                    className={`${styles["selectorButton"]}`}
                    icon={cancel}
                    onClick={() => {removeTrait(selectedTraitGroup.trait)}}
                  >
                    <TokenBox
                      size={56}
                      icon={cancel}
                      rarity={selectedTrait == null ? "mythic" : "none"}
                    />
                  </div>
                ) : (
                  <></>
                )
              }
              {/* All buttons section */
              traits.map((trait, index) => {
                let active = (trait.id === selectedTrait?.id && trait.collectionID === selectedTrait?.collectionID)
                return (
                  <div
                    key={index}
                    className={`${styles["selectorButton"]}`}
                    onClick={()=>{selectTrait(trait); console.log(trait)}}
                  >
                    <TokenBox
                      size={56}
                      iconOverlay={(trait.purchasable && trait.locked) ? SaleIcon:null}
                      icon={trait.fullThumbnail}
                      rarity={active ? "mythic" : "none"}      
                    />
                  </div>
                )
              })}
            </div>)}
            {traitView == TraitPage.MORPH && (
              <MorphTraitView selectedTrait={selectedTrait} onBack={()=>{setTraitView(TraitPage.TRAIT)}} selectedMorphTrait={selectedMorphTraits} setSelectedMorphTrait={setSelectedMorphTraits} />
            )}
            {traitView == TraitPage.DECAL && (
              <DecalGridView selectedTraitGroup={selectedTraitGroup} onBack={()=>{setTraitView(TraitPage.TRAIT)}} />
            )}
          </div>
          
          <div className={styles["uploadContainer"]}>
            <div 
              className={styles["uploadButton"]}
              onClick={uploadTrait}>
              <div> 
                Upload </div>
            </div>
            
          </div>
        </div>
      )}
      <JsonAttributes jsonSelectionArray={jsonSelectionArray}/>
      
      <RightPanel selectedTrait={selectedTrait} selectedVRM={selectedVRM} traitGroupName={selectedTraitGroup?.trait||""}/>

      <BottomDisplayMenu loadedAnimationName={loadedAnimationName} randomize={randomize}/>
      <div className={styles.buttonContainer}>
        <CustomButton
          theme="light"
          text={t('callToAction.back')}
          size={14}
          className={styles.buttonLeft}
          onClick={back}
        />

        {
        characterManager.canDownload() &&
          <CustomButton
            theme="light"
            text={t('callToAction.next')}
            size={14}
            className={styles.buttonRight}
            onClick={next}
          />
        }

        
        {/* <CustomButton
          theme="light"
          text={t('callToAction.randomize')}
          size={14}
          className={styles.buttonCenter}
          onClick={randomize}
        />
        <CustomButton
          theme="light"
          text={debugMode ? "normal" : "debug"}
          size={14}
          className={styles.buttonCenter}
          onClick={clickDebugMode}
        /> */}
      </div>
    </div>
  )
}

export default Appearance

/**
 * @param {{selectedTrait:ModelTrait|null,selectedMorphTrait:Record<string,string>,onBack:()=>void,setSelectedMorphTrait:(x:Record<string,string>)=>void}} param0 
 */
const MorphTraitView = ({selectedTrait,onBack,selectedMorphTrait,setSelectedMorphTrait})=>{
  const {characterManager,moveCamera} = useContext(SceneContext);

  const groups = characterManager.getMorphGroupTraits(selectedTrait?.traitGroup.trait||"",selectedTrait?.id||"");

  /**
   *
   * @param {string} traitGroup
   * @param {import('../library/CharacterManifestData').MorphGroup} morphGroupTrait 
    */
  const removeMorphTrait = (traitGroup,morphGroupTrait)=>{
    characterManager.removeMorphTrait(traitGroup,morphGroupTrait.trait);
    const morphTraitCopy = {...selectedMorphTrait};
    delete morphTraitCopy[morphGroupTrait.trait]
    setSelectedMorphTrait(morphTraitCopy);
  }
  /**
   * @param {import('../library/CharacterManifestData').MorphTrait} newMorph 
   */
  const selectMorphTrait = (newMorph)=>{
    const parent = newMorph.parentGroup;
    characterManager.loadMorphTrait(selectedTrait?.traitGroup.trait||"",parent.trait||"",newMorph?.id||'');
    moveCamera({ targetY: parent.cameraTarget.height, distance: parent.cameraTarget.distance})
    const morphTraitCopy = {...selectedMorphTrait};
    morphTraitCopy[parent.trait||''] = newMorph.id;
    setSelectedMorphTrait(morphTraitCopy);
  }

  return (
    <div className={styles["selector-container-column"]}>
        <CustomButton
          theme="dark"
          text={"Back"}
          size={14}
          className={styles.buttonLeft}
          onClick={onBack}
        />
        {groups && groups.length > 0 && groups.map((group)=>{
          return (
            <div key={group.trait} className={styles.morphGroup}> 
              <div>{group.name}</div>
              <div className={styles["selector-container"]} >
                <MorphItem key={"empty"}
                    src={cancel}
                    active={!selectedMorphTrait[group.trait]}
                    morphID="cancel"
                    select={()=>removeMorphTrait(selectedTrait.traitGroup.trait,group)}
                    />
                {group.collection.map((morphTrait)=>{
                  let active = morphTrait.id === selectedMorphTrait[group.trait]
                  return (
                    <MorphItem key={morphTrait.id} src={morphTrait.fullThumbnail||''} active={active} morphID={morphTrait.id} select={()=>selectMorphTrait(morphTrait)}/>
                  )
                })}
              </div>

            </div>
          )
        })}
    </div>
  )
}

/**
 * @param {{active:boolean,morphID:string,src:string,select:()=>void}} param0 
 */
const MorphItem = ({active,morphID,src,select})=>{

  return (
    <div
      key={morphID}
      className={`${styles["selectorButton"]}`}
      onClick={select}
    >
      <TokenBox
        size={56}
        icon={src||''}
        rarity={active ? "mythic" : "none"}      
      />
    </div>
  )
}