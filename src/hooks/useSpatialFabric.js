import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  isSceneAssemblerConfigured,
  openSpatialFabricInBrowser,
  publishGlbBlobAndOpenMetaverseBrowser,
  publishJobAndOpenMetaverseBrowser,
  publishWorldAndOpenMetaverseBrowser,
  resolveOmbGuidelinesUrl,
  resolveSceneAssemblerUrl,
  resolveSpatialFabricConfig,
  mergeSpatialFabricConfig,
} from '../library/spatialFabricAdapter.js';

/**
 * Shared spatial fabric / Metaverse Browser state for World Library, GLB export, tasks.
 * @param {string} apiEndpoint
 */
export function useSpatialFabric(apiEndpoint = '') {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    resolveSpatialFabricConfig(apiEndpoint)
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) setConfig(mergeSpatialFabricConfig(null));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiEndpoint]);

  const sceneAssemblerReady = useMemo(
    () => isSceneAssemblerConfigured(config),
    [config],
  );

  const openSceneAssembler = useCallback(
    async (opts = {}) => {
      const url = await resolveSceneAssemblerUrl(apiEndpoint, opts);
      if (!url) {
        throw new Error(
          'Scene Assembler is not linked. Set VITE_MSF_PUBLIC_URL or connect to a 3DAIGC API with MSF_PUBLIC_BASE_URL.',
        );
      }
      openSpatialFabricInBrowser(url, opts.preopenedTab);
    },
    [apiEndpoint],
  );

  const openOmbGuidelines = useCallback(async (opts = {}) => {
    const url = await resolveOmbGuidelinesUrl(apiEndpoint);
    openSpatialFabricInBrowser(url, opts.preopenedTab);
  }, [apiEndpoint]);

  /** Opens Scene Assembler when linked, otherwise OMB guidelines (legacy callers). */
  const openBrowser = useCallback(
    async (opts = {}) => {
      const url = await resolveSceneAssemblerUrl(apiEndpoint, opts);
      if (url) {
        openSpatialFabricInBrowser(url, opts.preopenedTab);
        return;
      }
      openSpatialFabricInBrowser(
        await resolveOmbGuidelinesUrl(apiEndpoint),
        opts.preopenedTab,
      );
    },
    [apiEndpoint],
  );

  const publishJob = useCallback(
    async (jobId, assetName, opts = {}) => {
      if (!apiEndpoint) {
        throw new Error('Configure API endpoint to publish to spatial fabric');
      }
      return publishJobAndOpenMetaverseBrowser(apiEndpoint, jobId, assetName, opts);
    },
    [apiEndpoint],
  );

  const sendGlbToMetaverseBrowser = useCallback(
    async (blob, filename, assetName, opts = {}) => {
      if (!apiEndpoint) {
        throw new Error('Configure API endpoint to send GLB to the Metaverse Browser');
      }
      if (!(blob instanceof Blob)) {
        throw new Error('No GLB data to send');
      }
      return publishGlbBlobAndOpenMetaverseBrowser(
        apiEndpoint,
        blob,
        filename,
        assetName,
        opts,
      );
    },
    [apiEndpoint],
  );

  const publishWorld = useCallback(
    async (manifestUrl, worldName, opts = {}) => {
      if (!apiEndpoint) {
        throw new Error('Configure API endpoint to publish worlds to spatial fabric');
      }
      if (!manifestUrl) {
        throw new Error('World manifest URL is required');
      }
      return publishWorldAndOpenMetaverseBrowser(apiEndpoint, manifestUrl, worldName, opts);
    },
    [apiEndpoint],
  );

  return {
    config,
    loading,
    sceneAssemblerReady,
    enabled: sceneAssemblerReady,
    openBrowser,
    openSceneAssembler,
    openOmbGuidelines,
    publishJob,
    publishWorld,
    sendGlbToMetaverseBrowser,
  };
}
