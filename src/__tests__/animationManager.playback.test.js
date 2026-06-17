import { describe, expect, it, vi } from 'vitest';
import { AnimationManager } from '../library/animationManager.js';

describe('AnimationManager playback controls', () => {
  it('stop pauses, zeros speed, and resets time', () => {
    const manager = new AnimationManager();
    const setTime = vi.fn();
    const setTimeScale = vi.fn();
    manager.mainControl = {
      getTime: () => 1.5,
      setTime,
      setTimeScale,
      update: vi.fn(),
      actions: [{ time: 1.5, paused: false }],
    };
    manager.animationControls = [manager.mainControl];
    manager.currentSpeed = 2;
    manager.paused = false;

    manager.stop();

    expect(manager.isPaused()).toBe(true);
    expect(manager.getSpeed()).toBe(0);
    expect(setTime).toHaveBeenCalledWith(0);
    expect(setTimeScale).toHaveBeenCalledWith(0);
    expect(manager.mainControl.actions[0].time).toBe(0);
  });

  it('play clears paused flags on actions', () => {
    const manager = new AnimationManager();
    const action = { paused: true };
    manager.paused = true;
    manager.animationControls = [
      {
        actions: [action],
        to: { paused: true },
        from: { paused: true },
      },
    ];
    manager.update = vi.fn();

    manager.play();

    expect(manager.isPaused()).toBe(false);
    expect(action.paused).toBe(false);
    expect(manager.update).toHaveBeenCalledWith(true);
  });

  it('setSpeed updates currentSpeed on all controls', () => {
    const manager = new AnimationManager();
    const control = { setTimeScale: vi.fn() };
    manager.mainControl = control;
    manager.animationControls = [control];

    manager.setSpeed(-1);

    expect(manager.getSpeed()).toBe(-1);
    expect(control.setTimeScale).toHaveBeenCalledWith(-1);
  });
});
