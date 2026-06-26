import { ensureAbsoluteUrl } from './taskManager.js';
import { getTaskResultMotionUrl, resolveTaskModelUrl } from './taskModelUrl.js';
import { applyStudioMotionToAnimationManager } from './kimodoMotionLoader.js';
import {
  pickPrimaryAnimationVrm,
  syncAnimationPrimaryTarget,
} from './viewportExpressionVrm.js';

/**
 * Play a completed text-to-motion job on the viewport VRM.
 */
export async function playTextToMotionOnViewport({
  sceneManager,
  characterManager,
  taskResult,
  apiEndpoint,
  displayName,
}) {
  syncAnimationPrimaryTarget(sceneManager, characterManager);

  const vrm = pickPrimaryAnimationVrm(sceneManager, characterManager);
  if (!vrm?.humanoid) {
    throw new Error('Load a VRM in the viewport first.');
  }

  const am = characterManager?.animationManager;
  if (!am) {
    throw new Error('Animation manager not ready');
  }

  let motionUrl = getTaskResultMotionUrl(taskResult);
  if (!motionUrl && taskResult?.job_id) {
    motionUrl = `/api/v1/system/jobs/${taskResult.job_id}/download`;
  }
  if (!motionUrl) {
    throw new Error('No motion URL in task result');
  }

  const base = apiEndpoint || import.meta.env.VITE_API_ENDPOINT || '';
  const absolute = resolveTaskModelUrl(motionUrl, base) || ensureAbsoluteUrl(motionUrl);

  const name =
    displayName ||
    taskResult?.text_prompt?.slice(0, 40) ||
    taskResult?.prompt?.slice(0, 40) ||
    'Kimodo';

  await applyStudioMotionToAnimationManager(am, { vrm }, absolute, name);
  am.play();
  return { motionUrl: absolute, animationName: am.getCurrentAnimationName?.() };
}
