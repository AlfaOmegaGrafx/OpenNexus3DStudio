import React, { useCallback, useEffect, useState } from 'react';
import { pingGroundingDinoProxy } from '../library/groundingDinoClient.js';
import { detectInViewport, applyDetectionNavGoal } from '../library/zeroShotVision.js';
import { loadNavGoal } from '../library/worldNavContract.js';
import './ZeroShotDetectPanel.css';

/**
 * Web adaptation of Unity-MetaXR-AI-ZeroShot Grounding DINO panel.
 * Captures viewport frame → NVIDIA API (via DGX proxy) → label nav goals.
 */
export default function ZeroShotDetectPanel({ sceneManager, disabled }) {
  const [prompt, setPrompt] = useState('desk, chair, door');
  const [threshold, setThreshold] = useState(0.3);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [proxyOk, setProxyOk] = useState(null);
  const [detections, setDetections] = useState([]);
  const [activeGoal, setActiveGoal] = useState(() => loadNavGoal());

  useEffect(() => {
    pingGroundingDinoProxy()
      .then((r) => setProxyOk(r?.ok && r?.hasKey))
      .catch(() => setProxyOk(false));
  }, []);

  useEffect(() => {
    const onNav = (e) => setActiveGoal(e.detail);
    window.addEventListener('opennexus3d:zeroShotNav', onNav);
    return () => window.removeEventListener('opennexus3d:zeroShotNav', onNav);
  }, []);

  const runDetect = useCallback(async (setGoalOnTop = false) => {
    const renderer = sceneManager?.renderer;
    if (!renderer) {
      setError('Viewport not ready');
      return;
    }
    setStatus('running');
    setError('');
    setDetections([]);
    try {
      const result = await detectInViewport(renderer, prompt, { threshold, setNavGoal: setGoalOnTop });
      setDetections(result.detections || []);
      if (result.goal)
        setActiveGoal(result.goal);
      setStatus(result.detections?.length ? 'done' : 'empty');
    }
    catch (err) {
      setError(err?.message || String(err));
      setStatus('error');
    }
  }, [sceneManager, prompt, threshold]);

  const onSetGoal = useCallback((det) => {
    const goal = applyDetectionNavGoal(det);
    setActiveGoal(goal);
  }, []);

  if (disabled)
    return null;

  return (
    <div className="zero-shot-panel" data-testid="zero-shot-panel">
      <div className="zero-shot-header">
        <span className="zero-shot-title">Zero-Shot Detect</span>
        <span
          className={`zero-shot-badge ${proxyOk === true ? 'ok' : proxyOk === false ? 'warn' : ''}`}
          title="DGX Grounding DINO proxy (:8456)"
        >
          {proxyOk === true ? 'DINO' : proxyOk === false ? 'No proxy' : '…'}
        </span>
      </div>
      <p className="zero-shot-desc">
        Grounding DINO via NVIDIA API — find objects in the viewport for companion navigation.
      </p>
      <label className="zero-shot-field">
        <span>Prompt (comma-separated)</span>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="desk, chair, door"
        />
      </label>
      <label className="zero-shot-field">
        <span>Threshold ({threshold.toFixed(2)})</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
        />
      </label>
      <div className="zero-shot-actions">
        <button type="button" className="zero-shot-btn" onClick={() => runDetect(false)} disabled={status === 'running'}>
          Detect
        </button>
        <button type="button" className="zero-shot-btn primary" onClick={() => runDetect(true)} disabled={status === 'running'}>
          Detect → Nav
        </button>
      </div>
      {status === 'running' && <p className="zero-shot-meta">Analyzing viewport…</p>}
      {error && <p className="zero-shot-error">{error}</p>}
      {activeGoal?.label && (
        <p className="zero-shot-meta">
          Nav goal: <strong>{activeGoal.label}</strong>
          {activeGoal.confidence != null ? ` (${(activeGoal.confidence * 100).toFixed(0)}%)` : ''}
        </p>
      )}
      {detections.length > 0 && (
        <ul className="zero-shot-list">
          {detections.map((d, i) => (
            <li key={`${d.phrase}-${i}`}>
              <span>{d.phrase}</span>
              <span className="zero-shot-conf">{(d.confidence * 100).toFixed(0)}%</span>
              <button type="button" className="zero-shot-link" onClick={() => onSetGoal(d)}>
                Nav
              </button>
            </li>
          ))}
        </ul>
      )}
      {proxyOk === false && (
        <p className="zero-shot-footnote">
          Run <code>NGC_API_KEY=… npm run grounding-dino-proxy</code> on DGX.
        </p>
      )}
    </div>
  );
}
