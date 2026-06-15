import { describe, expect, it } from 'vitest';
import {
  applyDeadzone,
  isThumbstickTeleportAim,
  readRightThumbstickAxes,
} from '../library/sceneManagerXrAxes.js';

describe('sceneManagerXrAxes', () => {
  it('reads right thumbstick from gamepad layout', () => {
    const axes = readRightThumbstickAxes({
      handedness: 'right',
      axes: [0, 0, 0.5, 0.8],
    });
    expect(axes.x).toBe(0.5);
    expect(axes.y).toBe(0.8);
  });

  it('detects teleport aim when stick is pushed down/forward', () => {
    expect(isThumbstickTeleportAim(0.7, 0.1)).toBe(true);
    expect(isThumbstickTeleportAim(0.1, 0.7)).toBe(false);
    expect(isThumbstickTeleportAim(0.05, 0)).toBe(false);
  });

  it('zeros values inside deadzone', () => {
    expect(applyDeadzone(0.05)).toBe(0);
    expect(applyDeadzone(0.5)).toBe(0.5);
  });
});
