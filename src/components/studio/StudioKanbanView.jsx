import React from 'react';
import {
  getClothingProgress,
  getStudioNodeDisplayStatus,
  groupNodesByStage,
  nodeHasStudioArtifact,
  formatStudioNodeTiming,
} from '../../library/studioGraph.js';
import TaskMeshPreview from '../TaskMeshPreview.jsx';
import StudioAuthenticatedThumb from './StudioAuthenticatedThumb.jsx';

function KanbanNodePreview({ node, apiEndpoint }) {
  const kind = node.kind;
  const data = node.data || {};

  if (kind === 'text_to_image' && data.imageUrl) {
    return (
      <div className="studio-kanban-card-thumb">
        <StudioAuthenticatedThumb imageUrl={data.imageUrl} apiEndpoint={apiEndpoint} label="" />
      </div>
    );
  }

  if ((kind === 'image_to_3d' || kind === 'auto_rigging') && data.meshUrl) {
    return (
      <div className="studio-kanban-card-thumb">
        <TaskMeshPreview
          className="studio-kanban-mesh-preview"
          meshUrl={data.meshUrl}
          apiEndpoint={apiEndpoint}
          boneToggle={kind === 'auto_rigging'}
          defaultShowBones={kind === 'auto_rigging'}
          label={kind === 'auto_rigging' ? 'Rig' : 'Mesh'}
        />
      </div>
    );
  }

  if (kind === 'appearance_clothing' && Array.isArray(data.results) && data.results.length) {
    const { done, total, results } = getClothingProgress(node);
    return (
      <div className="studio-kanban-clothing-strip">
        {results.slice(0, 4).map((item, index) => {
          const url = item.traitUrl || item.meshUrl;
          if (!url && !item.imageUrl) return null;
          return (
            <div key={`${item.objectName || index}`} className="studio-kanban-clothing-mini">
              {url ? (
                <TaskMeshPreview
                  className="studio-kanban-mesh-preview"
                  meshUrl={url}
                  apiEndpoint={apiEndpoint}
                  label={item.appearance_slot || `#${index + 1}`}
                />
              ) : (
                <StudioAuthenticatedThumb
                  imageUrl={item.imageUrl}
                  apiEndpoint={apiEndpoint}
                  label={item.appearance_slot || `#${index + 1}`}
                />
              )}
            </div>
          );
        })}
        {total > 4 ? (
          <span className="studio-kanban-card-preview">+{total - 4} more</span>
        ) : null}
        {total > 0 ? (
          <span className="studio-kanban-card-preview">
            {done}/{total} rigged
          </span>
        ) : null}
      </div>
    );
  }

  if (kind === 'text_prompt' && data.prompt) {
    return <p className="studio-kanban-card-preview">{data.prompt}</p>;
  }

  if (data.imageUrl) {
    return <p className="studio-kanban-card-preview">Image ready</p>;
  }
  if (data.meshUrl) {
    return <p className="studio-kanban-card-preview">Mesh ready</p>;
  }
  return null;
}

export default function StudioKanbanView({ project, apiEndpoint, onSelectNode }) {
  const columns = groupNodesByStage(project);

  return (
    <div className="studio-kanban">
      {columns.map((col) => {
        const doneCount = col.nodes.filter((n) => nodeHasStudioArtifact(n)).length;
        return (
          <section key={col.id} className="studio-kanban-column">
            <header className="studio-kanban-column-header">
              <span>{col.label}</span>
              {col.nodes.length ? (
                <span className="studio-kanban-column-count">
                  {doneCount}/{col.nodes.length} done
                </span>
              ) : null}
            </header>
            <div className="studio-kanban-column-body">
              {col.nodes.map((node) => {
                const displayStatus = getStudioNodeDisplayStatus(node);
                const hasArtifact = nodeHasStudioArtifact(node);
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`studio-kanban-card studio-status-${displayStatus} ${hasArtifact ? 'has-artifact' : ''}`}
                    onClick={() => onSelectNode?.(node.id)}
                  >
                    <div className="studio-kanban-card-title">{node.label}</div>
                    <div className="studio-kanban-card-meta">
                      {displayStatus === 'partial' && node.kind === 'appearance_clothing'
                        ? (() => {
                            const p = getClothingProgress(node);
                            return `partial · ${p.done}/${p.total}`;
                          })()
                        : displayStatus}
                    </div>
                    {(() => {
                      const timing = formatStudioNodeTiming(node);
                      return timing ? <div className="studio-node-timing">{timing}</div> : null;
                    })()}
                    <KanbanNodePreview node={node} apiEndpoint={apiEndpoint} />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
