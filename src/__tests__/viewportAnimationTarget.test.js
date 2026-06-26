import { describe, expect, it, vi } from 'vitest';
import { syncAnimationPrimaryTarget } from '../library/viewportExpressionVrm.js';

describe('syncAnimationPrimaryTarget', () => {
  it('uses uploaded VRM and removes loot trait mixers', () => {
    const uploaded = { scene: {}, humanoid: { autoUpdateHumanBones: false } };
    const lootBody = { scene: {}, humanoid: {} };
    const removeVRM = vi.fn();
    const addVRM = vi.fn();
    const setPrimaryAnimationVrm = vi.fn();

    const animationManager = {
      animationControls: [{ vrm: lootBody }, { vrm: uploaded }],
      mixamoModel: null,
      mixamoAnimations: null,
      curAnimID: 0,
      lastAnimID: -1,
      mouseLookEnabled: false,
      getCurrentAnimationName: () => 'Walking',
      play: vi.fn(),
      setPrimaryAnimationVrm,
      setPrimaryAnimationRig: vi.fn(),
      removeViewportRig: vi.fn(),
      removeVRM,
      addVRM,
    };

    const sceneManager = { currentVRM: uploaded };
    const characterManager = {
      animationManager,
      isCharacterVisible: () => true,
      avatar: { Body: { vrm: lootBody } },
    };

    const primary = syncAnimationPrimaryTarget(sceneManager, characterManager);

    expect(primary).toBe(uploaded);
    expect(setPrimaryAnimationVrm).toHaveBeenCalledWith(uploaded);
    expect(removeVRM).toHaveBeenCalledWith(lootBody);
    expect(addVRM).not.toHaveBeenCalled();
  });

  it('clears all VRM mixers when nothing is visible', () => {
    const lootBody = { scene: {}, humanoid: {} };
    const removeVRM = vi.fn();
    const setPrimaryAnimationVrm = vi.fn();

    const animationManager = {
      animationControls: [{ vrm: lootBody }],
      setPrimaryAnimationVrm,
      setPrimaryAnimationRig: vi.fn(),
      removeViewportRig: vi.fn(),
      removeVRM,
      addVRM: vi.fn(),
    };

    const characterManager = {
      animationManager,
      isCharacterVisible: () => false,
      avatar: {},
    };

    const primary = syncAnimationPrimaryTarget(null, characterManager);

    expect(primary).toBeNull();
    expect(setPrimaryAnimationVrm).toHaveBeenCalledWith(null);
    expect(animationManager.setPrimaryAnimationRig).toHaveBeenCalledWith(null);
    expect(removeVRM).toHaveBeenCalledWith(lootBody);
  });
});
