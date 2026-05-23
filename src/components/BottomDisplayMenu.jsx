import React, {useEffect,useState,useContext} from "react"
import styles from "./BottomDisplayMenu.module.css"
import { SceneContext } from "../context/SceneContext"
import randomizeIcon from "../images/randomize-green.png"
import wireframeIcon from "../images/wireframe.png"
import solidIcon from "../images/solid.png"
import mouseFollowIcon from "../images/eye.png"
import mouseNoFollowIcon from "../images/no-eye.png"
import playIcon from "../images/play.png"
import reverseIcon from "../images/reverse.png"
import pauseIcon from "../images/pause.png"
import fastForwardIcon from "../images/fast-forward.png"
import fastBackwardIcon from "../images/fast-backward.png"

export default function BottomDisplayMenu({loadedAnimationName, randomize}){
  const {
    characterManager,
    toggleDebugMode,
    debugMode,
    lookAtManager,
    animationManager,
    webcamAvatarActive,
    startWebcamControl,
    stopWebcamControl,
    isInitialized
  } = useContext(SceneContext);
  const [hasMouseLook, setHasMouseLook] = useState(lookAtManager?.userActivated || false);
  const [animationName, setAnimationName] = React.useState(animationManager?.getCurrentAnimationName() || "");
  const [webcamStarting, setWebcamStarting] = useState(false);

  useEffect(()=>{
    if (loadedAnimationName == null){
      loadedAnimationName = "T-Pose";
    }
    if (loadedAnimationName != ""){
      setAnimationName(loadedAnimationName);
    }
  },[loadedAnimationName])

  const clickDebugMode = () =>{
    if (toggleDebugMode) toggleDebugMode()
  } 
  
  const handlePlayPauseMode = (play) =>{
    if (!animationManager) return;
    play ? animationManager.play() : animationManager.pause();
    animationManager.setSpeed(1);
  }

  const handlePlaySpeed = (speed) =>{
    if (!animationManager) return;
    animationManager.play()
    animationManager.setSpeed(speed);
  }

  const handleMouseLookEnable = () => {
    if (!lookAtManager || !animationManager) return;
    lookAtManager.setActive(!hasMouseLook);
    // should be called within lookatManager
    animationManager.enableMouseLook(!hasMouseLook);
    setHasMouseLook(!hasMouseLook);
  };

  const nextAnimation = async () => {
    if (!animationManager) return;
    console.log("play next")
    await animationManager.loadNextAnimation();
    setAnimationName(animationManager.getCurrentAnimationName());
  }
  const prevAnimation = async () => {
    if (!animationManager) return;
    console.log("play prev")
    await animationManager.loadPreviousAnimation();
    setAnimationName(animationManager.getCurrentAnimationName());
  };

  const handleWebcamToggle = async () => {
    if (webcamAvatarActive) {
      stopWebcamControl?.();
      return;
    }
    if (webcamStarting) return;
    setWebcamStarting(true);
    try {
      await startWebcamControl?.();
    } finally {
      setWebcamStarting(false);
    }
  };

  // Show bar when scene is initialized (so Cam is available) or we have animation+lookAt
  const hasAnimationBar = animationManager && lookAtManager;
  const hasWebcamControl = typeof startWebcamControl === 'function';
  const showBar = isInitialized || hasAnimationBar || hasWebcamControl;
  if (!showBar) {
    return null;
  }

  return (
        <div className={styles["Container"]}>
          {hasAnimationBar && (
            <div className={styles["ContainerPositionTop"]}>
              <div className={styles["flexButtonsTop"]}>
                <div 
                    className={`${styles["optionButtonsSmall"]}`}
                    onClick={()=>{handlePlaySpeed(-2)}}
                >
                  <img src={fastBackwardIcon} />
                </div>
                <div 
                    className={`${styles["optionButtonsSmall"]}`}
                    onClick={()=>{handlePlaySpeed(-1)}}
                >
                  <img src={reverseIcon} />
                </div>
                <div 
                    className={`${styles["optionButtonsSmall"]}`}
                    onClick={()=>{handlePlayPauseMode(false)}}
                >
                  <img src={pauseIcon} />
                </div>
                <div 
                    className={`${styles["optionButtonsSmall"]}`}
                    onClick={()=>{handlePlayPauseMode(true)}}
                >
                  <img src={playIcon} />
                </div>
                <div 
                    className={`${styles["optionButtonsSmall"]}`}
                    onClick={()=>{handlePlaySpeed(2)}}
                >
                  <img src={fastForwardIcon} />
                </div>
              </div>
            </div>
          )}
          <div className={styles["ContainerPosition"]}>
            <div className={styles["topLine"]} />
            {hasAnimationBar && (
              <div className={styles["flexSelect"]}>
                <div 
                    className={`${styles["arrow-button"]} ${styles["left-button"]}`}
                    onClick={prevAnimation}
                />
                <div className={styles["traitInfoTitle"]} style={{ marginBottom: '10px' }}>{animationName}</div>
                <div 
                    className={`${styles["arrow-button"]} ${styles["right-button"]}`}
                    onClick={nextAnimation}
                />
              </div>
            )}
            <div className={styles["flexButtons"]}>
              {hasAnimationBar && randomize && (
                <div className={`${styles["optionButtons"]}`} onClick={randomize}>
                  <img src={randomizeIcon} />
                </div>
              )}
              {hasAnimationBar && (
                <div className={`${styles["optionButtons"]}`} onClick={handleMouseLookEnable}>
                  <img src={hasMouseLook ? mouseNoFollowIcon : mouseFollowIcon} />
                </div>
              )}
              {hasWebcamControl && (
                <div 
                  className={`${styles["optionButtons"]} ${webcamAvatarActive ? styles["optionButtonsActive"] : ""}`}
                  onClick={handleWebcamToggle}
                  title={webcamAvatarActive ? "Stop webcam avatar control" : "Start webcam avatar control (face tracking)"}
                >
                  <span className={styles["webcamLabel"]}>
                    {webcamStarting ? "…" : webcamAvatarActive ? "Cam on" : "Cam"}
                  </span>
                </div>
              )}
              {toggleDebugMode && (
                <div className={`${styles["optionButtons"]}`} onClick={clickDebugMode}>
                  <img src={debugMode ? solidIcon : wireframeIcon} />
                </div>
              )}
            </div>
          </div>
        </div>
    );
}