import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useScene } from '../context/SceneContext';
import { useTask } from '../context/TaskContext';
import { useSpatialFabric } from '../hooks/useSpatialFabric.js';
import {
  fetchWorldsIndex,
  listWorldsFromCompletedTasks,
} from '../library/worldPackage.js';
import { buildIwsdkXrExploreUrl } from '../library/iwsdkWorldPackage.js';
import styles from './WorldLibrary.module.css';

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
  const [publishingWorldId, setPublishingWorldId] = useState(null);
  const {
    openSceneAssembler,
    openOmbGuidelines,
    publishWorld,
    config: spatialConfig,
    sceneAssemblerReady,
  } = useSpatialFabric(apiEndpoint);

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

  const handlePublishWorldRp1 = async (world) => {
    try {
      setError(null);
      setPublishingWorldId(world.id);
      console.log('[SpatialFabric] world publish start', {
        worldId: world.id,
        manifest: world.manifest,
      });
      await publishWorld(world.manifest, world.name);
    } catch (err) {
      console.error('[SpatialFabric] world publish failed', err);
      setError(err?.message || String(err));
    } finally {
      setPublishingWorldId(null);
    }
  };

  return (
    <div className={`world-library ${styles.root} ${compact ? '' : styles.rootExpanded}`}>
      <div className={styles.header}>
        <strong className={styles.title}>Worlds</strong>
        {activeWorldId ? (
          <button
            type="button"
            className={`btn btn-sm ${styles.clearBtn}`}
            onClick={() => clearWorld()}
            disabled={isLoading}
          >
            Clear
          </button>
        ) : null}
      </div>

      {activeWorldId ? (
        <p className={styles.statusActive} title={activeWorldId}>
          Active: {activeWorldId}
        </p>
      ) : (
        <p className={styles.statusIdle}>No world loaded (avatar stays in scene).</p>
      )}

      {worlds.length > 0 ? (
        <ul className={styles.worldList}>
          {worlds.map((world) => {
            const fromTask = taskWorlds.some((t) => t.id === world.id);
            const displayName = fromTask ? `${world.name} (task)` : world.name;
            return (
              <li key={world.id} className={styles.worldItem}>
                <div className={styles.worldRow}>
                  <button
                    type="button"
                    className={`btn btn-sm ${styles.worldNameBtn} ${
                      activeWorldId === world.id ? styles.worldNameBtnActive : ''
                    }`}
                    disabled={isLoading}
                    onClick={() => enterWorld(world.manifest)}
                    title={displayName}
                  >
                    <span className={styles.worldNameText}>{world.name}</span>
                    {fromTask ? <span className={styles.taskBadge}>(task)</span> : null}
                  </button>
                  <Link
                    to={buildIwsdkXrExploreUrl(world.manifest, { apiEndpoint, skipDemo: true })}
                    className={`btn btn-sm ${styles.actionBtn}`}
                    title="Galaxy XR IWSDK grab (ray + trigger / grip squeeze)"
                  >
                    XR
                  </Link>
                  <button
                    type="button"
                    className={`btn btn-sm ${styles.actionBtn}`}
                    title="Publish world mesh props to MSF object library and open Scene Assembler"
                    disabled={
                      isLoading ||
                      publishingWorldId === world.id ||
                      !apiEndpoint ||
                      !sceneAssemblerReady
                    }
                    onClick={() => void handlePublishWorldRp1(world)}
                  >
                    {publishingWorldId === world.id ? '…' : 'RP1'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.emptyHint}>
          Run an <strong>Image to World</strong> task, or add entries to{' '}
          <code>public/worlds/index.json</code>.
        </p>
      )}

      <label className={styles.label}>Manifest URL</label>
      <div className={styles.manifestRow}>
        <input
          type="text"
          className={`input ${styles.manifestInput}`}
          value={manifestDraft}
          onChange={(e) => setManifestDraft(e.target.value)}
          placeholder="/__dev_dgx_proxy/api/v1/system/jobs/<id>/download?asset=manifest"
        />
        <button
          type="button"
          className={`btn btn-sm ${styles.manifestBtn}`}
          disabled={isLoading || !manifestDraft.trim()}
          onClick={() => void loadManifestDraft()}
        >
          Load
        </button>
        {manifestDraft.trim() ? (
          <Link
            to={buildIwsdkXrExploreUrl(manifestDraft.trim(), { apiEndpoint, skipDemo: true })}
            className={`btn btn-sm ${styles.manifestBtn}`}
          >
            XR
          </Link>
        ) : null}
      </div>

      <div className={styles.actionsRow}>
        {sceneAssemblerReady ? (
          <button
            type="button"
            className={`btn btn-sm ${styles.sceneAssemblerBtn}`}
            title={`Open RP1 Scene Assembler at ${spatialConfig.msfPublicUrl}`}
            onClick={() => void openSceneAssembler().catch((err) => alert(err.message))}
          >
            Scene Assembler
          </button>
        ) : (
          <button
            type="button"
            className={`btn btn-sm btn-secondary ${styles.sceneAssemblerBtn}`}
            title="OMB spatial fabric model guidelines"
            onClick={() => void openOmbGuidelines()}
          >
            OMB spatial fabric guide
          </button>
        )}
      </div>

      {sceneAssemblerReady && spatialConfig?.msfPublicUrl ? (
        <p className={styles.meta}>
          Scene Assembler: {spatialConfig.msfPublicUrl}
          {spatialConfig.fabricMsfUrl ? (
            <>
              <br />
              Fabric URL (paste on login): {spatialConfig.fabricMsfUrl}
            </>
          ) : null}
        </p>
      ) : !sceneAssemblerReady ? (
        <p className={styles.meta}>
          Scene Assembler needs a linked MSF host (set <code>VITE_MSF_PUBLIC_URL</code> or connect
          to 3DAIGC API with <code>MSF_PUBLIC_BASE_URL</code>).
        </p>
      ) : null}

      <p className={styles.hint}>
        Viewport: SceneManager + Spark (VRM + splat env in same scene). Enter VR on{' '}
        <code>/</code> to experience loaded worlds with your avatar.{' '}
        <strong>XR lab</strong> (<code>/xr</code>) — IWSDK grab regression on mesh props.
      </p>

      {indexWarning ? <p className={styles.warning}>{indexWarning}</p> : null}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
