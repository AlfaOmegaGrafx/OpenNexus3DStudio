import { describe, it, expect } from 'vitest';
import {
  pickPrimaryExpressionVrm,
  pickPrimaryViewportModelRoot,
  collectViewportRenderRoots,
} from '../library/viewportExpressionVrm';

describe('pickPrimaryExpressionVrm', () => {
  it('prefers sceneManager.currentVRM over avatar slots', () => {
    const imported = { id: 'imported' };
    const body = { id: 'body' };
    const sm = { currentVRM: imported };
    const cm = { avatar: { Body: { vrm: body } } };
    expect(pickPrimaryExpressionVrm(sm, cm)).toBe(imported);
  });

  it('uses Body trait when no import', () => {
    const body = { id: 'body', expressionManager: {} };
    const head = { id: 'head' };
    const cm = {
      avatar: {
        Head: { vrm: head },
        Body: { vrm: body },
      },
    };
    expect(pickPrimaryExpressionVrm({ currentVRM: null }, cm)).toBe(body);
  });

  it('returns null when nothing loaded', () => {
    expect(pickPrimaryExpressionVrm(null, null)).toBeNull();
    expect(pickPrimaryExpressionVrm({}, { avatar: {} })).toBeNull();
  });

  it('pickPrimaryViewportModelRoot uses trait body scene when no import', () => {
    const scene = { uuid: 'scene-1', userData: {} };
    const vrm = { scene, humanoid: {} };
    const cm = { avatar: { Body: { vrm, model: scene } } };
    expect(pickPrimaryViewportModelRoot({ currentModel: null }, cm)).toBe(scene);
    expect(scene.userData.vrm).toBe(vrm);
  });

  it('collectViewportRenderRoots includes all equipped trait models', () => {
    const body = { uuid: 'b' };
    const hair = { uuid: 'h' };
    const cm = {
      avatar: {
        Body: { model: body, vrm: { scene: body } },
        Hair: { model: hair, vrm: { scene: hair } },
      },
    };
    const roots = collectViewportRenderRoots(null, cm);
    expect(roots).toHaveLength(2);
    expect(roots).toContain(body);
    expect(roots).toContain(hair);
  });
});
