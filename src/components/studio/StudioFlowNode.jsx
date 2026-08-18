import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import TaskMeshPreview from '../TaskMeshPreview.jsx';
import StudioAuthenticatedThumb from './StudioAuthenticatedThumb.jsx';
import { nodeHasStudioArtifact, formatStudioNodeTiming } from '../../library/studioGraph.js';

const STATUS_CLASS = {
  idle: 'studio-status-idle',
  ready: 'studio-status-ready',
  running: 'studio-status-running',
  completed: 'studio-status-completed',
  partial: 'studio-status-partial',
  failed: 'studio-status-failed',
};

function StudioFlowNode({ data }) {
  const status = data?.status || 'idle';
  const displayStatus = data?.displayStatus || status;
  const kind = data?.kind;
  const payload = data?.payload || {};
  const apiEndpoint = data?.apiEndpoint || '/__dev_dgx_proxy';
  const statusMessage = payload.statusMessage || data?.statusMessage || '';
  const clothingProgress = data?.clothingProgress;
  const hasArtifact = nodeHasStudioArtifact({
    kind,
    data: payload,
    status,
  });
  const showPreview = hasArtifact && displayStatus !== 'running';

  const statusLabel =
    displayStatus === 'partial' && clothingProgress?.total
      ? `partial · ${clothingProgress.done}/${clothingProgress.total} garments`
      : displayStatus;
  const timingLine = data?.timingLine || formatStudioNodeTiming({ kind, data: payload, status });

  return (
    <div
      className={`studio-flow-node studio-flow-node--${kind || 'default'} ${STATUS_CLASS[displayStatus] || STATUS_CLASS[status] || ''}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="studio-flow-node-kind">{data?.stage}</div>
      <div className="studio-flow-node-label">{data?.label}</div>
      <div
        className={`studio-flow-node-status ${status === 'running' ? 'is-running' : ''}`}
      >
        {status === 'running' ? (
          <>
            <span className="studio-running-dot" aria-hidden />
            Running
            {statusMessage ? ` · ${statusMessage}` : ''}
          </>
        ) : (
          <>
            {statusLabel}
            {statusMessage && displayStatus !== 'completed' && displayStatus !== 'partial'
              ? ` · ${statusMessage}`
              : ''}
          </>
        )}
      </div>
      {timingLine ? <div className="studio-node-timing">{timingLine}</div> : null}

      {status === 'running' ? (
        <div className="studio-flow-node-progress" role="progressbar" aria-valuetext="Job running">
          <div className="studio-flow-node-progress-bar" />
        </div>
      ) : null}

      {kind === 'text_to_image' && payload.imageUrl && showPreview ? (
        <div className="studio-flow-node-preview nodrag nopan" onClick={(e) => e.stopPropagation()}>
          <StudioAuthenticatedThumb
            imageUrl={payload.imageUrl}
            apiEndpoint={apiEndpoint}
            label=""
          />
        </div>
      ) : null}

      {kind === 'image_edit' && payload.imageUrl && showPreview ? (
        <div className="studio-flow-node-preview nodrag nopan" onClick={(e) => e.stopPropagation()}>
          <StudioAuthenticatedThumb
            imageUrl={payload.imageUrl}
            apiEndpoint={apiEndpoint}
            label={payload.skipped ? 'passthrough' : 'edited'}
          />
        </div>
      ) : null}

      {(kind === 'image_to_3d' || kind === 'auto_rigging') && payload.meshUrl && showPreview ? (
        <div className="studio-flow-node-preview nodrag nopan" onClick={(e) => e.stopPropagation()}>
          <TaskMeshPreview
            className="studio-node-mesh-preview"
            meshUrl={payload.meshUrl}
            apiEndpoint={apiEndpoint}
            boneToggle={kind === 'auto_rigging'}
            defaultShowBones={kind === 'auto_rigging'}
            label={kind === 'auto_rigging' ? 'Rigged' : 'Mesh'}
          />
        </div>
      ) : null}

      {kind === 'appearance_clothing' &&
      Array.isArray(payload.results) &&
      payload.results.length > 0 &&
      showPreview ? (
        <div className="studio-flow-node-clothing-list nodrag nopan">
          {payload.results.map((item, index) => {
            const url = item.traitUrl || item.meshUrl;
            const accessories = Array.isArray(data?.clothingAccessories)
              ? data.clothingAccessories
              : [];
            const accessoryIndex = accessories.findIndex(
              (a) =>
                a.label === item.label &&
                a.appearance_slot === item.appearance_slot,
            );
            const canRerun =
              typeof data?.onRerunClothing === 'function' &&
              accessoryIndex >= 0 &&
              Boolean(item.traitUrl || item.meshUrl || item.imageUrl);
            return (
              <div
                key={`${item.objectName || item.label || 'garment'}_${index}`}
                className="studio-flow-node-clothing-item"
              >
                <div className="studio-flow-node-clothing-item-label">
                  {item.appearance_slot || item.label || `#${index + 1}`}
                  {canRerun ? (
                    <button
                      type="button"
                      className="studio-btn ghost studio-rerun-btn studio-rerun-btn--compact"
                      disabled={Boolean(data?.running)}
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onRerunClothing(accessoryIndex);
                      }}
                      title="Re-generate this garment"
                    >
                      Re-run
                    </button>
                  ) : null}
                </div>
                {item.imageUrl && !url ? (
                  <StudioAuthenticatedThumb
                    imageUrl={item.imageUrl}
                    apiEndpoint={apiEndpoint}
                    label="Krea"
                  />
                ) : null}
                {url ? (
                  <TaskMeshPreview
                    className="studio-node-mesh-preview"
                    meshUrl={url}
                    apiEndpoint={apiEndpoint}
                    boneToggle
                    defaultShowBones={Boolean(item.traitUrl)}
                    label={item.traitUrl ? 'Trait' : 'Mesh'}
                  />
                ) : !item.imageUrl ? (
                  <div className="studio-flow-node-hint">Pending…</div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default memo(StudioFlowNode);
