import { describe, expect, it } from 'vitest';
import {
  WORLD_NAV_CONTRACT_VERSION,
  createPointNavGoal,
  createLabelNavGoal,
  clearNavGoal,
  loadNavGoal,
  saveNavGoal,
  saveWorldFrame,
  loadWorldFrame,
} from '../library/worldNavContract.js';

describe('worldNavContract', () => {
  it('round-trips world frame and nav goal in sessionStorage', () => {
    sessionStorage.clear();
    saveWorldFrame({
      frameId: 'floor',
      twinId: 'office-demo',
      floorOrigin: [0, 0, 0, 0],
      scaleMeters: 1,
    });
    const frame = loadWorldFrame();
    expect(frame?.version).toBe(WORLD_NAV_CONTRACT_VERSION);
    expect(frame?.twinId).toBe('office-demo');

    const goal = createPointNavGoal([1.2, 0, 3.4], { source: 'xr-ai' });
    saveNavGoal(goal);
    expect(loadNavGoal()?.position).toEqual([1.2, 0, 3.4]);

    clearNavGoal();
    expect(loadNavGoal()).toBeNull();
  });

  it('creates label nav goals for zero-shot vision', () => {
    const goal = createLabelNavGoal('desk', {
      bbox: [0.1, 0.2, 0.5, 0.6],
      confidence: 0.87,
    });
    expect(goal.kind).toBe('label');
    expect(goal.label).toBe('desk');
    expect(goal.confidence).toBe(0.87);
  });
});
