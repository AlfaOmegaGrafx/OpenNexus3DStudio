/**
 * Zero-shot vision → navigation helpers.
 * Maps Grounding DINO detections to worldNavContract goals.
 */
import { detectObjectsGroundingDino } from './groundingDinoClient.js';
import { captureRendererFrameBase64 } from './sceneCapture.js';
import {
  createLabelNavGoal,
  saveNavGoal,
  WORLD_NAV_MSG_TYPE,
} from './worldNavContract.js';

export const ZERO_SHOT_NAV_EVENT = 'opennexus3d:zeroShotNav';

/**
 * @param {import('./groundingDinoClient.js').GroundingDetection} detection
 * @param {Partial<import('./worldNavContract.js').NavGoal>} [extra]
 */
export function detectionToNavGoal(detection, extra = {}) {
  return createLabelNavGoal(detection.label || detection.phrase, {
    bbox: detection.bboxNormalized,
    confidence: detection.confidence,
    source: 'grounding-dino',
    ...extra,
  });
}

/**
 * @param {import('./groundingDinoClient.js').GroundingDetection} detection
 */
export function applyDetectionNavGoal(detection) {
  const goal = detectionToNavGoal(detection);
  saveNavGoal(goal);
  window.dispatchEvent(new CustomEvent(ZERO_SHOT_NAV_EVENT, { detail: goal }));
  return goal;
}

/**
 * Detect objects in the current viewport and optionally set top match as nav goal.
 * @param {import('three').WebGLRenderer} renderer
 * @param {string} prompt
 * @param {{ threshold?: number, setNavGoal?: boolean }} [opts]
 */
export async function detectInViewport(renderer, prompt, opts = {}) {
  const { threshold = 0.3, setNavGoal = false } = opts;
  const imageBase64 = captureRendererFrameBase64(renderer);
  const result = await detectObjectsGroundingDino(imageBase64, prompt, { threshold });
  let goal = null;
  if (setNavGoal && result.detections?.length) {
    const top = [...result.detections].sort((a, b) => b.confidence - a.confidence)[0];
    goal = applyDetectionNavGoal(top);
  }
  return { ...result, goal };
}

/**
 * Post nav goal to a child iframe (xr-ai hub or companion overlay).
 * @param {Window} target
 * @param {string} targetOrigin
 * @param {import('./worldNavContract.js').NavGoal} goal
 */
export function postNavGoalToFrame(target, targetOrigin, goal) {
  target.postMessage({
    type: WORLD_NAV_MSG_TYPE,
    action: 'set-goal',
    payload: goal,
  }, targetOrigin);
}
