import React, { useContext, useEffect, useMemo, useState } from 'react';
import { SceneContext } from '../context/SceneContext';
import { useTask } from '../context/TaskContext';
import { getDefaultModelForFeature } from '../library/aiModelsCatalog';
import { playTextToMotionOnViewport } from '../library/playViewportMotion';
import { buildTaskDisplayName } from '../library/objectNameUtils';
import { resolveTaskJobId } from '../library/taskPersistence.js';
import { normalizeTaskLoadPayload } from '../library/taskModelUrl.js';
import { pickPrimaryAnimationVrm } from '../library/viewportExpressionVrm.js';
import styles from './KimodoMotionPromptBar.module.css';

/**
 * Kimodo text-to-motion strip — sits under playback controls in the animation bar.
 */
export default function KimodoMotionPromptBar({ onMotionPlayed, embedded = false }) {
  const { sceneManager, characterManager } = useContext(SceneContext);
  const { taskManager, tasks } = useTask();

  const [prompt, setPrompt] = useState('walking forward');
  const [busy, setBusy] = useState(false);
  const [loadingMotion, setLoadingMotion] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [readyMotion, setReadyMotion] = useState(null);
  const [needsManualLoad, setNeedsManualLoad] = useState(false);

  const hasAnimTarget = Boolean(
    pickPrimaryAnimationVrm(sceneManager, characterManager)?.humanoid,
  );

  const lastCompletedMotionTask = useMemo(() => {
    const completed = (tasks || []).filter(
      (t) => t.status === 'completed' && t.type === 'text-to-motion' && t.result,
    );
    if (!completed.length) return null;
    return completed.sort((a, b) => {
      const ta = new Date(a.completedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.completedAt || b.createdAt || 0).getTime();
      return tb - ta;
    })[0];
  }, [tasks]);

  const motionFromTask = useMemo(() => {
    if (!lastCompletedMotionTask) return null;
    const payload = normalizeTaskLoadPayload(lastCompletedMotionTask);
    if (!payload) return null;
    return {
      payload,
      displayName:
        lastCompletedMotionTask.prompt ||
        payload?.text_prompt ||
        payload?.result?.text_prompt ||
        'Kimodo',
      jobId: resolveTaskJobId(lastCompletedMotionTask),
    };
  }, [lastCompletedMotionTask]);

  const activeMotion = readyMotion || motionFromTask;

  const resolveMotionPayload = (taskId, pollResult) => {
    const row = taskManager?.getTask?.(taskId);
    return row?.result || pollResult;
  };

  const loadAnimation = async (motionPayload, displayName) => {
    const sm = sceneManager;
    if (!pickPrimaryAnimationVrm(sm, characterManager)?.humanoid) {
      setError('Load a VRM in the viewport first.');
      return false;
    }
    if (!taskManager) {
      setError('API not connected.');
      return false;
    }
    if (!motionPayload) {
      setError('No motion ready — generate first.');
      return false;
    }

    setLoadingMotion(true);
    setError(null);
    setStatus('Loading animation…');

    try {
      const played = await playTextToMotionOnViewport({
        sceneManager: sm,
        characterManager,
        taskResult: motionPayload,
        apiEndpoint: taskManager.apiEndpoint,
        displayName: displayName?.slice(0, 40) || 'Kimodo',
      });

      const name = played.animationName || displayName?.slice(0, 24) || 'Kimodo';
      setStatus('');
      setNeedsManualLoad(false);
      onMotionPlayed?.(name);
      return true;
    } catch (err) {
      console.error('[KimodoMotionPromptBar] loadAnimation', err);
      setError(err?.message || String(err));
      setStatus('');
      setNeedsManualLoad(true);
      return false;
    } finally {
      setLoadingMotion(false);
    }
  };

  const runGeneration = async () => {
    setError(null);
    setNeedsManualLoad(false);
    const sm = sceneManager;
    if (!pickPrimaryAnimationVrm(sm, characterManager)?.humanoid) {
      setError('Load a VRM in the viewport first.');
      return;
    }
    if (!taskManager) {
      setError('API not connected.');
      return;
    }

    const trimmed = prompt.trim();
    if (!trimmed) {
      setError('Enter a motion prompt.');
      return;
    }

    setBusy(true);
    setStatus('Generating…');

    try {
      const task = taskManager.createTask({
        type: 'text-to-motion',
        prompt: trimmed,
        options: {
          object_name: buildTaskDisplayName(trimmed, 'Motion'),
          duration: 5,
          model_preference: getDefaultModelForFeature('text_to_motion'),
        },
      });

      const pollResult = await taskManager.startTask(task.id);
      const motionPayload = resolveMotionPayload(task.id, pollResult);
      const jobId = motionPayload?.job_id || pollResult?.job_id || null;

      setReadyMotion({
        payload: motionPayload,
        displayName: trimmed,
        jobId,
      });
      setStatus('Playing…');

      const played = await loadAnimation(motionPayload, trimmed);
      if (!played) {
        setStatus('Tap Load Animation below');
        setNeedsManualLoad(true);
      } else {
        setStatus('');
      }
    } catch (err) {
      console.error('[KimodoMotionPromptBar]', err);
      setError(err?.message || String(err));
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!taskManager) return undefined;

    const onTaskCompleted = ({ task, result }) => {
      if (task?.type !== 'text-to-motion') return;
      const payload = result || task?.result;
      if (!payload) return;

      const displayName =
        task?.prompt ||
        payload?.text_prompt ||
        payload?.result?.text_prompt ||
        'Kimodo';

      setReadyMotion({
        payload,
        displayName,
        jobId: payload?.job_id || task?.job_id || null,
      });
      setNeedsManualLoad(true);
    };

    taskManager.on('taskCompleted', onTaskCompleted);
    return () => {
      taskManager.off('taskCompleted', onTaskCompleted);
    };
  }, [taskManager]);

  useEffect(() => {
    const activeJobId = activeMotion?.jobId;
    const onViewportLoadFailed = (event) => {
      const jobId = event.detail?.jobId;
      if (!jobId || !activeJobId || jobId !== activeJobId) return;
      setNeedsManualLoad(true);
      setStatus('Tap Load Animation below');
      if (event.detail?.error) {
        setError(event.detail.error);
      }
    };

    const onViewportLoadComplete = (event) => {
      if (!event.detail?.motion) return;
      const jobId = event.detail?.jobId;
      if (!jobId || !activeJobId || jobId !== activeJobId) return;
      setNeedsManualLoad(false);
      setStatus('');
      setError(null);
    };

    window.addEventListener('viewportLoadFailed', onViewportLoadFailed);
    window.addEventListener('viewportLoadComplete', onViewportLoadComplete);
    return () => {
      window.removeEventListener('viewportLoadFailed', onViewportLoadFailed);
      window.removeEventListener('viewportLoadComplete', onViewportLoadComplete);
    };
  }, [activeMotion?.jobId]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!busy && !loadingMotion && hasAnimTarget) runGeneration();
    }
  };

  const canLoadMotion = Boolean(activeMotion?.payload);
  const loadDisabled = loadingMotion || !hasAnimTarget || !canLoadMotion;

  return (
    <div
      className={`${styles.wrap} ${embedded ? styles.wrapEmbedded : ''}`}
      data-kimodo-prompt="true"
    >
      <div className={styles.row}>
        <input
          type="text"
          className={styles.input}
          value={prompt}
          disabled={busy || loadingMotion}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe motion…"
          aria-label="Text to motion prompt"
          title={
            error ||
            status ||
            (hasAnimTarget ? 'Describe motion (Enter to generate)' : 'Load a VRM in the viewport first')
          }
        />
        <button
          type="button"
          className={styles.generate}
          disabled={busy || loadingMotion || !hasAnimTarget}
          onClick={runGeneration}
          title="Generate motion with Kimodo"
        >
          {busy ? '…' : 'Go'}
        </button>
      </div>
      <div className={styles.actionRow}>
        <button
          type="button"
          className={`${styles.load} ${needsManualLoad && canLoadMotion ? styles.loadHighlight : ''}`}
          disabled={loadDisabled}
          onClick={() =>
            loadAnimation(activeMotion?.payload, activeMotion?.displayName || prompt)
          }
          title={
            !canLoadMotion
              ? 'Generate or complete a Kimodo motion first'
              : !hasAnimTarget
                ? 'Load a VRM in the viewport first'
                : needsManualLoad
                  ? 'Animation did not start — load and play on the VRM'
                  : 'Load and play the latest Kimodo motion'
          }
        >
          {loadingMotion ? 'Loading…' : 'Load Animation'}
        </button>
      </div>
      {(status || error) && (
        <div className={styles.feedback} role="status" aria-live="polite">
          {error ? <span className={styles.errorText}>{error}</span> : status}
        </div>
      )}
    </div>
  );
}
