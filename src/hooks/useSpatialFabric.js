import { useCallback, useEffect, useState } from 'react';
import {
  openSpatialFabricInBrowser,
  publishGlbBlobAndOpenMetaverseBrowser,
  publishJobAndOpenMetaverseBrowser,
  publishWorldAndOpenMetaverseBrowser,
  resolveMetaverseBrowserUrl,
  resolveSpatialFabricConfig,
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
        if (!cancelled) setConfig(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiEndpoint]);

  const openBrowser = useCallback(
    async (opts = {}) => {
      const url = await resolveMetaverseBrowserUrl(apiEndpoint, opts);
      openSpatialFabricInBrowser(url);
    },
    [apiEndpoint],
  );

  const publishJob = useCallback(
    async (jobId, assetName) => {
      if (!apiEndpoint) {
        throw new Error('Configure API endpoint to publish to spatial fabric');
      }
      return publishJobAndOpenMetaverseBrowser(apiEndpoint, jobId, assetName);
    },
    [apiEndpoint],
  );

  const sendGlbToMetaverseBrowser = useCallback(
    async (blob, filename, assetName, opts = {}) => {
      if (!apiEndpoint) {
        throw new Error('Configure API endpoint to send GLB to spatial fabric');
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
    async (manifestUrl, worldName) => {
      if (!apiEndpoint) {
        throw new Error('Configure API endpoint to publish worlds to spatial fabric');
      }
      if (!manifestUrl) {
        throw new Error('World manifest URL is required');
      }
      return publishWorldAndOpenMetaverseBrowser(apiEndpoint, manifestUrl, worldName);
    },
    [apiEndpoint],
  );

  return {
    config,
    loading,
    enabled: Boolean(config?.enabled || config?.msfPublicUrl),
    openBrowser,
    publishJob,
    publishWorld,
    sendGlbToMetaverseBrowser,
  };
}
