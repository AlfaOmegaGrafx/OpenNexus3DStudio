import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  buildSpaceTimeBrowserFabricUrl,
  mergeSpatialFabricConfig,
  resolveBrowserReachableFabricUrl,
} from '../library/spatialFabricAdapter.js';
import { loadFabricSceneIntoThree } from '../library/spacetimeFabricScene.js';
import { tickSpacetimeXrFace } from '../library/spacetimeXrFace.js';
import { initNativeFaceBridge } from '../library/nativeFaceBridge.js';
import {
  connectNativeFaceRelaySse,
  isNativeFaceRelayEnabledInUrl,
} from '../library/nativeFaceRelay.js';
import { initRemoteLogClient } from '../library/remoteLogClient.js';
import {
  alignSpacetimeRigToViewport,
  applySpacetimeDesktopViewFromXr,
  applySpacetimeInfiniteZoom,
  captureSpacetimeXrViewAsDesktop,
  createSpacetimeViewportControls,
  frameCameraOnFabricBounds,
  snapshotSpacetimeDesktopView,
  updateGamepadViewportControls,
} from '../library/spacetimeViewportControls.js';
import { createSpacetimeVrButton, reenterSpacetimeVr } from '../library/spacetimeVrButton.js';
import { openSpacetimeXrFilePicker } from '../library/spacetimeXrFilePicker.js';
import { SpacetimeXrInteraction } from '../library/spacetimeXrInteraction.js';
import {
  applySpacetimeFloorAnchor,
  resetSpacetimeFloorAnchor,
  upgradeSpacetimeReferenceSpace,
} from '../library/spacetimeXrFloor.js';
import {
  followSpacetimeWalkSurfaceY,
  prepareSpacetimeWalkSurfaces,
  resetSpacetimeGroundFollowState,
  resetSpacetimeWalkSurfaces,
} from '../library/spacetimeXrGroundFollow.js';
import {
  applySpacetimeDefaultAvatarSpawn,
  cloneSpacetimeView,
  resolveSpacetimeViewForScene,
  resolveSpacetimeXrEnterView,
} from '../library/spacetimeXrSpawnReference.js';
import {
  applySpacetimeXrCorridorRespawn,
  buildSpacetimeDefaultSpawnDesktopView,
  resetSpacetimeFallOffMapTracking,
  shouldForceSpacetimeDefaultSpawnOnXrEnter,
  clearSpacetimeFallOffMapReenter,
  tickSpacetimeFallOffMapDetection,
} from '../library/spacetimeXrFallRespawn.js';
import {
  preflightSpacetimeFabricUrl,
  summarizeSpacetimeWalkSetup,
} from '../library/spacetimeXrE2e.js';
import {
  disposeSpacetimeWalkerVrm,
  loadSpacetimeWalkerVrm,
  rememberSpacetimeWalkerVrm,
  resolveSpacetimeWalkerVrmSource,
  tickSpacetimeWalkerVrm,
} from '../library/spacetimeXrWalker.js';
import {
  tickSpacetimeWalkerGroundFollow,
} from '../library/spacetimeXrWalkerSnap.js';
import './SpaceTimeImmersive.css';

/**
 * Galaxy XR immersive fabric walker — WebXR bounded-floor + BVH ground follow + face relay.
 * Route: /spacetime-xr?nativeFaceRelay=1&fabricUrl=…&useMainAvatar=1 (optional VRM walker)
 */
export default function SpaceTimeImmersive() {
  const containerRef = useRef(null);
  const avatarInputRef = useRef(null);
  /** @type {React.MutableRefObject<import('three').WebGLRenderer|null>} */
  const rendererRef = useRef(null);
  /** @type {React.MutableRefObject<(() => void | Promise<void>) | null>} */
  const pickAvatarHandlerRef = useRef(null);
  /** @type {React.MutableRefObject<{ reloadWalker?: (url: string) => Promise<void> } | null>} */
  const sceneApiRef = useRef(null);
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState(null);
  const [objectCount, setObjectCount] = useState(0);
  const [fabricLabel, setFabricLabel] = useState('');
  const [walkerLabel, setWalkerLabel] = useState('');
  const [walkDiag, setWalkDiag] = useState('');

  const fabricParam = searchParams.get('fabricUrl') || searchParams.get('fabric') || '';
  const walkerVrmParam = resolveSpacetimeWalkerVrmSource(searchParams);
  const merged = mergeSpatialFabricConfig({});
  const fabricUrl = fabricParam
    ? resolveBrowserReachableFabricUrl(fabricParam, merged)
    : buildSpaceTimeBrowserFabricUrl(merged);

  useEffect(() => {
    initNativeFaceBridge();
    if (isNativeFaceRelayEnabledInUrl()) {
      connectNativeFaceRelaySse();
    }
    const remoteLogOn =
      searchParams.get('remoteLog') === '1' ||
      searchParams.get('remoteLog') === 'true';
    if (remoteLogOn || import.meta.env.DEV) {
      try {
        localStorage.setItem('remoteLogEnabled', '1');
      } catch {
        /* ignore */
      }
      initRemoteLogClient();
    }
  }, [searchParams]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !fabricUrl) {
      setError('Missing fabric URL — set ?fabricUrl= or VITE_RP1_FABRIC_MSF_URL');
      setPhase('error');
      return undefined;
    }

    let cancelled = false;
    /** @type {THREE.WebGLRenderer|null} */
    let renderer = null;
    /** @type {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls|null} */
    let controls = null;
    /** @type {ReturnType<typeof snapshotSpacetimeDesktopView>|null} */
    let preXRView = null;
    /** Last in-XR capture — reused on re-enter so desktop orbit cannot drift the pose. */
    let persistedXrView = null;
    /** Rig-local avatar pose (fabric space) — never world coords while the locomotion rig is offset. */
    let persistedAvatar = null;
    let avatarRestorePending = false;
    let viewportAlignPending = false;
    let usedDefaultXrSpawn = false;
    let lastFrameTime = 0;
    let groundFollowPending = false;
    let fallReenterAlignPending = false;
    /** @type {import('@pixiv/three-vrm').VRM|null} */
    let walkerVrm = null;
    /** @type {SpacetimeXrInteraction|null} */
    let xrInteraction = null;
    /** @type {{ center: THREE.Vector3, size: THREE.Vector3 }|null} */
    let fabricBounds = null;
    /** @type {THREE.Group|null} */
    let playerRootRef = null;
    /** @type {THREE.PerspectiveCamera|null} */
    let cameraRef = null;

    /** @param {boolean} inXr */
    const placeWalkerForViewport = (inXr) => {
      const playerRoot = playerRootRef;
      const camera = cameraRef;
      if (!walkerVrm || !playerRoot || !camera) return;
      if (inXr) {
        return;
      }
      applySpacetimeDefaultAvatarSpawn(playerRoot, camera, fabricBounds, fabricRoot);
      const corridorDesktop = buildSpacetimeDefaultSpawnDesktopView(fabricBounds, fabricRoot);
      if (corridorDesktop && controls) {
        applySpacetimeDesktopViewFromXr(camera, controls, corridorDesktop);
        controls.update();
      }
    };

    (async () => {
      try {
        setFabricLabel(fabricUrl);
        const preflight = await preflightSpacetimeFabricUrl(fabricUrl);
        console.info('[spacetime-xr] fabric preflight ok', preflight);
        if (cancelled) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x202020);

        const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.001, 20000);
        cameraRef = camera;

        const floorAnchor = new THREE.Group();
        floorAnchor.name = 'SpacetimeFloorAnchor';
        scene.add(floorAnchor);

        const locomotionRig = new THREE.Group();
        locomotionRig.name = 'SpacetimeLocomotionRig';
        floorAnchor.add(locomotionRig);

        const fabricRoot = new THREE.Group();
        fabricRoot.name = 'SpacetimeFabricRoot';
        locomotionRig.add(fabricRoot);

        const grid = new THREE.GridHelper(40, 40, 0x555555, 0x333333);
        grid.name = 'SpacetimeFabricGrid';
        grid.position.y = 0;
        locomotionRig.add(grid);

        const playerRoot = new THREE.Group();
        playerRoot.name = 'SpacetimeWalkerRoot';
        playerRoot.visible = false;
        locomotionRig.add(playerRoot);
        playerRootRef = playerRoot;

        const { objectCount: count, bounds } = await loadFabricSceneIntoThree(scene, fabricRoot, fabricUrl);
        if (cancelled) return;
        setObjectCount(count);
        fabricBounds = bounds;
        const walkMeshCount = prepareSpacetimeWalkSurfaces(fabricRoot);
        const walkSummary = summarizeSpacetimeWalkSetup(fabricRoot, walkMeshCount);
        console.info('[spacetime-xr] walk collision setup', walkSummary);
        setWalkDiag(
          walkSummary.collisionReady
            ? `walk BVH: ${walkSummary.walkMeshCount} mesh(es) on ${walkSummary.walkRootName}`
            : 'walk collision NOT ready — missing capsule walk meshes',
        );
        if (!walkSummary.collisionReady) {
          console.warn('[spacetime-xr] no walk meshes — stadium edge clamp disabled');
        }

        if (walkerVrmParam) {
          try {
            const loaded = await loadSpacetimeWalkerVrm(playerRoot, walkerVrmParam);
            if (!cancelled && loaded?.vrm) {
              walkerVrm = loaded.vrm;
              setWalkerLabel(loaded.vrm.meta?.name || 'Your avatar');
            }
          } catch (walkerErr) {
            console.warn('[spacetime-xr] walker VRM failed', walkerErr);
            setWalkerLabel('');
          }
        }

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        rendererRef.current = renderer;
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType('bounded-floor');
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        container.appendChild(renderer.domElement);

        controls = createSpacetimeViewportControls(camera, renderer.domElement, bounds.center);
        frameCameraOnFabricBounds(camera, bounds, controls);

        xrInteraction = new SpacetimeXrInteraction({
          scene,
          renderer,
          locomotionRig,
          playerRoot,
          camera,
          getVrm: () => walkerVrm,
          onPickAvatar: () => {
            pickAvatarHandlerRef.current?.();
          },
        });

        if (walkerVrm) {
          placeWalkerForViewport(false);
        }

        sceneApiRef.current = {
          async reloadWalker(vrmUrl) {
            if (!vrmUrl || cancelled) return;
            try {
              disposeSpacetimeWalkerVrm(playerRoot);
              walkerVrm = null;
              playerRoot.visible = false;
              const loaded = await loadSpacetimeWalkerVrm(playerRoot, vrmUrl);
              if (cancelled || !loaded?.vrm) return;
              walkerVrm = loaded.vrm;
              playerRoot.visible = true;
              if (renderer?.xr?.isPresenting) {
                // Stay visible; XR tick / mode will place.
              } else {
                placeWalkerForViewport(false);
              }
              setWalkerLabel(loaded.vrm.meta?.name || 'Your avatar');
              console.info('[spacetime-xr] walker VRM hot-loaded', {
                name: loaded.vrm.meta?.name || 'avatar',
                xr: renderer?.xr?.isPresenting === true,
              });
            } catch (walkerErr) {
              console.warn('[spacetime-xr] walker hot-load failed', walkerErr);
              setWalkerLabel('');
            }
          },
        };

        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();

        createSpacetimeVrButton(renderer, container);

        renderer.xr.addEventListener('sessionstart', () => {
          resetSpacetimeFallOffMapTracking();
          const rawView = snapshotSpacetimeDesktopView(camera, controls);
          let resolved;
          if (shouldForceSpacetimeDefaultSpawnOnXrEnter()) {
            persistedXrView = null;
            persistedAvatar = null;
            const corridor = buildSpacetimeDefaultSpawnDesktopView(fabricBounds, fabricRoot);
            resolved = corridor
              ? { view: corridor, usedDefaultSpawn: true, source: 'fall-reenter' }
              : resolveSpacetimeXrEnterView(persistedXrView, rawView, fabricBounds, fabricRoot);
            fallReenterAlignPending = !!corridor;
          } else {
            resolved = resolveSpacetimeXrEnterView(
              persistedXrView,
              rawView,
              fabricBounds,
              fabricRoot,
            );
          }
          preXRView = resolved.view;
          usedDefaultXrSpawn = resolved.usedDefaultSpawn && !persistedAvatar;
          avatarRestorePending = !!persistedAvatar;
          viewportAlignPending = true;
          groundFollowPending = true;
          xrInteraction?.onSessionStart(renderer.xr.getSession());
          locomotionRig.position.set(0, 0, 0);
          locomotionRig.rotation.set(0, 0, 0);
          grid.visible = false;
          applySpacetimeFloorAnchor(floorAnchor, fabricRoot, { locomotorWalk: true });
          void upgradeSpacetimeReferenceSpace(renderer);
          if (controls) controls.enabled = false;
        });
        renderer.xr.addEventListener('sessionend', () => {
          const rawExitView =
            persistedXrView ||
            captureSpacetimeXrViewAsDesktop(camera, locomotionRig, preXRView);
          const resolvedExit = persistedXrView
            ? { view: cloneSpacetimeView(persistedXrView), usedDefaultSpawn: false }
            : resolveSpacetimeViewForScene(rawExitView, fabricBounds, fabricRoot);
          viewportAlignPending = false;
          groundFollowPending = false;
          usedDefaultXrSpawn = false;
          avatarRestorePending = false;
          resetSpacetimeFallOffMapTracking();

          // Capture rig-local avatar BEFORE zeroing the parent — world→local after
          // identity parent was teleporting the walker every exit.
          if (walkerVrm && playerRoot) {
            persistedAvatar = {
              x: playerRoot.position.x,
              y: playerRoot.position.y,
              z: playerRoot.position.z,
              rotY: playerRoot.rotation.y,
            };
          }

          xrInteraction?.onSessionEnd();
          resetSpacetimeFloorAnchor(floorAnchor);
          resetSpacetimeGroundFollowState(
            persistedAvatar ? persistedAvatar.y : null,
          );
          grid.visible = true;
          locomotionRig.position.set(0, 0, 0);
          locomotionRig.rotation.set(0, 0, 0);
          locomotionRig.updateMatrixWorld(true);

          if (persistedAvatar && playerRoot) {
            playerRoot.position.set(
              persistedAvatar.x,
              persistedAvatar.y,
              persistedAvatar.z,
            );
            playerRoot.rotation.set(0, persistedAvatar.rotY, 0);
            playerRoot.updateMatrixWorld(true);
          }

          if (resolvedExit.view) {
            persistedXrView = cloneSpacetimeView(resolvedExit.view);
            applySpacetimeDesktopViewFromXr(camera, controls, resolvedExit.view);
            console.info('[spacetime-xr] XR exit persisted view', {
              x: resolvedExit.view.position.x,
              z: resolvedExit.view.position.z,
              avatarX: persistedAvatar?.x,
              avatarZ: persistedAvatar?.z,
            });
          }
          if (controls) {
            controls.enabled = true;
            applySpacetimeInfiniteZoom(controls);
            controls.update();
          }
        });

        const onResize = () => {
          if (!renderer) return;
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', onResize);

        const tick = (time, frame) => {
          if (cancelled) return;
          const deltaSeconds = lastFrameTime
            ? Math.min(0.05, (time - lastFrameTime) / 1000)
            : 0.016;
          lastFrameTime = time;

          const xrPresenting = renderer?.xr?.isPresenting === true;

          if (frame && xrPresenting) {
            const referenceSpace = renderer.xr.getReferenceSpace();
            tickSpacetimeXrFace(walkerVrm, true, frame);
            tickSpacetimeWalkerVrm(walkerVrm, deltaSeconds);
            if (walkerVrm && (!xrInteraction || !xrInteraction.avatarView.isFirstPerson())) {
              tickSpacetimeWalkerGroundFollow(playerRoot, camera, fabricBounds);
            }
            if (viewportAlignPending && preXRView && referenceSpace) {
              const aligned = alignSpacetimeRigToViewport(
                locomotionRig,
                camera,
                preXRView,
                frame,
                referenceSpace,
              );
              if (aligned) viewportAlignPending = false;
            }

            if (usedDefaultXrSpawn && walkerVrm && !viewportAlignPending) {
              applySpacetimeDefaultAvatarSpawn(playerRoot, camera, fabricBounds, fabricRoot);
              usedDefaultXrSpawn = false;
            }

            if (avatarRestorePending && persistedAvatar && playerRoot && !viewportAlignPending) {
              playerRoot.position.set(
                persistedAvatar.x,
                persistedAvatar.y,
                persistedAvatar.z,
              );
              playerRoot.rotation.set(0, persistedAvatar.rotY, 0);
              playerRoot.updateMatrixWorld(true);
              avatarRestorePending = false;
              console.info('[spacetime-xr] XR enter restored avatar', persistedAvatar);
            }

            if (fallReenterAlignPending && !viewportAlignPending) {
              clearSpacetimeFallOffMapReenter();
              fallReenterAlignPending = false;
            }

            // Re-enter with a persisted pose: do not shove the rig via ground-follow
            // (camera XZ was headset-origin and pulled Y to the wrong surface).
            if (
              groundFollowPending &&
              !viewportAlignPending &&
              !persistedXrView
            ) {
              const surfaceY = followSpacetimeWalkSurfaceY(locomotionRig, camera);
              groundFollowPending = false;
              console.info('[spacetime-xr] initial ground follow', { surfaceY });
            } else if (groundFollowPending && !viewportAlignPending) {
              groundFollowPending = false;
              console.info('[spacetime-xr] initial ground follow skipped (persisted pose)');
            }

            const session = renderer.xr.getSession();
            if (session && xrInteraction) {
              xrInteraction.update(
                deltaSeconds,
                frame,
                referenceSpace,
                Array.from(session.inputSources || []),
              );
            }

            if (tickSpacetimeFallOffMapDetection(camera, fabricBounds, deltaSeconds)) {
              const spawnView = applySpacetimeXrCorridorRespawn({
                locomotionRig,
                camera,
                playerRoot,
                fabricBounds,
                fabricRoot,
                frame,
                referenceSpace,
              });
              if (spawnView) {
                preXRView = {
                  position: spawnView.position.clone(),
                  quaternion: spawnView.quaternion.clone(),
                  target: spawnView.target.clone(),
                  zoom: spawnView.zoom,
                };
                persistedXrView = cloneSpacetimeView(preXRView);
                viewportAlignPending = false;
                groundFollowPending = false;
              }
            }

            if (!viewportAlignPending) {
              const live = captureSpacetimeXrViewAsDesktop(
                camera,
                locomotionRig,
                persistedXrView || preXRView,
              );
              if (live?.position) {
                persistedXrView = cloneSpacetimeView(live);
              }
              if (walkerVrm && playerRoot) {
                persistedAvatar = {
                  x: playerRoot.position.x,
                  y: playerRoot.position.y,
                  z: playerRoot.position.z,
                  rotY: playerRoot.rotation.y,
                };
              }
            }
          } else {
            tickSpacetimeXrFace(walkerVrm, false);
            tickSpacetimeWalkerVrm(walkerVrm, deltaSeconds);
            if (walkerVrm) {
              tickSpacetimeWalkerGroundFollow(playerRoot, camera, fabricBounds);
            }
            applySpacetimeInfiniteZoom(controls);
            updateGamepadViewportControls(controls, deltaSeconds, {
              camera,
              eyeToFloor: 1.6,
            });
            controls?.update();
          }

          renderer.render(scene, camera);
        };

        renderer.setAnimationLoop(tick);
        setPhase('ready');

        return () => {
          window.removeEventListener('resize', onResize);
          sceneApiRef.current = null;
          disposeSpacetimeWalkerVrm(playerRoot);
        };
      } catch (err) {
        if (!cancelled) {
          console.error('[spacetime-xr]', err);
          setError(err?.message || String(err));
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      sceneApiRef.current = null;
      resetSpacetimeWalkSurfaces();
      xrInteraction?.modeHud?.dispose?.();
      controls?.dispose();
      if (renderer) {
        renderer.setAnimationLoop(null);
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      }
      rendererRef.current = null;
      const vr = container.querySelector('.spacetime-xr-vr-btn');
      if (vr) vr.remove();
    };
  }, [fabricUrl]);

  const copyGalaxyUrl = useCallback(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({
      nativeFaceRelay: '1',
      remoteLog: '1',
      fabricUrl,
    });
    if (walkerVrmParam || walkerLabel) {
      params.set('useMainAvatar', '1');
    }
    const url = `${origin}/spacetime-xr?${params.toString()}`;
    navigator.clipboard?.writeText(url);
  }, [fabricUrl, walkerVrmParam, walkerLabel]);

  const applyPickedWalkerFile = useCallback(async (file, reenterXr = false) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.vrm')) {
      alert('Please choose a .vrm avatar file.');
      return;
    }
    const vrmUrl = rememberSpacetimeWalkerVrm(file);
    if (vrmUrl && sceneApiRef.current?.reloadWalker) {
      await sceneApiRef.current.reloadWalker(vrmUrl);
    }
    if (reenterXr) {
      await reenterSpacetimeVr(rendererRef.current);
    }
  }, []);

  const onPickWalkerAvatar = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    await applyPickedWalkerFile(file, false);
  }, [applyPickedWalkerFile]);

  useEffect(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vrm';
    input.style.display = 'none';
    input.addEventListener('change', onPickWalkerAvatar);
    document.body.appendChild(input);
    avatarInputRef.current = input;

    return () => {
      input.removeEventListener('change', onPickWalkerAvatar);
      input.remove();
      if (avatarInputRef.current === input) {
        avatarInputRef.current = null;
      }
    };
  }, [onPickWalkerAvatar]);

  const pickWalkerAvatarFromDevice = useCallback(async () => {
    const input = avatarInputRef.current;
    const renderer = rendererRef.current;
    if (!input) return;
    const { wasInXr, file } = await openSpacetimeXrFilePicker(renderer, input);
    await applyPickedWalkerFile(file, wasInXr);
  }, [applyPickedWalkerFile]);

  pickAvatarHandlerRef.current = pickWalkerAvatarFromDevice;

  return (
    <div className="spacetime-xr-page">
      <header className="spacetime-xr-hud">
        <Link to="/" className="spacetime-xr-back">
          ← OpenNexus 3D
        </Link>
        <span className="spacetime-xr-title">Space-Time XR</span>
        <button type="button" className="spacetime-xr-copy" onClick={copyGalaxyUrl}>
          Copy Galaxy URL
        </button>
        <button
          type="button"
          className="spacetime-xr-copy"
          onClick={pickWalkerAvatarFromDevice}
        >
          Pick avatar
        </button>
      </header>

      {phase === 'loading' && (
        <div className="spacetime-xr-status">Loading fabric scene…</div>
      )}
      {phase === 'error' && (
        <div className="spacetime-xr-status spacetime-xr-error">{error}</div>
      )}
      {phase === 'ready' && (
        <div className="spacetime-xr-status">
          {objectCount} object(s)
          {walkerLabel ? ` · walker: ${walkerLabel}` : ' · no walker — Pick avatar or Import on OpenNexus 3D then use ?useMainAvatar=1'}
          {walkDiag ? ` · ${walkDiag}` : ''}
          {' · '}
          mouse / trigger+grip navigate · Enter VR · left stick walk · right stick turn · ground follow · face relay{' '}
          {isNativeFaceRelayEnabledInUrl() ? 'on' : 'off (add ?nativeFaceRelay=1)'}
        </div>
      )}

      <div ref={containerRef} className="spacetime-xr-canvas-host" />

      <footer className="spacetime-xr-help">
        <p>
          2D: scroll/pinch zoom, drag orbit, grip+stick pan, trigger+stick rotate, stick Y zoom (controller). Galaxy XR: open copied URL in Chrome. Fabric:{' '}
          <code>{fabricLabel}</code>
        </p>
      </footer>
    </div>
  );
}
