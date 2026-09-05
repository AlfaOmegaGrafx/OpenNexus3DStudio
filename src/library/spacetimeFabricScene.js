/**
 * Load published MSF fabric scenes into Three.js (WebXR Space-Time immersive path).
 * Parses unsigned fabric JSON from GET /fabric/sneeze.msf?root=N.
 * Transforms match Scene Assembler — no global recenter / floor shift.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { normalizeSpaceTimeFabricUrl } from './spatialFabricAdapter.js';

const loader = new GLTFLoader();
loader.setCrossOrigin('anonymous');
try {
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
} catch {
  /* optional */
}

/** @param {unknown} node */
function readTransform(node) {
  const sneeze = node?.Transform;
  const sa = node?.pTransform;
  const t = sneeze || sa || null;
  if (!t) return null;
  const pos = t.Position || t.aPosition;
  const rot = t.Rotation || t.aRotation;
  const scale = t.Scale || t.aScale;
  return {
    pos,
    rot,
    scale,
    /** sneeze.msf exports Sneeze Z-up; Scene Assembler JSON is already Y-up */
    space: sneeze ? 'sneeze-zup' : 'y-up',
  };
}

/**
 * Inverse of MSF_Map_Svc mapbase.#YupToZupPos — fabric → Three.js Y-up.
 * @param {number[]} pos
 */
export function fabricZupPositionToYup(pos) {
  if (!pos || pos.length < 3) return [0, 0, 0];
  return [pos[0], pos[2], -pos[1]];
}

/**
 * Inverse of MSF_Map_Svc mapbase.#YupToZupScale.
 * @param {number[]} scale
 */
export function fabricZupScaleToYup(scale) {
  if (!scale || scale.length < 3) return [1, 1, 1];
  return [scale[0], scale[2], scale[1]];
}

/** @param {unknown} node */
function readResourceRef(node) {
  const r = node?.Resource || node?.pResource;
  const ref = r?.sReference || r?.reference || '';
  return typeof ref === 'string' ? ref.trim() : '';
}

/**
 * @param {unknown} root
 * @returns {Array<{ name: string, reference: string, transform: ReturnType<typeof readTransform> }>}
 */
export function flattenFabricSceneNodes(root) {
  /** @type {Array<{ name: string, reference: string, transform: ReturnType<typeof readTransform> }>} */
  const out = [];

  /** @param {unknown} node */
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    const reference = readResourceRef(node);
    const name = node.Name || node.sName || reference || 'Object';
    if (reference) {
      out.push({ name: String(name), reference, transform: readTransform(node) });
    }
    const kids = node.aChildren;
    if (Array.isArray(kids)) {
      for (const child of kids) walk(child);
    }
  }

  if (root?.Data?.Scene) walk(root.Data.Scene);
  else if (root?.Scene) walk(root.Scene);
  else walk(root);
  return out;
}

/**
 * @param {string} fabricUrl
 */
export async function fetchFabricDocument(fabricUrl) {
  const url = normalizeSpaceTimeFabricUrl(fabricUrl);
  const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) {
    throw new Error(`Fabric fetch failed (${res.status}): ${url}`);
  }
  return res.json();
}

/** @param {THREE.Mesh} mesh */
function ensureMeshVertexNormals(mesh) {
  const geo = mesh.geometry;
  if (!geo) return;
  if (!geo.attributes.normal) {
    geo.computeVertexNormals();
    return;
  }
  const n = geo.attributes.normal.array;
  for (let i = 0; i < n.length; i += 3) {
    if (n[i] !== 0 || n[i + 1] !== 0 || n[i + 2] !== 0) return;
  }
  geo.computeVertexNormals();
}

/**
 * PBR + texture prep — matches Scene Assembler / OpenNexus viewport (no IBL required).
 * @param {THREE.Object3D} root
 */
export function applySpacetimePbrMaterialFix(root) {
  if (!root || typeof root.traverse !== 'function') return 0;

  let nFixed = 0;
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    ensureMeshVertexNormals(child);

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (
        !material?.isMeshStandardMaterial &&
        !material?.isMeshPhysicalMaterial &&
        typeof material.metalness !== 'number'
      ) {
        continue;
      }

      const mrTex = material.metalnessMap || material.roughnessMap;
      material.metalnessMap = null;
      material.metalness = 0;
      material.aoMap = null;
      material.envMap = null;

      if (mrTex) {
        material.roughnessMap = mrTex;
        material.roughness = 1.0;
      } else if (material.map) {
        material.roughness = Math.min(Math.max(Number(material.roughness) || 0.5, 0.35), 0.78);
      } else {
        material.roughness = Math.max(Number(material.roughness) || 0, 0.35);
      }

      const mapKeys = ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'aoMap'];
      for (const key of mapKeys) {
        const tex = material[key];
        if (!tex) continue;
        tex.colorSpace =
          key === 'map' || key === 'emissiveMap'
            ? THREE.SRGBColorSpace
            : THREE.LinearSRGBColorSpace;
        tex.flipY = true;
        tex.needsUpdate = true;
      }

      if (material.map && material.color) {
        material.color.setRGB(1, 1, 1);
      }

      if (child.isSkinnedMesh) material.skinning = true;
      material.side = THREE.FrontSide;

      if (material.emissive) {
        material.emissive.r = Math.min(material.emissive.r, 0.35);
        material.emissive.g = Math.min(material.emissive.g, 0.35);
        material.emissive.b = Math.min(material.emissive.b, 0.35);
      }

      material.needsUpdate = true;
      nFixed += 1;
    }
  });

  if (nFixed > 0) {
    console.info('[spacetime-fabric] PBR material fix applied to', nFixed, 'material(s)');
  }
  return nFixed;
}

/** Clone mesh materials so cached GLTF nodes are not shared. @param {THREE.Object3D} root */
function cloneModelMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((mat) => mat?.clone?.() ?? mat);
    } else if (child.material.clone) {
      child.material = child.material.clone();
    }
  });
}

/**
 * @param {string} reference
 * @param {string} [fabricRootUrl]
 */
export function resolveFabricAssetUrl(reference, fabricRootUrl = '') {
  if (!reference) return '';
  let resolved = reference;
  if (!/^https?:\/\//i.test(reference)) {
    try {
      const base = fabricRootUrl.replace(/\/fabric\/[^/]*$/i, '');
      resolved = new URL(reference, `${base}/`).href;
    } catch {
      resolved = reference;
    }
  }
  try {
    const fabricBase = new URL(fabricRootUrl.replace(/\?.*$/, ''));
    const assetU = new URL(resolved);
    if (assetU.origin !== fabricBase.origin) {
      return `${fabricBase.origin}${assetU.pathname}${assetU.search}`;
    }
  } catch {
    /* keep resolved */
  }
  return resolved;
}

/**
 * Bounds for camera framing — does not move objects (Scene Assembler parity).
 * @param {THREE.Object3D} rootGroup
 * @param {{ excludeNames?: string[] }} [opts]
 */
export function computeFabricSceneBounds(rootGroup, opts = {}) {
  const exclude = new Set(opts.excludeNames || ['SpacetimeFabricGrid']);
  rootGroup.updateMatrixWorld(true);
  const box = new THREE.Box3();
  rootGroup.traverse((child) => {
    if (exclude.has(child.name)) return;
    if (child.isMesh) box.expandByObject(child);
  });
  if (box.isEmpty()) {
    box.setFromObject(rootGroup);
  }
  return {
    center: box.getCenter(new THREE.Vector3()),
    size: box.getSize(new THREE.Vector3()),
    min: box.min.clone(),
    max: box.max.clone(),
    box,
  };
}

/** @deprecated Use computeFabricSceneBounds — kept so tests stay stable. */
export function alignFabricSceneGroupToFloor(rootGroup) {
  return computeFabricSceneBounds(rootGroup);
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Group} rootGroup
 * @param {string} fabricUrl
 */
export async function loadFabricSceneIntoThree(scene, rootGroup, fabricUrl) {
  const doc = await fetchFabricDocument(fabricUrl);
  const nodes = flattenFabricSceneNodes(doc);
  const fabricRoot = fabricUrl.replace(/\?.*$/, '');

  const primary = doc?.Primary || doc?.Data?.Primary;
  if (primary?.Background) {
    const hex = String(primary.Background).replace(/^0x/i, '#');
    scene.background = new THREE.Color(hex);
  }

  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 0.85));
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.DirectionalLight(0xfff8f0, 1.8);
  key.position.set(5, 12, 7);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.75);
  fill.position.set(-6, 5, -5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xcfe8ff, 0.35);
  rim.position.set(0, 3, -8);
  scene.add(rim);

  /** @type {THREE.Object3D[]} */
  const loaded = [];

  const loadNode = async (node) => {
    const assetUrl = resolveFabricAssetUrl(node.reference, fabricRoot);
    if (!assetUrl) return null;
    try {
      const gltf = await loader.loadAsync(assetUrl);
      const model = gltf.scene;
      model.name = node.name;
      cloneModelMaterials(model);
      applySpacetimePbrMaterialFix(model);

      const tr = node.transform;
      let pos = tr?.pos;
      let scl = tr?.scale;
      if (tr?.space === 'sneeze-zup') {
        if (pos?.length >= 3) pos = fabricZupPositionToYup(pos);
        if (scl?.length >= 3) scl = fabricZupScaleToYup(scl);
      }
      if (pos?.length >= 3) {
        model.position.set(pos[0], pos[1], pos[2]);
      }
      if (tr?.rot?.length >= 4) {
        model.quaternion.set(tr.rot[0], tr.rot[1], tr.rot[2], tr.rot[3]);
      }
      if (scl?.length >= 3) {
        model.scale.set(scl[0], scl[1], scl[2]);
      }

      rootGroup.add(model);
      console.info(
        '[spacetime-fabric] loaded',
        node.name,
        model.position.toArray().map((v) => v.toFixed(3)),
        assetUrl,
      );
      return model;
    } catch (err) {
      console.warn('[spacetime-fabric] failed to load', node.name, assetUrl, err);
      return null;
    }
  };

  const results = await Promise.allSettled(nodes.map((node) => loadNode(node)));
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      loaded.push(result.value);
    }
  }

  if (loaded.length === 0) {
    throw new Error('No fabric objects loaded — check MSF proxy :8453 and /objects/*.glb URLs');
  }

  const bounds = computeFabricSceneBounds(rootGroup);

  return { doc, nodes, loaded, objectCount: loaded.length, bounds };
}
