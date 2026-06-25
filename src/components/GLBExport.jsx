import React, { useState, useRef } from 'react';
import { useScene } from '../context/SceneContext';
import { useSpatialFabric } from '../hooks/useSpatialFabric.js';
import { getCompressHint } from '../library/glbCompressPresets.js';
import {
  OMB_EXPORT_PRESETS,
  OMB_GUIDELINES_URL,
  buildOmbExportOptions,
  getOmbPresetHint,
} from '../library/ombExportPresets.js';
import {
  getSpatialFabricEnv,
  getSyncSceneAssemblerUrl,
  normalizeOmbTier,
  preopenSpatialFabricTab,
  validateGlbBlob,
} from '../library/spatialFabricAdapter.js';

const GLBExport = ({ apiEndpoint = '' }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isSpatialBusy, setIsSpatialBusy] = useState(false);
  const [lastExportBlob, setLastExportBlob] = useState(null);
  const [ombHint, setOmbHint] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const cardHeaderRef = useRef(null);
  const [exportOptions, setExportOptions] = useState({
    filename: 'opennexus3dstudio_export.glb',
    forOpenNexus3DStudio: true,
    optimize: true,
    includeTextures: true,
    includeAnimations: true,
    compressGlb: true,
    compressQuality: 50,
    ombTierPreset: '',
    ombUsePbr: true,
  });

  const { currentModel, exportModel } = useScene();
  const {
    sendGlbToMetaverseBrowser,
    config: spatialConfig,
    sceneAssemblerReady,
  } = useSpatialFabric(apiEndpoint);
  const compressHint = getCompressHint(exportOptions.compressQuality);
  const ombPresetHint = exportOptions.ombTierPreset
    ? getOmbPresetHint(exportOptions.ombTierPreset, exportOptions.ombUsePbr !== false)
    : '';

  const handleOmbPresetChange = (presetId) => {
    if (!presetId) {
      setExportOptions((prev) => ({
        ...prev,
        ombTierPreset: '',
        targetMaxTriangles: undefined,
        textureEdge: undefined,
        compressPreset: undefined,
        ombTargetTier: undefined,
      }));
      return;
    }
    const built = buildOmbExportOptions(presetId, {
      usePbr: exportOptions.ombUsePbr !== false,
      filename: exportOptions.filename,
    });
    if (built) setExportOptions((prev) => ({ ...prev, ...built }));
  };

  const handleOmbUsePbrChange = (usePbr) => {
    setExportOptions((prev) => {
      const next = { ...prev, ombUsePbr: usePbr };
      if (prev.ombTierPreset) {
        const built = buildOmbExportOptions(prev.ombTierPreset, {
          usePbr,
          filename: prev.filename,
        });
        if (built) Object.assign(next, built);
      }
      return next;
    });
  };

  const buildViewportExportOptions = (overrides = {}) => ({
    ...exportOptions,
    skipDownload: true,
    ...overrides,
  });

  const handleExport = async () => {
    if (!currentModel) {
      alert('No model to export');
      return;
    }

    try {
      setIsExporting(true);

      const result = await exportModel('glb', buildViewportExportOptions());

      if (result?.blob instanceof Blob) {
        setLastExportBlob(result.blob);
      }

      if (result?.compressStats) {
        const s = result.compressStats;
        alert(
          `Exported ${result.filename}\n` +
            `${s.beforeLabel} → ${s.afterLabel} (${s.savingsPercent >= 0 ? '−' : '+'}${Math.abs(s.savingsPercent)}%)\n` +
            `${s.sourceTris.toLocaleString()} → ${s.finalTris.toLocaleString()} triangles` +
            (s.safeMode ? '\n(Rig-safe mode — no mesh simplification)' : ''),
        );
      } else {
        alert(`Model exported successfully as ${result.filename}`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleOptionChange = (option, value) => {
    setExportOptions((prev) => ({
      ...prev,
      [option]: value,
    }));
  };

  const handleSendToMetaverseBrowser = async () => {
    if (!currentModel) {
      alert('No model in viewport to send');
      return;
    }
    if (!apiEndpoint) {
      alert('Configure API endpoint to send GLB to the Metaverse Browser');
      return;
    }
    try {
      setIsSpatialBusy(true);
      const preopenedTab = preopenSpatialFabricTab(getSyncSceneAssemblerUrl());
      const result = await exportModel('glb', buildViewportExportOptions());
      if (!(result?.blob instanceof Blob)) {
        throw new Error('Viewport export did not produce a GLB');
      }
      const filename = result.filename || exportOptions.filename;
      const assetStem = filename.replace(/-draco\.glb$/i, '').replace(/\.glb$/i, '');
      const published = await sendGlbToMetaverseBrowser(
        result.blob,
        filename,
        assetStem,
        { preopenedTab },
      );
      const omb = normalizeOmbTier(published?.omb);
      if (omb) setOmbHint(omb);
      const compressNote = result.compressStats
        ? `\nCompression: ${result.compressStats.beforeLabel} → ${result.compressStats.afterLabel}`
        : exportOptions.compressGlb
          ? ''
          : '\n(No Draco/WebP compression — enable in settings above to shrink file)';
      alert(
        `Sent to Metaverse Browser.\n` +
          `Asset: ${published?.published?.object_name || assetStem}.glb` +
          (omb?.recommendedTier ? `\nOMB tier ${omb.recommendedTier}${omb.label ? ` (${omb.label})` : ''}` : '') +
          compressNote,
      );
    } catch (error) {
      console.error('[GLBExport] send to metaverse failed', error);
      alert(`Send to Metaverse Browser failed: ${error.message}`);
    } finally {
      setIsSpatialBusy(false);
    }
  };

  const handleValidateOmb = async () => {
    if (!currentModel) {
      alert('No model in viewport');
      return;
    }
    try {
      setIsSpatialBusy(true);
      let blob = lastExportBlob;
      let filename = exportOptions.filename;
      if (!blob) {
        const result = await exportModel('glb', buildViewportExportOptions());
        blob = result?.blob;
        filename = result?.filename || filename;
        if (blob instanceof Blob) setLastExportBlob(blob);
      }
      if (!(blob instanceof Blob)) {
        alert('Could not export viewport GLB for validation');
        return;
      }
      const env = getSpatialFabricEnv();
      if (apiEndpoint) {
        const report = await validateGlbBlob(apiEndpoint, blob, filename);
        const omb = normalizeOmbTier(report?.omb) || report?.omb;
        setOmbHint(omb);
        alert(
          `OMB tier ${omb?.recommendedTier ?? report?.omb?.recommended_tier ?? '?'} — ` +
            `${report?.stats?.triangles?.toLocaleString?.() ?? '?'} triangles`,
        );
      } else {
        setOmbHint(null);
        alert(
          `Configure API endpoint to run server-side GLB validation. Fabric: ${env.fabricMsfUrl || 'not set'}`,
        );
      }
    } catch (error) {
      alert(`OMB validation failed: ${error.message}`);
    } finally {
      setIsSpatialBusy(false);
    }
  };

  const handleFilenameChange = (e) => {
    const filename = e.target.value;
    if (!filename.endsWith('.glb')) {
      setExportOptions((prev) => ({
        ...prev,
        filename: filename + '.glb',
      }));
    } else {
      setExportOptions((prev) => ({
        ...prev,
        filename,
      }));
    }
  };

  return (
    <div className="glb-export">
      <div className="card">
        <div className="card-header" ref={cardHeaderRef}>
          <button
            onClick={() => {
              const newExpanded = !isExpanded;
              setIsExpanded(newExpanded);
              if (newExpanded && cardHeaderRef.current) {
                setTimeout(() => {
                  cardHeaderRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                    inline: 'nearest',
                  });
                }, 0);
              }
            }}
            className="expand-icon-button"
            title={isExpanded ? 'Collapse GLB Export' : 'Expand GLB Export'}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <h3 className="card-title">GLB Export</h3>
        </div>

        {isExpanded && (
          <div className="export-content">
            {!currentModel ? (
              <div className="no-model">
                <p>No model loaded</p>
                <p className="text-sm text-gray-400">Load a model first to export it</p>
              </div>
            ) : (
              <div className="export-options">
                <div className="option-group">
                  <label className="block mb-1">Filename:</label>
                  <input
                    type="text"
                    value={exportOptions.filename}
                    onChange={handleFilenameChange}
                    className="input w-full"
                    placeholder="export.glb"
                  />
                </div>

                <div className="option-group">
                  <label className="block mb-1">OMB Spatial Fabric preset</label>
                  <select
                    className="input w-full"
                    value={exportOptions.ombTierPreset || ''}
                    onChange={(e) => handleOmbPresetChange(e.target.value)}
                  >
                    <option value="">Custom (manual compression)</option>
                    {OMB_EXPORT_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label} — {preset.hint}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Targets{' '}
                    <a href={OMB_GUIDELINES_URL} target="_blank" rel="noopener noreferrer">
                      OMB model guidelines
                    </a>{' '}
                    triangle and texture budgets. Enables Draco + WebP and caps geometry/textures on
                    export.
                  </p>
                  {exportOptions.ombTierPreset ? (
                    <>
                      <label className="flex items-center gap-2 mt-2">
                        <input
                          type="checkbox"
                          checked={exportOptions.ombUsePbr !== false}
                          onChange={(e) => handleOmbUsePbrChange(e.target.checked)}
                        />
                        <span>PBR materials (normal/metal/rough maps bump tier +1)</span>
                      </label>
                      <p className="text-xs text-gray-400 mt-1">{ombPresetHint}</p>
                    </>
                  ) : null}
                </div>

                <div className="option-group">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={exportOptions.forOpenNexus3DStudio}
                      onChange={(e) => handleOptionChange('forOpenNexus3DStudio', e.target.checked)}
                    />
                    <span>Optimize for OpenNexus3DStudio</span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">
                    Adds VRM compatibility and OpenNexus3DStudio-specific optimizations
                  </p>
                </div>

                <div className="option-group">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={exportOptions.optimize}
                      onChange={(e) => handleOptionChange('optimize', e.target.checked)}
                    />
                    <span>Optimize model</span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">
                    Merge geometries and optimize materials
                  </p>
                </div>

                <div className="option-group">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={exportOptions.compressGlb}
                      onChange={(e) => handleOptionChange('compressGlb', e.target.checked)}
                    />
                    <span>Compress for web / games (Draco + WebP)</span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">
                    Shrinks file size dramatically. Rigged models use safe mode automatically.
                  </p>
                </div>

                {exportOptions.compressGlb && !exportOptions.ombTierPreset && (
                  <div className="option-group">
                    <label className="block mb-1">
                      Smaller file ↔ Sharper look ({exportOptions.compressQuality})
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={exportOptions.compressQuality}
                      onChange={(e) =>
                        handleOptionChange('compressQuality', Number(e.target.value))
                      }
                      className="w-full"
                    />
                    <p className="text-xs text-gray-400 mt-1">{compressHint}</p>
                  </div>
                )}

                <div className="option-group">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeTextures}
                      onChange={(e) => handleOptionChange('includeTextures', e.target.checked)}
                    />
                    <span>Include textures</span>
                  </label>
                </div>

                <div className="option-group">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeAnimations}
                      onChange={(e) => handleOptionChange('includeAnimations', e.target.checked)}
                    />
                    <span>Include animations</span>
                  </label>
                </div>

                <div className="export-actions">
                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="btn btn-primary w-full"
                  >
                    {isExporting ? (
                      <>
                        <div className="spinner mr-2"></div>
                        Exporting...
                      </>
                    ) : (
                      'Export GLB'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleValidateOmb}
                    disabled={isSpatialBusy || !currentModel}
                    className="btn btn-secondary w-full mt-2"
                    title="Export viewport with current settings and check OMB tier"
                  >
                    {isSpatialBusy ? 'Working…' : 'Validate OMB tier'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSendToMetaverseBrowser()}
                    disabled={isSpatialBusy || !currentModel || !apiEndpoint || !sceneAssemblerReady}
                    className="btn btn-secondary w-full mt-2"
                    title={
                      sceneAssemblerReady
                        ? 'Export viewport GLB with current compression settings and publish to MSF / Open Metaverse Browser'
                        : 'Link MSF Map Service (VITE_MSF_PUBLIC_URL or 3DAIGC API) to publish to Scene Assembler'
                    }
                  >
                    {isSpatialBusy ? 'Sending…' : 'Send To Metaverse Browser'}
                  </button>
                  {spatialConfig?.msfPublicUrl ? (
                    <p className="text-xs text-gray-400 mt-2">
                      Scene Assembler: {spatialConfig.msfPublicUrl}
                      {spatialConfig.fabricMsfUrl ? (
                        <>
                          <br />
                          Fabric URL (paste on login): {spatialConfig.fabricMsfUrl}
                        </>
                      ) : null}
                    </p>
                  ) : !sceneAssemblerReady ? (
                    <p className="text-xs text-gray-400 mt-2">
                      Metaverse publish requires a linked MSF host — see World Library → OMB spatial
                      fabric guide.
                    </p>
                  ) : null}
                  {ombHint?.recommendedTier || ombHint?.recommended_tier ? (
                    <p className="text-xs text-gray-400 mt-2">
                      OMB hint: Tier {ombHint.recommendedTier ?? ombHint.recommended_tier}
                      {ombHint.label ? ` (${ombHint.label})` : ''}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GLBExport;
