/**
 * Load World Packages into an IWSDK World for Galaxy XR exploration.
 *
 * Interaction model (IWSDK + headset patches in iwsdkXrEnhancements.js):
 * - Environment splat: Spark.js visual only — NOT grabbable
 * - Mesh props: DistanceGrabbable (ray + trigger) + OneHandGrabbable (proximity + grip)
 * - Optional collider GLB: LocomotionEnvironment for walk/teleport
 *
 * @see docs/WORLD_PACKAGE.md
 */
import {
  DistanceGrabbable,
  LocomotionEnvironment,
  MovementMode,
  OneHandGrabbable,
} from '@iwsdk/core';
import { EnvironmentType } from '@iwsdk/locomotor';
import { resolveTaskModelUrl } from './taskModelUrl.js';
import { getWorldManifestUrlFromTaskResult } from './worldPackage.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, Vector3 } from 'three';
import {
  applySplatOrientationCorrection,
  disposeSplatMesh,
  ensureSparkRenderer,
  loadSplatMesh,
} from './sparkSplatManager.js';
import {
  applyWorldTransform,
  anchorObjectBottomToFloor,
  isIdentityWorldRotation,
  orientWorldPropFeetDown,
} from './worldSceneLoader.js';
import {
  fetchWorldPackage,
  parseWorldPackage,
  resolveWorldPackageUrls,
} from './worldPackage.js';

/** @type {WeakMap<import('@iwsdk/core').World, { splat: object|null, propEntities: object[], colliderEntity: object|null }>} */
const worldContentByWorld = new WeakMap();

/**
 * Galaxy XR grab components — same scheme as the demo cube in iwsdkWorld.js.
 *
 * @param {import('@iwsdk/core').World} world
 * @param {import('three').Object3D} mesh
 * @param {object} [options]
 * @returns {import('@iwsdk/core').Entity}
 */
export function attachIwsdkGrabbableProp(world, mesh, options = {}) {
  const parent = world.activeLevel?.value ?? world.sceneEntity;
  const entity = world.createTransformEntity(mesh, { parent });

  if (options.interaction?.type === 'static') {
    return entity;
  }

  entity.addComponent(DistanceGrabbable, {
    movementMode: MovementMode.MoveTowardsTarget,
    rotate: options.rotate !== false,
    translate: options.translate !== false,
    targetPositionOffset: options.targetPositionOffset ?? [0, 0, -0.35],
  });
  entity.addComponent(OneHandGrabbable, {
    rotate: options.rotate !== false,
    translate: options.translate !== false,
  });

  return entity;
}

/**
 * @param {import('@iwsdk/core').World} world
 */
function ensureSparkOnIwsdkRenderer(world) {
  const sceneManagerShim = {
    renderer: world.renderer,
    scene: world.scene,
    sparkRenderer: world.__sparkRenderer ?? null,
  };
  ensureSparkRenderer(sceneManagerShim);
  world.__sparkRenderer = sceneManagerShim.sparkRenderer;
}

/**
 * Environment splat — visual layer only (no DistanceGrabbable).
 *
 * @param {import('@iwsdk/core').World} world
 * @param {string} url
 * @param {object} [options]
 */
export async function loadIwsdkEnvironmentSplat(world, url, options = {}) {
  ensureSparkOnIwsdkRenderer(world);
  const state = getWorldContentState(world);
  if (state.splat) {
    disposeSplatMesh(state.splat);
    world.scene.remove(state.splat);
    state.splat = null;
  }

  const sceneManagerShim = {
    renderer: world.renderer,
    scene: world.scene,
    sparkRenderer: world.__sparkRenderer,
  };
  const splat = await loadSplatMesh(sceneManagerShim, url, {
    fromAigc: true,
    orientationMode: 'none',
  });
  splat.userData.isWorldEnvironment = true;
  splat.name = 'WorldEnvironmentSplat';
  applyWorldTransform(splat, options.transform);
  if (
    options.coordinateSystem === 'z-up' &&
    isIdentityWorldRotation(options.transform?.rotation)
  ) {
    applySplatOrientationCorrection(splat, 'z-up-to-y-up');
  }
  anchorObjectBottomToFloor(splat);
  world.scene.add(splat);
  state.splat = splat;
  return splat;
}

/**
 * Optional collision mesh for locomotion (World Labs collider or proxy floor).
 *
 * @param {import('@iwsdk/core').World} world
 * @param {import('three').Object3D} root
 */
export function attachIwsdkLocomotionCollider(world, root) {
  const parent = world.activeLevel?.value ?? world.sceneEntity;
  const state = getWorldContentState(world);
  if (state.colliderEntity) {
    try {
      state.colliderEntity.dispose?.();
    } catch {
      /* best effort */
    }
    state.colliderEntity = null;
  }
  const entity = world.createTransformEntity(root, { parent });
  entity.addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
  state.colliderEntity = entity;
  return entity;
}

/**
 * @param {import('@iwsdk/core').World} world
 * @param {string} glbUrl
 */
export async function loadIwsdkColliderGlb(world, glbUrl) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(glbUrl);
  const root = gltf.scene || gltf;
  root.name = 'WorldLocomotionCollider';
  anchorObjectBottomToFloor(root);
  return attachIwsdkLocomotionCollider(world, root);
}

/**
 * @param {import('@iwsdk/core').World} world
 */
function getWorldContentState(world) {
  let state = worldContentByWorld.get(world);
  if (!state) {
    state = { splat: null, propEntities: [], colliderEntity: null, manifest: null };
    worldContentByWorld.set(world, state);
  }
  return state;
}

/**
 * @param {import('@iwsdk/core').World} world
 */
export function clearIwsdkWorldContent(world) {
  const state = worldContentByWorld.get(world);
  if (!state) return;

  if (state.splat) {
    disposeSplatMesh(state.splat);
    world.scene.remove(state.splat);
    state.splat = null;
  }

  for (const entity of state.propEntities) {
    try {
      entity.dispose?.();
    } catch {
      /* best effort */
    }
  }
  state.propEntities = [];

  if (state.colliderEntity) {
    try {
      state.colliderEntity.dispose?.();
    } catch {
      /* best effort */
    }
    state.colliderEntity = null;
  }

  state.manifest = null;
}

/**
 * Apply spawn from manifest (camera / player start).
 *
 * @param {import('@iwsdk/core').World} world
 * @param {object} spawn
 */
export function applyIwsdkWorldSpawn(world, spawn) {
  if (!spawn?.position || !world.camera) return;
  const [x, y, z] = spawn.position;
  const height = spawn.player_height ?? 1.6;
  world.camera.position.set(x, y + height, z + 2.5);
  if (world.player?.head) {
    world.player.head.position.set(x, y + height, z);
  }
}

/**
 * Load a full world package into IWSDK (splat env + grabbable props).
 *
 * @param {import('@iwsdk/core').World} world
 * @param {object} manifest parsed world package
 * @param {string} manifestUrl
 * @param {object} [options]
 */
export async function loadIwsdkWorldPackage(world, manifest, manifestUrl, options = {}) {
  const resolved = resolveWorldPackageUrls(manifest, manifestUrl, options.apiEndpoint ?? '', {
    worldBaseUrl: options.worldBaseUrl,
  });

  clearIwsdkWorldContent(world);
  const state = getWorldContentState(world);
  state.manifest = resolved;

  if (resolved.environment?.url) {
    await loadIwsdkEnvironmentSplat(world, resolved.environment.url, {
      transform: resolved.environment.transform,
      coordinateSystem: resolved.coordinate_system || 'y-up',
    });
  }

  const colliderUrl =
    resolved.environment?.collider_url ||
    resolved.environment?.collision_mesh_url ||
    null;
  if (colliderUrl) {
    try {
      await loadIwsdkColliderGlb(world, colliderUrl);
    } catch (err) {
      console.warn('[IwsdkWorld] Collider mesh failed:', err?.message || err);
    }
  }

  const loader = new GLTFLoader();
  const parent = world.activeLevel?.value ?? world.sceneEntity;

  for (const prop of resolved.props) {
    if (prop.role === 'static' && !prop.mesh_url) continue;
    try {
      const gltf = await loader.loadAsync(prop.mesh_url);
      const root = gltf.scene || gltf;
      root.name = `WorldProp_${prop.id}`;

      if (prop.transform) {
        applyWorldTransform(root, prop.transform);
      }
      orientWorldPropFeetDown(root);

      root.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const interactable = prop.interaction?.type !== 'static';
      const entity = interactable
        ? attachIwsdkGrabbableProp(world, root, {
            interaction: prop.interaction,
          })
        : world.createTransformEntity(root, { parent });

      state.propEntities.push(entity);
    } catch (err) {
      console.warn(`[IwsdkWorld] Prop "${prop.id}" failed:`, err?.message || err);
    }
  }

  applyIwsdkWorldSpawn(world, resolved.spawn);

  const box = new Box3();
  for (const entity of state.propEntities) {
    const obj = entity.object3D ?? entity.object;
    if (obj) box.expandByObject(obj);
  }
  if (state.splat) box.expandByObject(state.splat);

  console.log('[IwsdkWorld] Loaded', {
    id: resolved.id,
    props: state.propEntities.length,
    hasSplat: !!state.splat,
    bounds: box.isEmpty() ? null : box.getSize(new Vector3()),
  });

  return resolved;
}

/**
 * @param {import('@iwsdk/core').World} world
 * @param {string} manifestUrl
 * @param {object} [options]
 */
export async function loadIwsdkWorldFromManifestUrl(world, manifestUrl, options = {}) {
  const manifest = await fetchWorldPackage(manifestUrl);
  return loadIwsdkWorldPackage(world, manifest, manifestUrl, options);
}

/**
 * @param {import('@iwsdk/core').World} world
 * @param {object} taskResult
 * @param {string} [apiEndpoint]
 */
export async function loadIwsdkWorldFromTaskResult(world, taskResult, apiEndpoint = '') {
  const manifestPath = getWorldManifestUrlFromTaskResult(taskResult);
  if (!manifestPath) {
    throw new Error('No world manifest in task result');
  }
  const manifestUrl = resolveTaskModelUrl(manifestPath, apiEndpoint);
  const worldBaseUrl = taskResult?.world_base_url || taskResult?.result?.world_base_url;
  return loadIwsdkWorldFromManifestUrl(world, manifestUrl, {
    apiEndpoint,
    worldBaseUrl: worldBaseUrl ? resolveTaskModelUrl(worldBaseUrl, apiEndpoint) : undefined,
  });
}

/**
 * Import a folder-style package from inline manifest JSON (image-blaster / manual drop).
 *
 * @param {import('@iwsdk/core').World} world
 * @param {object} manifestJson
 * @param {string} baseUrl directory URL for relative assets
 */
export async function loadIwsdkWorldFromJson(world, manifestJson, baseUrl) {
  const manifest = parseWorldPackage(manifestJson);
  return loadIwsdkWorldPackage(world, manifest, baseUrl);
}

/**
 * Build `/xr` URL for Galaxy XR IWSDK exploration (ray + trigger / grip squeeze grab).
 *
 * @param {string} manifestUrl
 * @param {object} [extra]
 */
export function buildIwsdkXrExploreUrl(manifestUrl, extra = {}) {
  const params = new URLSearchParams();
  params.set('worldManifest', manifestUrl);
  if (extra.apiEndpoint) {
    params.set('apiEndpoint', extra.apiEndpoint);
  }
  if (extra.skipDemo) {
    params.set('skipDemo', '1');
  }
  return `/xr?${params.toString()}`;
}
