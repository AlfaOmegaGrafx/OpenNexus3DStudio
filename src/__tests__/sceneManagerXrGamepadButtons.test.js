import { describe, expect, it } from 'vitest';
import {
  readButtonEdge,
  readSqueezePressed,
  readTriggerPressed,
} from '../library/sceneManagerXrGamepadButtons.js';

describe('sceneManagerXrGamepadButtons', () => {
  it('reads trigger on button 0 only', () => {
    const source = {
      profiles: ['oculus-touch'],
      gamepad: {
        buttons: [
          { pressed: true, value: 1 },
          { pressed: false, value: 0 },
        ],
      },
    };
    expect(readTriggerPressed(source)).toBe(true);
    expect(readSqueezePressed(source)).toBe(false);
  });

  it('reads squeeze on button 1 when distinct from trigger', () => {
    const source = {
      profiles: ['oculus-touch'],
      gamepad: {
        buttons: [
          { pressed: false, value: 0 },
          { pressed: true, value: 1 },
        ],
      },
    };
    expect(readTriggerPressed(source)).toBe(false);
    expect(readSqueezePressed(source)).toBe(true);
  });

  it('does not treat mirrored trigger on button 1 as squeeze', () => {
    const source = {
      profiles: ['oculus-touch'],
      gamepad: {
        buttons: [
          { pressed: true, value: 0.9 },
          { pressed: true, value: 0.9 },
        ],
      },
    };
    expect(readTriggerPressed(source)).toBe(true);
    expect(readSqueezePressed(source)).toBe(false);
  });

  it('emits rising and falling edges', () => {
    expect(readButtonEdge(true, false)).toEqual({ start: true, end: false });
    expect(readButtonEdge(false, true)).toEqual({ start: false, end: true });
  });
});
