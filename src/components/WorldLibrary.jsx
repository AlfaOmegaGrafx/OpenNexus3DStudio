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
import { getSyncSceneAssemblerUrl, preopenSpatialFabricTab, queueBakeEnvMesh } from '../library/spatialFabricAdapter.js';
import styles from './WorldLibrary.module.css';

/**
 * Pick and load explorable world packages (splat env + mesh props).
 */
export default function WorldLibrary({ apiEndpoint = '', compact = false }) {
  const {
    activeWorldId,
    loadWorldFromManifestUrl,
    clearWorld,
    isLoading,
    worldEnvVisibility,
    setWorldEnvironmentLayerVisible,
  } = useScene();
  const { tasks } = useTask();
  const [staticWorlds, setStaticWorlds] = useState([]);
  const [indexWarning, setIndexWarning] = useState(null);
  const [error, setError] = useState(null);
  const [manifestDraft, setManifestDraft] = useState('');
  const [publishingWorldId, setPublishingWorldId] = useState(null);
  const [bakingWorldId, setBakingWorldId] = useState(null);
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
      const preopenedTab = preopenSpatialFabricTab(getSyncSceneAssemblerUrl());
      console.log('[SpatialFabric] world publish start', {
        worldId: world.id,
        manifest: world.manifest,
      });
      await publishWorld(world.manifest, world.name, { preopenedTab });
    } catch (err) {
      console.error('[SpatialFabric] world publish failed', err);
      setError(err?.message || String(err));
    } finally {
      setPublishingWorldId(null);
    }
  };

  const handleBakeEnvMesh = async (world) => {
    try {
      setError(null);
      setBakingWorldId(world.id);
      const data = await queueBakeEnvMesh(apiEndpoint, world.id, { quality: 'photo' });
      setError(
        null,
      );
      alert(
        `Photo-quality env mesh bake queued (job ${data.job_id || '?'}). ` +
          'When complete, re-enter the world and Show GLB (Hide 3DGS).',
      );
    } catch (err) {
      console.error('[WorldLibrary] bake-env-mesh failed', err);
      setError(err?.message || String(err));
    } finally {
      setBakingWorldId(null);
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
        <>
          <p className={styles.statusActive} title={activeWorldId}>
            Active: {activeWorldId}
          </p>
          {(worldEnvVisibility?.hasSplat || worldEnvVisibility?.hasMesh) && (
            <div className={styles.layerToggles} role="group" aria-label="World environment layers">
              {worldEnvVisibility.hasSplat ? (
                <button
                  type="button"
                  className={`btn btn-sm ${styles.layerBtn} ${
                    worldEnvVisibility.splatVisible ? styles.layerBtnOn : ''
                  }`}
                  disabled={isLoading}
                  title={
                    worldEnvVisibility.splatVisible
                      ? 'Hide Gaussian splat (3DGS)'
                      : 'Show Gaussian splat (hides env GLB)'
                  }
                  onClick={() =>
                    setWorldEnvironmentLayerVisible('splat', !worldEnvVisibility.splatVisible)
                  }
                >
                  {worldEnvVisibility.splatVisible ? 'Hide 3DGS' : 'Show 3DGS'}
                </button>
              ) : null}
              {worldEnvVisibility.hasMesh ? (
                <button
                  type="button"
                  className={`btn btn-sm ${styles.layerBtn} ${
                    worldEnvVisibility.meshVisible ? styles.layerBtnOn : ''
                  }`}
                  disabled={isLoading}
                  title={
                    worldEnvVisibility.meshVisible
                      ? 'Hide baked environment GLB'
                      : 'Show baked environment GLB (hides 3DGS)'
                  }
                  onClick={() =>
                    setWorldEnvironmentLayerVisible('mesh', !worldEnvVisibility.meshVisible)
                  }
                >
                  {worldEnvVisibility.meshVisible ? 'Hide GLB' : 'Show GLB'}
                </button>
              ) : null}
            </div>
          )}
        </>
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
                    title="Photo-quality bake: denser TSDF mesh + vertex colors from walk frames (for viewport / OMB)"
                    disabled={
                      isLoading ||
                      bakingWorldId === world.id ||
                      !apiEndpoint ||
                      !fromTask
                    }
                    onClick={() => void handleBakeEnvMesh(world)}
                  >
                    {bakingWorldId === world.id ? '…' : 'Bake'}
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${styles.actionBtn}`}
                    title="Publish env mesh + props GLBs to MSF object library and open Scene Assembler"
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
        Viewport loads Spark 3DGS and baked <code>environment_mesh.glb</code> when present — only
        one is visible at a time (use Hide/Show 3DGS and Hide/Show GLB). Enter VR on <code>/</code>.{' '}
        <strong>XR lab</strong> (<code>/xr</code>) — IWSDK grab on mesh props. RP1 needs a linked MSF
        host (<code>VITE_MSF_PUBLIC_URL</code>).
      </p>

      {indexWarning ? <p className={styles.warning}>{indexWarning}</p> : null}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
