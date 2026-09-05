import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SceneManagerMesh2MotionAdjuster } from '../library/sceneManagerMesh2MotionAdjuster.js';

describe('SceneManagerMesh2MotionAdjuster pick host', () => {
  function makeHost() {
    const host = document.createElement('div');
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    });
    return host;
  }

  it('single-click mesh does nothing; double-click selects object', () => {
    const camera = new THREE.PerspectiveCamera();
    const host = makeHost();
    const model = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    const sm = {
      camera,
      raycaster: null,
      container: null,
      sceneHostElement: host,
      renderer: { domElement: host },
      currentModel: model,
      boneHelpers: [],
      renderMode: 'wireframe',
      emit: vi.fn(),
      deselectBone: vi.fn(),
      deselectAllBones: vi.fn(),
      selectBone: vi.fn(),
      setRenderMode: vi.fn(),
      scene: new THREE.Scene(),
      controls: { enabled: true, target: new THREE.Vector3(), update: vi.fn() },
    };
    const adjuster = new SceneManagerMesh2MotionAdjuster(sm);
    adjuster.detach = vi.fn();
    adjuster.attach = vi.fn();
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    adjuster.handleViewportClick({
      clientX: 50,
      clientY: 50,
      stopPropagation: vi.fn(),
    });
    expect(adjuster.attach).not.toHaveBeenCalled();

    adjuster.handleViewportDoubleClick({
      clientX: 50,
      clientY: 50,
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    });
    expect(sm.setRenderMode).toHaveBeenCalledWith('solid', { focus: false });
    expect(adjuster._renderModeBeforeObject).toBe('wireframe');
    expect(adjuster.attach).toHaveBeenCalledWith(model, 'object', expect.objectContaining({ focus: false }));

    // Second double-click in solid restores prior mode.
    sm.renderMode = 'solid';
    sm.setRenderMode.mockClear();
    adjuster.attach.mockClear();
    adjuster.handleViewportDoubleClick({
      clientX: 50,
      clientY: 50,
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    });
    expect(sm.setRenderMode).toHaveBeenCalledWith('wireframe', { focus: false });
    expect(adjuster._renderModeBeforeObject).toBeNull();
    expect(adjuster.attach).not.toHaveBeenCalled();
  });

  it('deselect restores previous render mode after object double-click', () => {
    const sm = {
      renderMode: 'solid',
      setRenderMode: vi.fn(),
      controls: { target: new THREE.Vector3(3, 1, -2), update: vi.fn(), enabled: true },
      deselectBone: vi.fn(),
      deselectAllBones: vi.fn(),
      emit: vi.fn(),
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      renderer: { domElement: document.createElement('canvas') },
    };
    const adjuster = new SceneManagerMesh2MotionAdjuster(sm);
    adjuster.ensureInitialized();
    adjuster._renderModeBeforeObject = 'skeleton';
    adjuster.detach({ restoreWorld: true, focus: false });
    expect(sm.setRenderMode).toHaveBeenCalledWith('skeleton', { focus: false });
    expect(adjuster._renderModeBeforeObject).toBeNull();
  });

  it('bone focus zooms to the joint, not the full model', () => {
    const focusOnModel = vi.fn();
    const bone = new THREE.Bone();
    bone.name = 'Spine';
    bone.position.set(0, 1, 0);
    const sm = {
      focusOnModel,
      camera: new THREE.PerspectiveCamera(),
      controls: { target: new THREE.Vector3(), update: vi.fn(), enabled: true },
      emit: vi.fn(),
      scene: new THREE.Scene(),
      renderer: { domElement: document.createElement('canvas') },
    };
    sm.camera.position.set(0, 1, 2);
    const adjuster = new SceneManagerMesh2MotionAdjuster(sm);
    adjuster.attachedTarget = bone;
    adjuster.selectionKind = 'bone';
    adjuster.focusOnAttached();
    expect(focusOnModel).not.toHaveBeenCalled();
  });

  it('Head / eyes use the same zoom distance as body bones', () => {
    const bone = new THREE.Bone();
    bone.name = 'Head';
    const sm = {
      focusOnModel: vi.fn(),
      camera: new THREE.PerspectiveCamera(),
      controls: { target: new THREE.Vector3(0, 1, 0), update: vi.fn(), enabled: true },
      emit: vi.fn(),
      scene: new THREE.Scene(),
      renderer: { domElement: document.createElement('canvas') },
      _syncBoneHelperWorldPositions: vi.fn(),
    };
    sm.camera.position.set(0, 1.5, 3);
    const adjuster = new SceneManagerMesh2MotionAdjuster(sm);
    const classic = vi.spyOn(adjuster, '_zoomToWorldPoint');
    adjuster.attachedTarget = bone;
    adjuster.selectionKind = 'bone';
    adjuster.focusOnAttached();
    expect(classic).toHaveBeenCalled();
    expect(classic.mock.calls[0][1]).toBe('Head');
  });

  it('neck bone focus passes the bone name through', () => {
    const bone = new THREE.Bone();
    bone.name = 'Neck';
    const sm = {
      focusOnModel: vi.fn(),
      camera: new THREE.PerspectiveCamera(),
      controls: { target: new THREE.Vector3(), update: vi.fn(), enabled: true },
      emit: vi.fn(),
      scene: new THREE.Scene(),
      renderer: { domElement: document.createElement('canvas') },
      _syncBoneHelperWorldPositions: vi.fn(),
    };
    sm.camera.position.set(0, 1, 2);
    const adjuster = new SceneManagerMesh2MotionAdjuster(sm);
    const spy = vi.spyOn(adjuster, '_zoomToWorldPoint');
    adjuster.attachedTarget = bone;
    adjuster.selectionKind = 'bone';
    adjuster.focusOnAttached();
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][1]).toBe('Neck');
  });

  it('deselect does not move orbit target', () => {
    const target = new THREE.Vector3(3, 1, -2);
    const sm = {
      controls: { target, update: vi.fn(), enabled: true },
      deselectBone: vi.fn(),
      deselectAllBones: vi.fn(),
      emit: vi.fn(),
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      renderer: { domElement: document.createElement('canvas') },
    };
    const adjuster = new SceneManagerMesh2MotionAdjuster(sm);
    adjuster.ensureInitialized();
    adjuster.detach({ restoreWorld: true, focus: false });
    expect(sm.controls.target.x).toBe(3);
    expect(sm.controls.target.y).toBe(1);
    expect(sm.controls.target.z).toBe(-2);
  });
});
