import React, { useEffect, useState } from 'react';
import { fetchModelParameters, buildDefaultModelParameters } from '../library/modelParametersApi.js';
import {
  AUTO_RIG_MODES,
  DEFAULT_HUMANOID_TEMPLATE_ID,
  TEMPLATE_RIG_MODEL_ID,
} from '../library/avatarPipelineCatalog.js';
import {
  CREATURE_TEMPLATE_OPTIONS,
  CREATURE_TEMPLATE_RIG_MODEL_ID,
  DEFAULT_CREATURE_TEMPLATE_ID,
} from '../library/creaturePipelineCatalog.js';
import { getDefaultAutoRigOutputFormat, isQuadRemeshModel } from '../library/aiModelsCatalog.js';
import {
  API_MAX_MESH_VERTICES,
  PIPELINE_MESH_DECIMATION_MAX,
  PIPELINE_MESH_DECIMATION_TARGET,
  PIPELINE_MESH_SIMPLIFY_DEFAULT,
  clampPipelineDecimationTarget,
} from '../library/aiModelsCatalog.js';
import {
  OMB_EXPORT_PRESETS,
  OMB_GUIDELINES_URL,
  buildOmbTaskOptions,
} from '../library/ombExportPresets.js';

/**
 * @param {number} ratio mesh_simplify keep-ratio (0–1)
 * @param {number|null|undefined} currentTarget existing decimation_target
 * @param {number|null|undefined} previousRatio previous mesh_simplify used with currentTarget
 */
export function estimateDecimationTarget(ratio, currentTarget, previousRatio) {
  const r = Math.max(0.01, Math.min(1, Number(ratio) || PIPELINE_MESH_SIMPLIFY_DEFAULT));
  const prev = Number(previousRatio);
  const target = Number(currentTarget);
  let estimated;
  if (Number.isFinite(target) && target > 0 && Number.isFinite(prev) && prev > 0) {
    estimated = Math.round((target / prev) * r);
  } else if (Number.isFinite(target) && target > 0) {
    estimated = Math.round(target);
  } else {
    // Slider maps onto the pipeline face budget (not TRELLIS.2's raw 1M default).
    estimated = Math.round(PIPELINE_MESH_DECIMATION_TARGET * (r / PIPELINE_MESH_SIMPLIFY_DEFAULT));
  }
  return clampPipelineDecimationTarget(estimated);
}

/**
 * @param {number} triangles
 */
export function formatTriangleCount(triangles) {
  const n = Math.max(0, Math.round(Number(triangles) || 0));
  return n.toLocaleString();
}

/**
 * Common + model-specific 3DAIGC parameters (ported from Open3DStudio AdvancedParameters).
 */
const TaskAdvancedOptions = ({ apiEndpoint, modelId, taskType, value, onChange }) => {
  const isAutoRig = taskType === 'auto-rigging';
  const isTextToImage = taskType === 'text-to-image';
  const isMeshRetopology = taskType === 'mesh-retopology';
  const isQuadRemesh = isQuadRemeshModel(modelId);
  const [expanded, setExpanded] = useState(false);
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || !apiEndpoint || !modelId) return;

    let cancelled = false;
    setLoading(true);
    fetchModelParameters(apiEndpoint, modelId)
      .then((params) => {
        if (cancelled) return;
        setSchema(params);
        if (params && onChange) {
          const defaults = buildDefaultModelParameters(params);
          if (defaults.decimation_target != null) {
            defaults.decimation_target = clampPipelineDecimationTarget(
              Math.min(
                Number(defaults.decimation_target) || PIPELINE_MESH_DECIMATION_TARGET,
                PIPELINE_MESH_DECIMATION_MAX,
              ),
            );
          }
          onChange({
            ...value,
            // Keep pipeline-safe / user values; fill only missing schema keys.
            model_parameters: { ...defaults, ...(value?.model_parameters || {}) },
          });
        }
      })
      .catch(() => {
        if (!cancelled) setSchema(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [expanded, apiEndpoint, modelId]);

  const setField = (key, fieldValue) => {
    onChange?.({ ...value, [key]: fieldValue });
  };

  const setModelParam = (key, fieldValue) => {
    onChange?.({
      ...value,
      model_parameters: { ...(value?.model_parameters || {}), [key]: fieldValue },
    });
  };

  const setRigMode = (mode) => {
    const next = { ...value, rig_mode: mode };
    if (mode === AUTO_RIG_MODES.TEMPLATE) {
      next.output_format = 'glb';
      next.humanoid_template_id = next.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID;
    }
    if (mode === AUTO_RIG_MODES.CREATURE_TEMPLATE) {
      next.output_format = 'glb';
      next.creature_template_id = next.creature_template_id ?? DEFAULT_CREATURE_TEMPLATE_ID;
    }
    if (mode !== AUTO_RIG_MODES.FULL && next.model_parameters?.with_skinning !== undefined) {
      const { with_skinning: _removed, ...rest } = next.model_parameters;
      next.model_parameters = rest;
    }
    onChange?.(next);
  };

  const inputStyle = {
    width: '100%',
    padding: '0.3rem',
    fontSize: '0.65rem',
    background: '#1a1a1a',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#eee',
  };

  const labelStyle = {
    fontSize: '0.6rem',
    color: '#aaa',
    marginBottom: '0.15rem',
    display: 'block',
  };

  const hintStyle = {
    fontSize: '0.55rem',
    color: '#777',
    lineHeight: 1.35,
    margin: 0,
  };

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ fontSize: '0.6rem', padding: '0.2rem 0.4rem', width: '100%' }}
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? '▼' : '▶'} Advanced parameters {loading ? '(loading…)' : ''}
      </button>

      {expanded && (
        <div
          style={{
            marginTop: '0.35rem',
            padding: '0.5rem',
            border: '1px solid #444',
            borderRadius: '4px',
            background: '#111',
          }}
        >
          {!isAutoRig && isTextToImage && (
            <>
              <div style={{ marginBottom: '0.4rem' }}>
                <label style={labelStyle}>Width (px)</label>
                <input
                  type="number"
                  min={512}
                  max={2048}
                  step={64}
                  style={inputStyle}
                  value={value?.image_width ?? 1024}
                  onChange={(e) => setField('image_width', Number(e.target.value) || 1024)}
                />
              </div>
              <div style={{ marginBottom: '0.4rem' }}>
                <label style={labelStyle}>Height (px)</label>
                <input
                  type="number"
                  min={512}
                  max={2048}
                  step={64}
                  style={inputStyle}
                  value={value?.image_height ?? 1024}
                  onChange={(e) => setField('image_height', Number(e.target.value) || 1024)}
                />
              </div>
              <div style={{ marginBottom: '0.4rem' }}>
                <label style={labelStyle}>Output format</label>
                <select
                  style={inputStyle}
                  value={value?.output_format ?? 'png'}
                  onChange={(e) => setField('output_format', e.target.value)}
                >
                  <option value="png">PNG</option>
                  <option value="webp">WebP</option>
                </select>
              </div>
              <p style={{ ...hintStyle, marginBottom: '0.5rem' }}>
                Krea 2 Turbo defaults: 8 steps, CFG 0. Use seed in model parameters below for
                reproducibility. Generation is local (~6–8 min on GB10); no Krea cloud API.
              </p>
            </>
          )}

          {isMeshRetopology && (
            <>
              <div style={{ marginBottom: '0.4rem' }}>
                <label style={labelStyle}>Output format</label>
                <select
                  style={inputStyle}
                  value={value?.output_format ?? (isQuadRemesh ? 'obj' : 'glb')}
                  onChange={(e) => setField('output_format', e.target.value)}
                >
                  <option value="glb">GLB (Mesh Decimate default — viewport)</option>
                  <option value="obj">OBJ (quad topology — AutoRemesher default)</option>
                  <option value="ply">PLY</option>
                </select>
                <p style={{ ...hintStyle, marginTop: '0.25rem' }}>
                  {isQuadRemesh ? (
                    <>
                      <strong>Mesh Decimate</strong> → pick GLB here. <strong>AutoRemesher</strong>{' '}
                      defaults to OBJ (true quads); GLB triangulates quads for viewport loading.
                    </>
                  ) : (
                    <>Mesh Decimate keeps the original triangles — use GLB for the viewport.</>
                  )}
                </p>
              </div>
              {modelId === 'autoremesher_retopology' && (
                <>
                  <div style={{ marginBottom: '0.4rem' }}>
                    <label style={labelStyle}>
                      Adaptivity ({Number(value?.model_parameters?.adaptivity ?? 0.35).toFixed(2)})
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={value?.model_parameters?.adaptivity ?? 0.35}
                      onChange={(e) =>
                        setModelParam('adaptivity', parseFloat(e.target.value))
                      }
                      style={{ width: '100%' }}
                    />
                    <p style={{ ...hintStyle, marginTop: '0.25rem' }}>
                      Lower adaptivity reduces holes on organic AIGC meshes (default 0.35).
                    </p>
                  </div>
                  <div style={{ marginBottom: '0.4rem' }}>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(value?.model_parameters?.include_all_fragments)}
                        onChange={(e) =>
                          setModelParam('include_all_fragments', e.target.checked)
                        }
                      />
                      Remesh all significant fragments (not just largest shell)
                    </label>
                    <p style={{ ...hintStyle, marginTop: '0.25rem' }}>
                      Off (default) remeshes the main character shell only — fewer holes. On
                      includes cape/finger debris but may leave gaps between islands.
                    </p>
                  </div>
                </>
              )}
            </>
          )}

          {!isAutoRig && !isTextToImage && !isMeshRetopology && (
            <>
              <div style={{ marginBottom: '0.5rem' }}>
                <label style={labelStyle}>OMB Spatial Fabric preset (generation)</label>
                <select
                  style={inputStyle}
                  value={value?.omb_task_preset ?? ''}
                  onChange={(e) => {
                    const tier = e.target.value ? Number(e.target.value) : 0;
                    if (!tier) {
                      onChange?.({ ...value, omb_task_preset: '' });
                      return;
                    }
                    const omb = buildOmbTaskOptions(tier);
                    onChange?.({
                      ...value,
                      omb_task_preset: String(tier),
                      texture_resolution: omb.texture_resolution,
                      mesh_simplify: omb.mesh_simplify,
                      model_parameters: {
                        ...(value?.model_parameters || {}),
                        ...omb.model_parameters,
                        decimation_target: clampPipelineDecimationTarget(
                          omb.model_parameters.decimation_target,
                        ),
                      },
                    });
                  }}
                >
                  <option value="">Custom</option>
                  {OMB_EXPORT_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.tier}>
                      {preset.label} — {preset.hint}
                    </option>
                  ))}
                </select>
                <p style={{ ...hintStyle, marginTop: '0.25rem' }}>
                  Steers backend decimation and texture resolution toward{' '}
                  <a href={OMB_GUIDELINES_URL} target="_blank" rel="noopener noreferrer">
                    OMB tiers
                  </a>
                  . Use GLB Export presets for final viewport publish caps.
                </p>
              </div>

              <div style={{ marginBottom: '0.4rem' }}>
                <label style={labelStyle}>Texture resolution</label>
                <select
                  style={inputStyle}
                  value={value?.texture_resolution ?? 1024}
                  onChange={(e) => setField('texture_resolution', Number(e.target.value))}
                >
                  <option value={64}>64 (OMB Tier 1)</option>
                  <option value={128}>128 (OMB Tier 2)</option>
                  <option value={256}>256 (OMB Tier 3)</option>
                  <option value={512}>512</option>
                  <option value={1024}>1024 (OMB Tier 4)</option>
                  <option value={2048}>2048 (OMB Tier 5)</option>
                </select>
              </div>

              <div style={{ marginBottom: '0.4rem' }}>
                <label style={labelStyle}>Output format</label>
                <select
                  style={inputStyle}
                  value={value?.output_format ?? 'glb'}
                  onChange={(e) => setField('output_format', e.target.value)}
                >
                  <option value="glb">GLB</option>
                  <option value="obj">OBJ</option>
                  <option value="fbx">FBX</option>
                </select>
              </div>

              <div style={{ marginBottom: '0.4rem' }}>
                {(() => {
                  const ratio = value?.mesh_simplify ?? PIPELINE_MESH_SIMPLIFY_DEFAULT;
                  const targetTris = clampPipelineDecimationTarget(
                    Number(value?.model_parameters?.decimation_target) > 0
                      ? Number(value.model_parameters.decimation_target)
                      : estimateDecimationTarget(ratio, null, null),
                  );
                  return (
                    <label style={labelStyle}>
                      Mesh simplify — {formatTriangleCount(targetTris)} triangles (
                      {Math.round(ratio * 100)}%) · max {formatTriangleCount(PIPELINE_MESH_DECIMATION_MAX)}
                    </label>
                  );
                })()}
                <input
                  type="range"
                  min="0.5"
                  max="1"
                  step="0.01"
                  value={value?.mesh_simplify ?? PIPELINE_MESH_SIMPLIFY_DEFAULT}
                  onChange={(e) => {
                    const nextRatio = parseFloat(e.target.value);
                    const prevRatio = value?.mesh_simplify ?? PIPELINE_MESH_SIMPLIFY_DEFAULT;
                    const nextTarget = estimateDecimationTarget(
                      nextRatio,
                      value?.model_parameters?.decimation_target,
                      prevRatio,
                    );
                    onChange?.({
                      ...value,
                      mesh_simplify: nextRatio,
                      model_parameters: {
                        ...(value?.model_parameters || {}),
                        decimation_target: nextTarget,
                      },
                    });
                  }}
                  style={{ width: '100%' }}
                />
                <p style={{ ...hintStyle, marginTop: '0.25rem' }}>
                  Default {formatTriangleCount(PIPELINE_MESH_DECIMATION_TARGET)} triangles —
                  the API upload cap ({formatTriangleCount(API_MAX_MESH_VERTICES)} verts/faces).
                  Requests are clamped so they never exceed that budget. Not the same as GLB Export
                  Draco compression.
                </p>
              </div>
            </>
          )}

          {isAutoRig && (
            <>
              <div style={{ marginBottom: '0.4rem' }}>
                <label style={labelStyle}>Rig mode (advanced)</label>
                <select
                  style={inputStyle}
                  value={value?.rig_mode ?? 'skeleton'}
                  onChange={(e) => setRigMode(e.target.value)}
                >
                  <option value="skeleton">Skeleton — bones only (SkinTokens or UniRig)</option>
                  <option value="full">Full — SkinTokens / UniRig + skin weights</option>
                  <option value="skin">Skin — skin-focused rig pass</option>
                  <option value="template">Template avatar — UniRig fits mesh to template avatar (GLB)</option>
                  <option value="creature_template">
                    Creature template — Mesh2Motion fox / quadruped skeleton (GLB)
                  </option>
                </select>
                <p style={{ ...hintStyle, marginTop: '0.25rem' }}>
                  Prefer the main form <strong>Rig pipeline</strong> picker — it syncs model + mode.
                  Creature / UniRig were previously hard to select because mode lived only here.
                </p>
              </div>
              {(value?.rig_mode ?? 'skeleton') === AUTO_RIG_MODES.TEMPLATE && (
                <p style={{ fontSize: '0.55rem', color: '#888', margin: '0 0 0.4rem' }}>
                  Uses operator-local humanoid template on the API. Output is GLB/VRM with
                  ARKit blend shapes.
                </p>
              )}
              {(value?.rig_mode ?? 'skeleton') === AUTO_RIG_MODES.CREATURE_TEMPLATE && (
                <>
                  <div style={{ marginBottom: '0.4rem' }}>
                    <label style={labelStyle}>Creature template</label>
                    <select
                      style={inputStyle}
                      value={value?.creature_template_id ?? DEFAULT_CREATURE_TEMPLATE_ID}
                      onChange={(e) => setField('creature_template_id', e.target.value)}
                    >
                      {CREATURE_TEMPLATE_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p style={{ fontSize: '0.55rem', color: '#888', margin: '0 0 0.4rem' }}>
                    Uses Mesh2Motion <code style={{ fontSize: '0.55rem' }}>rig-fox.glb</code> on the
                    API (48 named bones). Best for quadrupeds; bird/dragon templates come later.
                  </p>
                </>
              )}
              {(value?.rig_mode ?? 'skeleton') === 'full' && (
                <div style={{ marginBottom: '0.4rem' }}>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <input
                      type="checkbox"
                      checked={value?.model_parameters?.with_skinning !== false}
                      onChange={(e) => setModelParam('with_skinning', e.target.checked)}
                    />
                    Apply automatic skin weights on export (with_skinning)
                  </label>
                  <p style={{ fontSize: '0.55rem', color: '#888', margin: '0.15rem 0 0' }}>
                    Uncheck to run the full pipeline but skip weight merge (rare). Weights are
                    re-estimated on your mesh when enabled — quality may differ from a native UniRig
                    FBX.
                  </p>
                </div>
              )}
              <div style={{ marginBottom: '0.4rem' }}>
                <label style={labelStyle}>Output format</label>
                <select
                  style={inputStyle}
                  value={
                    value?.output_format ??
                    getDefaultAutoRigOutputFormat(modelId, value?.rig_mode ?? 'skeleton')
                  }
                  onChange={(e) => setField('output_format', e.target.value)}
                  disabled={
                    (value?.rig_mode ?? 'skeleton') === AUTO_RIG_MODES.TEMPLATE ||
                    (value?.rig_mode ?? 'skeleton') === AUTO_RIG_MODES.CREATURE_TEMPLATE
                  }
                >
                  <option value="fbx">FBX (UniRig default)</option>
                  <option value="glb">GLB (template / SkinTokens default)</option>
                </select>
              </div>
              <p style={{ fontSize: '0.6rem', color: '#9cdc9c', margin: '0 0 0.4rem' }}>
                Uploads the viewport mesh, then POSTs JSON to{' '}
                <code style={{ fontSize: '0.55rem' }}>/api/v1/auto-rigging/generate-rig</code> with{' '}
                <code style={{ fontSize: '0.55rem' }}>mesh_file_id</code>, rig mode
                {(value?.rig_mode ?? 'skeleton') === AUTO_RIG_MODES.TEMPLATE
                  ? ', humanoid_template_id,'
                  : (value?.rig_mode ?? 'skeleton') === AUTO_RIG_MODES.CREATURE_TEMPLATE
                    ? ', creature_template_id,'
                    : ','}{' '}
                output format, and model preference. Template mode requires{' '}
                <code style={{ fontSize: '0.55rem' }}>{TEMPLATE_RIG_MODEL_ID}</code>; creature
                template requires{' '}
                <code style={{ fontSize: '0.55rem' }}>{CREATURE_TEMPLATE_RIG_MODEL_ID}</code>. Both
                output GLB.
              </p>
            </>
          )}

          {schema &&
            Object.entries(schema).map(([key, def]) => {
              const type = def?.type || 'string';
              const label = def?.description || key;
              const current = value?.model_parameters?.[key] ?? def?.default ?? '';

              if (type === 'boolean') {
                return (
                  <div key={key} style={{ marginBottom: '0.35rem' }}>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(current)}
                        onChange={(e) => setModelParam(key, e.target.checked)}
                      />
                      {label}
                    </label>
                  </div>
                );
              }

              if (type === 'number' || type === 'integer') {
                const isDecimationTarget = key === 'decimation_target';
                return (
                  <div key={key} style={{ marginBottom: '0.35rem' }}>
                    <label style={labelStyle}>
                      {isDecimationTarget
                        ? `Target triangles (decimation_target)${
                            Number(current) > 0 ? ` — ${formatTriangleCount(current)}` : ''
                          }`
                        : label}
                    </label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={current}
                      min={def?.minimum}
                      max={def?.maximum}
                      step={type === 'integer' ? 1 : 0.01}
                      onChange={(e) =>
                        setModelParam(
                          key,
                          type === 'integer'
                            ? isDecimationTarget
                              ? clampPipelineDecimationTarget(parseInt(e.target.value, 10))
                              : parseInt(e.target.value, 10)
                            : parseFloat(e.target.value),
                        )
                      }
                    />
                  </div>
                );
              }

              return (
                <div key={key} style={{ marginBottom: '0.35rem' }}>
                  <label style={labelStyle}>{label}</label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={current}
                    onChange={(e) => setModelParam(key, e.target.value)}
                  />
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default TaskAdvancedOptions;
