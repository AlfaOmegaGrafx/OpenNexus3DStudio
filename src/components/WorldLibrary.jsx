import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useScene } from '../context/SceneContext';
import { useTask } from '../context/TaskContext';
import {
  fetchWorldsIndex,
  listWorldsFromCompletedTasks,
} from '../library/worldPackage.js';
import { buildIwsdkXrExploreUrl } from '../library/iwsdkWorldPackage.js';

/**
 * Pick and load explorable world packages (splat env + mesh props).
 */
export default function WorldLibrary({ apiEndpoint = '', compact = false }) {
  const { activeWorldId, loadWorldFromManifestUrl, clearWorld, isLoading } = useScene();
  const { tasks } = useTask();
  const [staticWorlds, setStaticWorlds] = useState([]);
  const [indexWarning, setIndexWarning] = useState(null);
  const [error, setError] = useState(null);
  const [manifestDraft, setManifestDraft] = useState('');

  const taskWorlds = useMemo(
    () => listWorldsFromCompletedTasks(tasks, apiEndpoint),
    [tasks, apiEndpoint],
  );

  const worlds = useMemo(() => {
    const seen = new Set();
    const merged = [];
    for (const world of [...taskWorlds, ...staticWorlds]) {
      if (!world?.manifest || seen.has(world.manifest)) continue;
      seen.add(world.manifest);
      merged.push(world);
    }
    return merged;
  }, [taskWorlds, staticWorlds]);

  const refreshIndex = useCallback(async () => {
    try {
      setIndexWarning(null);
      const index = await fetchWorldsIndex('/worlds/index.json');
      setStaticWorlds(index.worlds);
    } catch (err) {
      setStaticWorlds([]);
      setIndexWarning(err?.message || String(err));
    }
  }, []);

  useEffect(() => {
    void refreshIndex();
  }, [refreshIndex]);

  const enterWorld = async (manifestUrl) => {
    try {
      setError(null);
      await loadWorldFromManifestUrl(manifestUrl, { apiEndpoint });
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  const loadManifestDraft = async () => {
    const url = manifestDraft.trim();
    if (!url) return;
    await enterWorld(url);
  };

  return (
    <div
      className="world-library"
      style={{
        padding: compact ? '0.5rem' : '0.75rem',
        fontSize: compact ? '0.65rem' : '0.75rem',
        color: '#ccc',
        borderTop: '1px solid #333',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <strong style={{ color: '#eee' }}>Worlds</strong>
        {activeWorldId ? (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => clearWorld()}
            disabled={isLoading}
            style={{ fontSize: '0.6rem', padding: '0.2rem 0.4rem' }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {activeWorldId ? (
        <p style={{ margin: '0 0 0.5rem', color: '#8f8' }}>Active: {activeWorldId}</p>
      ) : (
        <p style={{ margin: '0 0 0.5rem', color: '#888' }}>No world loaded (avatar stays in scene).</p>
      )}

      {worlds.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.5rem' }}>
          {worlds.map((world) => (
            <li key={world.id} style={{ marginBottom: '0.35rem' }}>
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'stretch' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={isLoading}
                  onClick={() => enterWorld(world.manifest)}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    fontSize: '0.65rem',
                    background: activeWorldId === world.id ? '#2a4a2a' : undefined,
                  }}
                >
                  {world.name}
                  {taskWorlds.some((t) => t.id === world.id) ? (
                    <span style={{ color: '#8af', marginLeft: '0.35rem' }}>(task)</span>
                  ) : null}
                </button>
                <Link
                  to={buildIwsdkXrExploreUrl(world.manifest, { apiEndpoint, skipDemo: true })}
                  className="btn btn-sm"
                  style={{ fontSize: '0.55rem', padding: '0.2rem 0.35rem', whiteSpace: 'nowrap' }}
                  title="Galaxy XR IWSDK grab (ray + trigger / grip squeeze)"
                >
                  XR
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: '0 0 0.5rem', color: '#666' }}>
          Run an <strong>Image to World</strong> task, or add entries to{' '}
          <code>public/worlds/index.json</code>.
        </p>
      )}

      <label style={{ display: 'block', marginBottom: '0.25rem', color: '#aaa' }}>Manifest URL</label>
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        <input
          type="text"
          className="input"
          value={manifestDraft}
          onChange={(e) => setManifestDraft(e.target.value)}
          placeholder="/__dev_dgx_proxy/api/v1/system/jobs/<id>/download?asset=manifest"
          style={{ flex: 1, fontSize: '0.6rem', padding: '0.3rem' }}
        />
        <button
          type="button"
          className="btn btn-sm"
          disabled={isLoading || !manifestDraft.trim()}
          onClick={() => void loadManifestDraft()}
          style={{ fontSize: '0.6rem' }}
        >
          Load
        </button>
        {manifestDraft.trim() ? (
          <Link
            to={buildIwsdkXrExploreUrl(manifestDraft.trim(), { apiEndpoint, skipDemo: true })}
            className="btn btn-sm"
            style={{ fontSize: '0.6rem' }}
          >
            XR
          </Link>
        ) : null}
      </div>

      <p style={{ margin: '0.5rem 0 0', color: '#777', fontSize: '0.55rem' }}>
        Viewport: SceneManager + Spark (VRM + splat env in same scene). Enter VR on{' '}
        <code>/</code> to experience loaded worlds with your avatar.{' '}
        <strong>XR lab</strong> (<code>/xr</code>) — IWSDK grab regression on mesh props.
      </p>

      {indexWarning ? (
        <p style={{ margin: '0.5rem 0 0', color: '#aa8', fontSize: '0.6rem' }}>{indexWarning}</p>
      ) : null}

      {error ? (
        <p style={{ margin: '0.5rem 0 0', color: '#f88', fontSize: '0.6rem' }}>{error}</p>
      ) : null}
    </div>
  );
}
