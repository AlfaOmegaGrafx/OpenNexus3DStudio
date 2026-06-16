import { describe, expect, it, vi } from 'vitest';
import * as THREE from '../library/three.js';
import {
  SceneManagerXrAvatarView,
  XR_AVATAR_VIEW_FIRST_PERSON,
  XR_AVATAR_VIEW_THIRD_PERSON,
} from '../library/sceneManagerXrAvatarView.js';

describe('SceneManagerXrAvatarView', () => {
  it('defaults to third person with avatar visible on session start', () => {
    const playerRoot = new THREE.Group();
    playerRoot.visible = true;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -1);

    const sceneManager = {
      playerRoot,
      currentModel: new THREE.Object3D(),
      camera,
      emit: vi.fn(),
    };

    const view = new SceneManagerXrAvatarView(sceneManager);
    view.onSessionStart({ isVR: true });

    expect(view.mode).toBe(XR_AVATAR_VIEW_THIRD_PERSON);
    expect(playerRoot.visible).toBe(true);
  });

  it('hides avatar only in embody (first person) mode', () => {
    const playerRoot = new THREE.Group();
    const sceneManager = {
      playerRoot,
      currentModel: new THREE.Object3D(),
      camera: new THREE.PerspectiveCamera(),
      emit: vi.fn(),
    };

    const view = new SceneManagerXrAvatarView(sceneManager);
    view.setMode(XR_AVATAR_VIEW_FIRST_PERSON);
    expect(playerRoot.visible).toBe(false);

    view.setMode(XR_AVATAR_VIEW_THIRD_PERSON);
    expect(playerRoot.visible).toBe(true);
  });

  it('toggleMode switches between third and first person', () => {
    const playerRoot = new THREE.Group();
    const sceneManager = {
      playerRoot,
      currentModel: new THREE.Object3D(),
      camera: new THREE.PerspectiveCamera(),
      emit: vi.fn(),
    };

    const view = new SceneManagerXrAvatarView(sceneManager);
    expect(view.toggleMode()).toBe(XR_AVATAR_VIEW_FIRST_PERSON);
    expect(view.toggleMode()).toBe(XR_AVATAR_VIEW_THIRD_PERSON);
  });
});
