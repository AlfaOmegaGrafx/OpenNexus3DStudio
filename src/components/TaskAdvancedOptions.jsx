import React, { useEffect, useState } from 'react';
import { fetchModelParameters, buildDefaultModelParameters } from '../library/modelParametersApi.js';
import {
  AUTO_RIG_MODES,
  DEFAULT_HUMANOID_TEMPLATE_ID,
  HUMANOID_TEMPLATE_OPTIONS,
  TEMPLATE_RIG_MODEL_ID,
} from '../library/avatarPipelineCatalog.js';
import { getDefaultAutoRigOutputFormat } from '../library/aiModelsCatalog.js';

/**
 * Common + model-specific 3DAIGC parameters (ported from Open3DStudio AdvancedParameters).
 */
const TaskAdvancedOptions = ({ apiEndpoint, modelId, taskType, value, onChange }) => {
  const isAutoRig = taskType === 'auto-rigging';
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
          onChange({
            ...value,
            model_parameters: { ...(value?.model_parameters || {}), ...defaults },
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
          {!isAutoRig && (
            <>
              <div style={{ marginBottom: '0.4rem' }}>
                <label style={labelStyle}>Texture resolution</label>
                <select
                  style={inputStyle}
                  value={value?.texture_resolution ?? 1024}
                  onChange={(e) => setField('texture_resolution', Number(e.target.value))}
                >
                  <option value={512}>512</option>
                  <option value={1024}>1024</option>
                  <option value={2048}>2048</option>
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
                <label style={labelStyle}>
                  Mesh simplify ({Math.round((value?.mesh_simplify ?? 0.95) * 100)}%)
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1"
                  step="0.01"
                  value={value?.mesh_simplify ?? 0.95}
                  onChange={(e) => setField('mesh_simplify', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </>
          )}

          {isAutoRig && (
            <>
              <div style={{ marginBottom: '0.4rem' }}>
                <label style={labelStyle}>Rig mode</label>
                <select
                  style={inputStyle}
                  value={value?.rig_mode ?? 'skeleton'}
                  onChange={(e) => setRigMode(e.target.value)}
                >
                  <option value="skeleton">Skeleton — bones only (SkinTokens or UniRig)</option>
                  <option value="full">Full — SkinTokens rig + skin weights (recommended on DGX)</option>
                  <option value="skin">Skin — skin-focused rig pass</option>
                  <option value="template">Template VRM — UniRig fits mesh to template.vrm (GLB)</option>
                </select>
              </div>
              {(value?.rig_mode ?? 'skeleton') === AUTO_RIG_MODES.TEMPLATE && (
                <>
                  <div style={{ marginBottom: '0.4rem' }}>
                    <label style={labelStyle}>Humanoid template</label>
                    <select
                      style={inputStyle}
                      value={value?.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID}
                      onChange={(e) => setField('humanoid_template_id', e.target.value)}
                    >
                      {HUMANOID_TEMPLATE_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p style={{ fontSize: '0.55rem', color: '#888', margin: '0 0 0.4rem' }}>
                    Uses <code style={{ fontSize: '0.55rem' }}>{HUMANOID_TEMPLATE_OPTIONS[0]?.vrmFile}</code>{' '}
                    on the API (CC-Wrap-style bone fit). Output is GLB with template skeleton; facial
                    blend shapes stay on the template topology until non-rigid wrap is added.
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
                  disabled={(value?.rig_mode ?? 'skeleton') === AUTO_RIG_MODES.TEMPLATE}
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
                  : ','}{' '}
                output format, and model preference. Template mode requires{' '}
                <code style={{ fontSize: '0.55rem' }}>{TEMPLATE_RIG_MODEL_ID}</code> and outputs GLB.
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
                return (
                  <div key={key} style={{ marginBottom: '0.35rem' }}>
                    <label style={labelStyle}>{label}</label>
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
                          type === 'integer' ? parseInt(e.target.value, 10) : parseFloat(e.target.value),
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
