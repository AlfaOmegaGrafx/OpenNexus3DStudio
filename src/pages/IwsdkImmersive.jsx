import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  createIwsdkWorld,
  disposeIwsdkWorld,
  SessionMode,
} from '../library/iwsdkWorld.js';
import {
  loadIwsdkWorldFromManifestUrl,
  loadIwsdkWorldFromTaskResult,
} from '../library/iwsdkWorldPackage.js';
import { ensureAbsoluteUrl } from '../library/taskManager.js';
import { initRemoteLogClient } from '../library/remoteLogClient.js';
import './IwsdkImmersive.css';

/**
 * Standalone IWSDK immersive view at /xr (does not mount SceneManager).
 * World packages: ?worldManifest=... or ?worldJob=...
 */
export default function IwsdkImmersive() {
  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState(null);
  const [worldLabel, setWorldLabel] = useState(null);

  const worldManifest =
    searchParams.get('worldManifest') || searchParams.get('manifest') || '';
  const worldJob = searchParams.get('worldJob') || searchParams.get('jobId') || '';
  const apiEndpoint = ensureAbsoluteUrl(
    searchParams.get('apiEndpoint') || import.meta.env.VITE_API_ENDPOINT || '',
  );
  const skipDemo =
    !!worldManifest ||
    !!worldJob ||
    searchParams.get('skipDemo') === '1';

  useEffect(() => {
    if (import.meta.env.DEV) {
      try {
        localStorage.setItem('remoteLogEnabled', '1');
      } catch {
        /* ignore */
      }
      initRemoteLogClient();
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        worldRef.current?.exitXR();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const container = containerRef.current;
    if (!container) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const world = await createIwsdkWorld(container, { skipDemoInteractables: skipDemo });
        if (cancelled) {
          disposeIwsdkWorld(world);
          return;
        }
        worldRef.current = world;

        if (worldManifest) {
          const loaded = await loadIwsdkWorldFromManifestUrl(world, worldManifest, {
            apiEndpoint,
          });
          setWorldLabel(loaded.name || loaded.id);
        } else if (worldJob) {
          const loaded = await loadIwsdkWorldFromTaskResult(
            world,
            { job_id: worldJob, feature: 'image_to_world' },
            apiEndpoint,
          );
          setWorldLabel(loaded.name || loaded.id);
        }

        if (!cancelled) {
          setPhase('ready');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[IwsdkImmersive] init failed:', err);
          setError(err?.message || String(err));
          setPhase('error');
        }
      }
    })();

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      cancelled = true;
      disposeIwsdkWorld(worldRef.current);
      worldRef.current = null;
    };
  }, [worldManifest, worldJob, apiEndpoint, skipDemo]);

  useEffect(() => {
    if (phase !== 'ready' || !worldRef.current) return undefined;
    if (typeof window !== 'undefined' && window.__IWER_MCP_MANAGED) {
      worldRef.current.launchXR({ sessionMode: SessionMode.ImmersiveVR });
    }
    return undefined;
  }, [phase]);

  const launchVR = useCallback(() => {
    worldRef.current?.launchXR({ sessionMode: SessionMode.ImmersiveVR });
  }, []);

  const launchAR = useCallback(() => {
    worldRef.current?.launchXR({ sessionMode: SessionMode.ImmersiveAR });
  }, []);

  const exitXR = useCallback(() => {
    worldRef.current?.exitXR();
  }, []);

  const ready = phase === 'ready';

  return (
    <div className="iwsdk-immersive-page">
      <div className="iwsdk-immersive-toolbar">
        <Link to="/">← OpenNexus3DStudio</Link>
        <button type="button" onClick={launchVR} disabled={!ready}>
          Enter VR
        </button>
        <button type="button" onClick={launchAR} disabled={!ready}>
          Enter AR
        </button>
        <button type="button" onClick={exitXR} disabled={!ready}>
          Exit XR
        </button>
        <span
          className={`iwsdk-immersive-status${phase === 'error' ? ' iwsdk-immersive-status--error' : ''}`}
        >
          {phase === 'loading' && 'Starting IWSDK…'}
          {phase === 'ready' &&
            (worldLabel
              ? `World: ${worldLabel} — `
              : '') +
            'Far: aim + trigger (ray dot). Near: walk up + grip squeeze. Exit: Menu/B, red panel, or Escape'}
          {phase === 'error' && (error || 'Failed to start')}
        </span>
      </div>

      <div ref={containerRef} className="iwsdk-immersive-canvas-host" />

      <p className="iwsdk-immersive-hint">
        On the headset use your PC LAN IP (not localhost), e.g.{' '}
        <code>https://10.0.0.32:3000/xr?worldManifest=/worlds/my-world/world.manifest.json</code>{' '}
        — reload the full page before Enter VR (hot reload breaks XR on device).{' '}
        <strong>Props use IWSDK grab</strong> (DistanceGrabbable + OneHandGrabbable); splat env is visual only.
        Stuck? Exit XR here, red panel, or Menu/B.
        {' '}
        <strong>VRM face tracking</strong> (CS XR Face APK relay) runs on the main app at{' '}
        <code>/</code>, not this IWSDK lab — use <code>https://&lt;PC-IP&gt;:3000/?nativeFaceRelay=1</code> and load a VRM there.
        {' '}
        <strong>Product path:</strong> load worlds on <code>/</code> (SceneManager + Spark); this lab is for IWSDK interaction regression.
      </p>
    </div>
  );
}
