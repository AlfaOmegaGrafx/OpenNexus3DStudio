import React, { useEffect, useState, useContext, useRef, useLayoutEffect } from 'react';
import styles from './BottomDisplayMenu.module.css';
import { SceneContext } from '../context/SceneContext';
import {
  syncAnimationBarDock,
  subscribeViewportLayoutSync,
} from '../library/viewportLayoutSync';
import randomizeIcon from '../images/randomize-green.png';
import wireframeIcon from '../images/wireframe.png';
import solidIcon from '../images/solid.png';
import mouseFollowIcon from '../images/eye.png';
import mouseNoFollowIcon from '../images/no-eye.png';
import playIcon from '../images/play.png';
import reverseIcon from '../images/reverse.png';
import pauseIcon from '../images/pause.png';
import fastForwardIcon from '../images/fast-forward.png';
import fastBackwardIcon from '../images/fast-backward.png';

export default function BottomDisplayMenu({ loadedAnimationName, randomize }) {
  const {
    toggleDebugMode,
    debugMode,
    lookAtManager,
    animationManager,
    webcamAvatarActive,
    startWebcamControl,
    stopWebcamControl,
    isInitialized,
  } = useContext(SceneContext);
  const containerRef = useRef(null);
  const [hasMouseLook, setHasMouseLook] = useState(lookAtManager?.userActivated || false);
  const [animationName, setAnimationName] = useState(
    animationManager?.getCurrentAnimationName() || '',
  );
  const [webcamStarting, setWebcamStarting] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [viewportDocked, setViewportDocked] = useState(false);

  useEffect(() => {
    if (loadedAnimationName == null) {
      loadedAnimationName = 'T-Pose';
    }
    if (loadedAnimationName !== '') {
      setAnimationName(loadedAnimationName);
    }
  }, [loadedAnimationName]);

  useEffect(() => {
    const name = animationManager?.getCurrentAnimationName?.();
    if (name) setAnimationName(name);
  }, [animationManager, isInitialized]);

  useEffect(() => {
    if (!animationManager) return;
    setPlaybackSpeed(animationManager.getSpeed?.() ?? 1);
    setIsPaused(animationManager.isPaused());
  }, [animationManager, isInitialized, loadedAnimationName]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const syncDock = () => {
      setViewportDocked(Boolean(container.closest('.main-viewport')));
      syncAnimationBarDock(container);
    };

    const unsubscribe = subscribeViewportLayoutSync(syncDock);
    const observer = new ResizeObserver(syncDock);
    observer.observe(container);
    const viewport = container.closest('.main-viewport');
    if (viewport) observer.observe(viewport);
    const overlay = container.closest('.bottom-menu-overlay');
    if (overlay) observer.observe(overlay);
    const appContent = viewport?.closest('.app-content');
    const sidebar = appContent?.querySelector('.opennexus-sidebar');
    if (sidebar) observer.observe(sidebar);

    const classObserver = new MutationObserver(syncDock);
    if (appContent) {
      classObserver.observe(appContent, { attributes: true, attributeFilter: ['class'] });
    }
    if (sidebar) {
      classObserver.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }

    syncDock();
    return () => {
      unsubscribe();
      observer.disconnect();
      classObserver.disconnect();
    };
  }, [isMinimized]);

  const isStopped = playbackSpeed === 0;

  const syncPlaybackFromManager = () => {
    if (!animationManager) return;
    setPlaybackSpeed(animationManager.getSpeed?.() ?? 0);
    setIsPaused(animationManager.isPaused());
  };

  const clickDebugMode = () => {
    if (toggleDebugMode) toggleDebugMode();
  };

  const toggleDirectionalPlayback = (speed) => {
    if (!animationManager) return;
    const sameDirection = playbackSpeed === speed;
    if (sameDirection && !animationManager.isPaused()) {
      animationManager.pause();
      animationManager.setSpeed(0);
      setIsPaused(true);
      return;
    }
    animationManager.play();
    animationManager.setSpeed(speed);
    setPlaybackSpeed(speed);
    setIsPaused(false);
  };

  const togglePlayStop = () => {
    if (!animationManager) return;
    if (isStopped || animationManager.isPaused()) {
      animationManager.setTime(0);
      animationManager.play();
      animationManager.setSpeed(1);
      setPlaybackSpeed(1);
      setIsPaused(false);
      return;
    }
    animationManager.stop();
    setPlaybackSpeed(0);
    setIsPaused(true);
  };

  const directionalButtonIcon = (speed, directionIcon) => {
    if (playbackSpeed === speed && !isPaused) return pauseIcon;
    return directionIcon;
  };

  const handleMouseLookEnable = () => {
    if (!lookAtManager || !animationManager) return;
    lookAtManager.setActive(!hasMouseLook);
    animationManager.enableMouseLook(!hasMouseLook);
    setHasMouseLook(!hasMouseLook);
  };

  const nextAnimation = async () => {
    if (!animationManager) return;
    await animationManager.loadNextAnimation();
    setAnimationName(animationManager.getCurrentAnimationName());
    syncPlaybackFromManager();
  };

  const prevAnimation = async () => {
    if (!animationManager) return;
    await animationManager.loadPreviousAnimation();
    setAnimationName(animationManager.getCurrentAnimationName());
    syncPlaybackFromManager();
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

  const hasAnimationBar = Boolean(animationManager);
  const hasLookAt = Boolean(lookAtManager);
  const hasWebcamControl = typeof startWebcamControl === 'function';
  const showBar = isInitialized || hasAnimationBar || hasWebcamControl;
  if (!showBar) {
    return null;
  }

  const containerClass = [
    styles.Container,
    viewportDocked ? styles.ContainerViewportDocked : '',
    isMinimized ? styles.ContainerMinimized : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={containerRef} className={containerClass} data-viewport-anchored="true">
      {isMinimized ? (
        <button
          type="button"
          className={styles.minimizedChip}
          data-animation-bar-chip="true"
          onClick={() => setIsMinimized(false)}
          title="Expand animation panel"
          aria-label="Expand animation panel"
        >
          <span className={styles.minimizedChipIcon} aria-hidden="true">
            ▶
          </span>
          <span className={styles.minimizedChipLabel}>{animationName || 'Animation'}</span>
        </button>
      ) : (
        <div className={styles.bottomBarStack} data-animation-bar="true">
          {hasAnimationBar && (
            <div className={styles.ContainerPositionTop}>
              <div className={styles.flexButtonsTop}>
                <button
                  type="button"
                  className={styles.optionButtonsSmall}
                  onClick={() => toggleDirectionalPlayback(-2)}
                  title={
                    playbackSpeed === -2 && !isPaused ? 'Pause fast reverse' : 'Play fast reverse'
                  }
                  aria-label={
                    playbackSpeed === -2 && !isPaused ? 'Pause fast reverse' : 'Play fast reverse'
                  }
                >
                  <img src={directionalButtonIcon(-2, fastBackwardIcon)} alt="" />
                </button>
                <button
                  type="button"
                  className={styles.optionButtonsSmall}
                  onClick={() => toggleDirectionalPlayback(-1)}
                  title={playbackSpeed === -1 && !isPaused ? 'Pause reverse' : 'Play reverse'}
                  aria-label={playbackSpeed === -1 && !isPaused ? 'Pause reverse' : 'Play reverse'}
                >
                  <img src={directionalButtonIcon(-1, reverseIcon)} alt="" />
                </button>
                <button
                  type="button"
                  className={`${styles.optionButtonsSmall} ${styles.playStopButton}`}
                  onClick={togglePlayStop}
                  title={isStopped ? 'Play animation' : 'Stop animation'}
                  aria-label={isStopped ? 'Play animation' : 'Stop animation'}
                >
                  {isStopped ? (
                    <img src={playIcon} alt="" />
                  ) : (
                    <span className={styles.stopIcon} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className={styles.optionButtonsSmall}
                  onClick={() => toggleDirectionalPlayback(1)}
                  title={playbackSpeed === 1 && !isPaused ? 'Pause forward' : 'Play forward'}
                  aria-label={playbackSpeed === 1 && !isPaused ? 'Pause forward' : 'Play forward'}
                >
                  <img src={directionalButtonIcon(1, playIcon)} alt="" />
                </button>
                <button
                  type="button"
                  className={styles.optionButtonsSmall}
                  onClick={() => toggleDirectionalPlayback(2)}
                  title={
                    playbackSpeed === 2 && !isPaused ? 'Pause fast forward' : 'Play fast forward'
                  }
                  aria-label={
                    playbackSpeed === 2 && !isPaused ? 'Pause fast forward' : 'Play fast forward'
                  }
                >
                  <img src={directionalButtonIcon(2, fastForwardIcon)} alt="" />
                </button>
              </div>
            </div>
          )}
          <div className={styles.ContainerPosition}>
            <div className={styles.topLine} />
            {hasAnimationBar && (
              <div className={styles.flexSelect}>
                <div
                  className={`${styles['arrow-button']} ${styles['left-button']}`}
                  onClick={prevAnimation}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') prevAnimation();
                  }}
                />
                <div className={styles.traitInfoTitle}>{animationName}</div>
                <div
                  className={`${styles['arrow-button']} ${styles['right-button']}`}
                  onClick={nextAnimation}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') nextAnimation();
                  }}
                />
              </div>
            )}
            <div className={styles.barFooter}>
              <div className={styles.flexButtons}>
                {hasAnimationBar && randomize && (
                  <div className={styles.optionButtons} onClick={randomize} role="presentation">
                    <img src={randomizeIcon} alt="" />
                  </div>
                )}
                {hasLookAt && (
                  <div className={styles.optionButtons} onClick={handleMouseLookEnable} role="presentation">
                    <img src={hasMouseLook ? mouseNoFollowIcon : mouseFollowIcon} alt="" />
                  </div>
                )}
                {hasWebcamControl && (
                  <div
                    className={`${styles.optionButtons} ${webcamAvatarActive ? styles.optionButtonsActive : ''}`}
                    onClick={handleWebcamToggle}
                    title={
                      webcamAvatarActive
                        ? 'Stop webcam avatar control'
                        : 'Start webcam avatar control (face tracking)'
                    }
                    role="presentation"
                  >
                    <span className={styles.webcamLabel}>
                      {webcamStarting ? '…' : webcamAvatarActive ? 'Cam on' : 'Cam'}
                    </span>
                  </div>
                )}
                {toggleDebugMode && (
                  <div className={styles.optionButtons} onClick={clickDebugMode} role="presentation">
                    <img src={debugMode ? solidIcon : wireframeIcon} alt="" />
                  </div>
                )}
              </div>
              <button
                type="button"
                className={styles.minimizeButton}
                onClick={() => setIsMinimized(true)}
                title="Minimize to bottom-right of viewport"
                aria-label="Minimize animation panel to bottom-right of viewport"
              >
                <span className={styles.minimizeButtonIcon} aria-hidden="true">
                  −
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
