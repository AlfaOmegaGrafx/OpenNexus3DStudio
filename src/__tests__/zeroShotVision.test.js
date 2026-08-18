import { describe, expect, it } from 'vitest';
import { detectionToNavGoal } from '../library/zeroShotVision.js';

describe('zeroShotVision', () => {
  it('maps Grounding DINO detection to label nav goal', () => {
    const goal = detectionToNavGoal({
      phrase: 'desk',
      label: 'desk',
      confidence: 0.91,
      bbox: [10, 20, 100, 80],
      bboxNormalized: [0.1, 0.2, 0.5, 0.6],
    });
    expect(goal.kind).toBe('label');
    expect(goal.label).toBe('desk');
    expect(goal.bbox).toEqual([0.1, 0.2, 0.5, 0.6]);
    expect(goal.source).toBe('grounding-dino');
  });
});
