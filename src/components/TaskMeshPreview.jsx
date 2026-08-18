import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { get3daigcAuthHeaders } from '../library/taskManager.js';
import { resolveTaskModelUrl } from '../library/taskModelUrl.js';
import {
  getBoneDisplayWorldPosition,
  getPrimarySkeletonBones,
  getSkeletonJointSphereRadius,
} from '../library/rigBoneUtils.js';
import './TaskMeshPreview.css';

/**
 * Compact OrbitControls GLB preview for Task Manager / Studio.
 *
 * @param {object} props
 * @param {string|null} [props.meshUrl]
 * @param {string} [props.apiEndpoint]
 * @param {boolean} [props.autoLoad3d]
 * @param {boolean} [props.showBones] Controlled bone overlay visibility
 * @param {boolean} [props.boneToggle] Show Bones checkbox
 * @param {boolean} [props.defaultShowBones]
 * @param {string} [props.className]
 * @param {string} [props.label]
 */
export default function TaskMeshPreview({
  meshUrl,
  apiEndpoint,
  autoLoad3d = true,
  showBones,
  boneToggle = false,
  defaultShowBones = false,
  className = '',
  label = '',
}) {
  const hostRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [meshStatus, setMeshStatus] = useState('idle');
  const [meshError, setMeshError] = useState(null);
  const [bonesOn, setBonesOn] = useState(
    typeof showBones === 'boolean' ? showBones : defaultShowBones,
  );

  useEffect(() => {
    if (typeof showBones === 'boolean') {
      setBonesOn(showBones);
    }
  }, [showBones]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin: '80px', threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const shouldLoad = Boolean(autoLoad3d && meshUrl && inView);
  const effectiveBones = boneToggle ? bonesOn : Boolean(showBones);

  return (
    <div
      ref={hostRef}
      className={`task-mesh-preview ${className}`.trim()}
      onClick={(e) => e.stopPropagation()}
    >
      {(label || boneToggle) && (
        <div className="task-mesh-preview-toolbar">
          {label ? <span className="task-mesh-preview-label">{label}</span> : <span />}
          {boneToggle ? (
            <label className="task-mesh-preview-bone-toggle">
              <input
                type="checkbox"
                checked={bonesOn}
                onChange={(e) => setBonesOn(e.target.checked)}
              />
              Bones
            </label>
          ) : null}
        </div>
      )}
      {!meshUrl ? (
        <div className="task-mesh-preview-hint">Preview unavailable</div>
      ) : !shouldLoad ? (
        <div className="task-mesh-preview-hint">Waiting for preview…</div>
      ) : (
        <>
          <TaskMeshOrbitCanvas
            meshUrl={meshUrl}
            apiEndpoint={apiEndpoint}
            showBones={effectiveBones}
            onStatus={setMeshStatus}
            onError={setMeshError}
          />
          {meshStatus === 'loading' ? (
            <div className="task-mesh-preview-hint">Loading 3D…</div>
          ) : null}
          {meshError ? (
            <div className="task-mesh-preview-hint task-mesh-preview-hint--error">{meshError}</div>
          ) : null}
        </>
      )}
    </div>
  );
}

function frameObject(camera, controls, object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return false;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  const fov = (camera.fov * Math.PI) / 180;
  const distance = Math.max((maxDim / (2 * Math.tan(fov / 2))) * 1.45, maxDim * 0.9);
  const dir = new THREE.Vector3(1.05, 0.65, 1.15).normalize();
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(distance / 200, 0.001);
  camera.far = Math.max(distance * 40, maxDim * 40, 50);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
  return true;
}

function brightenMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      if ('envMapIntensity' in mat) mat.envMapIntensity = Math.max(mat.envMapIntensity || 0, 1);
      if ('metalness' in mat && typeof mat.metalness === 'number') {
        mat.metalness = Math.min(mat.metalness, 0.35);
      }
      if ('roughness' in mat && typeof mat.roughness === 'number') {
        mat.roughness = Math.max(mat.roughness, 0.45);
      }
      mat.needsUpdate = true;
    }
  });
}

function setMeshOpacity(root, opacity) {
  if (!root) return;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (mat.userData.__previewBaseOpacity == null) {
        mat.userData.__previewBaseOpacity = mat.opacity ?? 1;
        mat.userData.__previewBaseTransparent = Boolean(mat.transparent);
      }
      const base = mat.userData.__previewBaseOpacity;
      mat.transparent = opacity < 0.999 || mat.userData.__previewBaseTransparent;
      mat.opacity = base * opacity;
      mat.depthWrite = opacity > 0.85;
      mat.needsUpdate = true;
    }
  });
}

/**
 * Build orange joint spheres + bone lines (lightweight SkeletonHelper-style overlay).
 * @param {THREE.Object3D} modelRoot
 * @returns {THREE.Group|null}
 */
export function buildBoneOverlay(modelRoot) {
  const bones = getPrimarySkeletonBones(modelRoot);
  if (!bones.length) return null;

  const group = new THREE.Group();
  group.name = 'TaskMeshBoneOverlay';

  const radius = Math.max(getSkeletonJointSphereRadius() * 1.4, 0.008);
  const sphereGeo = new THREE.SphereGeometry(radius, 8, 8);
  const jointMat = new THREE.MeshBasicMaterial({
    color: 0xff8c2a,
    depthTest: false,
    transparent: true,
    opacity: 0.95,
  });
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xffc078,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });

  const boneSet = new Set(bones);
  const positions = new Map();
  const tmp = new THREE.Vector3();

  for (const bone of bones) {
    getBoneDisplayWorldPosition(bone, modelRoot, tmp);
    const local = modelRoot.worldToLocal(tmp.clone());
    positions.set(bone, local);

    const joint = new THREE.Mesh(sphereGeo, jointMat);
    joint.position.copy(local);
    joint.renderOrder = 10;
    group.add(joint);
  }

  const linePositions = [];
  for (const bone of bones) {
    const parent = bone.parent;
    if (!parent?.isBone || !boneSet.has(parent)) continue;
    const a = positions.get(parent);
    const b = positions.get(bone);
    if (!a || !b) continue;
    linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  if (linePositions.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lines = new THREE.LineSegments(geo, lineMat);
    lines.renderOrder = 9;
    group.add(lines);
  }

  return group;
}

function TaskMeshOrbitCanvas({ meshUrl, apiEndpoint, showBones, onStatus, onError }) {
  const mountRef = useRef(null);
  const onStatusRef = useRef(onStatus);
  const onErrorRef = useRef(onError);
  const showBonesRef = useRef(showBones);
  const rootRef = useRef(null);
  const boneOverlayRef = useRef(null);
  onStatusRef.current = onStatus;
  onErrorRef.current = onError;
  showBonesRef.current = showBones;

  const applyBonesVisibility = (root, overlay, visible) => {
    if (overlay) overlay.visible = Boolean(visible);
    setMeshOpacity(root, visible ? 0.35 : 1);
  };

  useEffect(() => {
    const root = rootRef.current;
    const overlay = boneOverlayRef.current;
    if (!root) return;
    applyBonesVisibility(root, overlay, showBones);
  }, [showBones]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !meshUrl) return undefined;

    let cancelled = false;
    let animationId = 0;
    let renderer = null;
    let controls = null;
    let root = null;
    let boneOverlay = null;
    let resizeObserver = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a2e);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 5000);
    camera.position.set(1.6, 1.2, 1.6);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setClearColor(0x2a2a2e, 1);
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    if ('toneMapping' in renderer) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
    }
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(2.5, 4, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xaabbff, 0.55);
    fill.position.set(-2, 1, -1);
    scene.add(fill);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);

    const setSize = () => {
      const width = Math.max(mount.clientWidth || 0, 160);
      const height = Math.max(mount.clientHeight || 0, 160);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    };
    setSize();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => setSize());
      resizeObserver.observe(mount);
    }

    const animate = () => {
      if (cancelled) return;
      controls.update();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    onStatusRef.current?.('loading');
    onErrorRef.current?.(null);

    const abs = resolveTaskModelUrl(meshUrl, apiEndpoint);
    fetch(abs, { headers: get3daigcAuthHeaders() })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const type = response.headers.get('content-type') || '';
        if (type.includes('text/html')) {
          throw new Error('Mesh URL returned HTML (check API proxy)');
        }
        return response.arrayBuffer();
      })
      .then(
        (buffer) =>
          new Promise((resolve, reject) => {
            if (!buffer || buffer.byteLength < 16) {
              reject(new Error('Empty mesh download'));
              return;
            }
            const loader = new GLTFLoader();
            loader.parse(buffer, '', resolve, reject);
          }),
      )
      .then((gltf) => {
        if (cancelled) return;
        root = gltf.scene;
        root.name = 'task-mesh-preview';
        root.updateMatrixWorld(true);
        root.traverse((child) => {
          if (child.isSkinnedMesh && child.skeleton) {
            child.skeleton.update();
          }
        });
        brightenMaterials(root);
        scene.add(root);
        rootRef.current = root;

        boneOverlay = buildBoneOverlay(root);
        if (boneOverlay) {
          root.add(boneOverlay);
          boneOverlayRef.current = boneOverlay;
        }
        applyBonesVisibility(root, boneOverlay, showBonesRef.current);

        setSize();
        if (!frameObject(camera, controls, root)) {
          throw new Error('Mesh has no visible geometry');
        }
        onStatusRef.current?.('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        onStatusRef.current?.('error');
        onErrorRef.current?.(err?.message || 'Failed to load mesh preview');
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationId);
      resizeObserver?.disconnect();
      controls?.dispose();
      rootRef.current = null;
      boneOverlayRef.current = null;
      if (root) {
        scene.remove(root);
        root.traverse((obj) => {
          obj.geometry?.dispose?.();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
          else mat?.dispose?.();
        });
      }
      renderer?.dispose();
      if (renderer?.domElement?.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [meshUrl, apiEndpoint]);

  return <div ref={mountRef} className="task-mesh-preview-canvas" />;
}
