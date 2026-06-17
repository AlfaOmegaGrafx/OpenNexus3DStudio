import { describe, expect, it, vi } from 'vitest';
import * as THREE from '../library/three.js';
import { SceneManagerXrMenu } from '../library/sceneManagerXrMenu.js';
import { XR_AVATAR_VIEW_THIRD_PERSON } from '../library/sceneManagerXrAvatarView.js';

describe('SceneManagerXrMenu', () => {
  it('applies 90° panel rotation and runs toggle action', () => {
    const scene = new THREE.Scene();
    const avatarView = {
      mode: XR_AVATAR_VIEW_THIRD_PERSON,
      toggleMode: vi.fn(function toggle() {
        this.mode = 'first-person';
      }),
    };

    const menu = new SceneManagerXrMenu({ scene, camera: new THREE.PerspectiveCamera() }, avatarView);
    menu.open = true;
    menu._createPanel();

    expect(menu._panelContent?.rotation.y).toBeCloseTo(Math.PI / 2);

    menu._runMenuAction('toggle-view');
    expect(avatarView.toggleMode).toHaveBeenCalled();

    menu._runMenuAction('close');
    expect(menu.open).toBe(false);
    expect(menu._group).toBeNull();
  });
});
