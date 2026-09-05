import React from 'react';
import TaskMeshPreview from '../TaskMeshPreview.jsx';
import StudioAuthenticatedThumb from './StudioAuthenticatedThumb.jsx';
import {
  findClothingAccessoryIndex,
  getClothingProgress,
  nodeHasStudioArtifact,
  formatStudioNodeTiming,
} from '../../library/studioGraph.js';
import { formatTaskTimestamp } from '../../library/taskPersistence.js';

/**
 * Stage result previews for Studio (mesh / auto-rig bones / clothing).
 *
 * @param {{
 *   project: object,
 *   apiEndpoint: string,
 *   running?: boolean,
 *   onRerunStage?: (mode: 'image'|'mesh'|'rig') => void,
 *   onRerunClothing?: (accessoryIndex: number) => void,
 * }} props
 */
export default function StudioStagePreviews({
  project,
  apiEndpoint,
  running = false,
  onRerunStage,
  onRerunClothing,
}) {
  if (!project?.nodes) return null;

  const imageNode = project.nodes.find((n) => n.kind === 'text_to_image');
  const editNode = project.nodes.find((n) => n.kind === 'image_edit');
  const meshNode = project.nodes.find((n) => n.kind === 'image_to_3d');
  const rigNode = project.nodes.find((n) => n.kind === 'auto_rigging');
  const clothingNode = project.nodes.find((n) => n.kind === 'appearance_clothing');

  const imageUrl = imageNode?.data?.imageUrl || null;
  const editImageUrl = editNode?.data?.imageUrl || null;
  const meshUrl = meshNode?.data?.meshUrl || null;
  const rigUrl = rigNode?.data?.meshUrl || null;
  const clothingProgress = clothingNode ? getClothingProgress(clothingNode) : null;
  const clothingResults = clothingProgress?.results?.length ? clothingProgress.results : [];

  const completedNodes = project.nodes.filter((n) => nodeHasStudioArtifact(n));
  const showPipelineSummary = completedNodes.length > 0;

  if (!imageUrl && !editImageUrl && !meshUrl && !rigUrl && clothingResults.length === 0) {
    return null;
  }

  return (
    <section className="studio-stage-previews" aria-label="Stage 3D previews">
      {showPipelineSummary ? (
        <div className="studio-pipeline-complete-strip" aria-label="Completed pipeline nodes">
          <span className="studio-pipeline-complete-label">Completed stages</span>
          <ul className="studio-pipeline-complete-list">
            {project.nodes
              .filter((n) => n.kind !== 'text_prompt')
              .map((node) => {
                const has = nodeHasStudioArtifact(node);
                const partial =
                  node.kind === 'appearance_clothing' &&
                  clothingProgress &&
                  clothingProgress.total > 0 &&
                  clothingProgress.done > 0 &&
                  clothingProgress.done < clothingProgress.total;
                const label =
                  node.kind === 'appearance_clothing' && clothingProgress?.total
                    ? `${node.label} (${clothingProgress.done}/${clothingProgress.total})`
                    : node.label;
                return (
                  <li
                    key={node.id}
                    className={`studio-pipeline-complete-chip ${has ? 'is-done' : ''} ${partial ? 'is-partial' : ''}`}
                  >
                    <span className="studio-pipeline-complete-chip-stage">{node.stage}</span>
                    {label}
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}

      {imageUrl ? (
        <div className="studio-stage-preview-card">
          <header className="studio-stage-preview-header">
            <h2>Text to Image</h2>
            <span>Review image</span>
            {onRerunStage ? (
              <button
                type="button"
                className="studio-btn ghost studio-rerun-btn"
                disabled={running}
                onClick={() => onRerunStage('image')}
                title="Re-run Krea text-to-image for this stage"
              >
                Re-run
              </button>
            ) : null}
          </header>
          {formatStudioNodeTiming(imageNode) ? (
            <p className="studio-node-timing">{formatStudioNodeTiming(imageNode)}</p>
          ) : null}
          <StudioAuthenticatedThumb
            imageUrl={imageUrl}
            apiEndpoint={apiEndpoint}
            label={imageNode?.data?.objectName || 'Image'}
          />
        </div>
      ) : null}

      {editImageUrl ? (
        <div className="studio-stage-preview-card">
          <header className="studio-stage-preview-header">
            <h2>Image Edit</h2>
            <span>{editNode?.data?.skipped ? 'Passthrough' : 'Edited image'}</span>
          </header>
          {formatStudioNodeTiming(editNode) ? (
            <p className="studio-node-timing">{formatStudioNodeTiming(editNode)}</p>
          ) : null}
          <StudioAuthenticatedThumb
            imageUrl={editImageUrl}
            apiEndpoint={apiEndpoint}
            label={editNode?.data?.objectName || 'Edited'}
          />
        </div>
      ) : null}

      {meshUrl ? (
        <div className="studio-stage-preview-card">
          <header className="studio-stage-preview-header">
            <h2>Image to 3D</h2>
            <span>Textured mesh preview</span>
            {onRerunStage ? (
              <button
                type="button"
                className="studio-btn ghost studio-rerun-btn"
                disabled={running}
                onClick={() => onRerunStage('mesh')}
                title="Re-run TRELLIS mesh from the current image"
              >
                Re-run
              </button>
            ) : null}
          </header>
          {formatStudioNodeTiming(meshNode) ? (
            <p className="studio-node-timing">{formatStudioNodeTiming(meshNode)}</p>
          ) : null}
          <TaskMeshPreview
            className="studio-stage-preview-viewer"
            meshUrl={meshUrl}
            apiEndpoint={apiEndpoint}
            label={meshNode?.data?.objectName || 'Body mesh'}
          />
        </div>
      ) : null}

      {rigUrl ? (
        <div className="studio-stage-preview-card">
          <header className="studio-stage-preview-header">
            <h2>Auto Rig</h2>
            <span>Bone view of rigged mesh</span>
            <button
              type="button"
              className="studio-btn ghost studio-rerun-btn"
              disabled={running || !rigUrl}
              onClick={() => {
                const jobId = rigNode?.data?.jobId || null;
                const format =
                  rigNode?.data?.format ||
                  (/\.vrm(\?|#|$)/i.test(String(rigUrl)) ? 'vrm' : undefined);
                window.dispatchEvent(
                  new CustomEvent('loadModelFromUrl', {
                    detail: {
                      result: {
                        job_id: jobId,
                        feature: 'auto_rig',
                        format: format || 'vrm',
                        mesh_url: rigUrl,
                        output_mesh_path: rigUrl,
                        rig_info: {
                          rig_mode: rigNode?.data?.rigMode || 'template_wrap',
                          generation_method: 'humanoid_vrm_template',
                        },
                      },
                      taskId: jobId ? `job_${jobId}` : null,
                      source: 'studio-stage-open-viewport',
                    },
                  }),
                );
              }}
              title="Load this VRM into the main OpenNexus 3D viewport (required for motion)"
            >
              Open in viewport
            </button>
            {onRerunStage ? (
              <button
                type="button"
                className="studio-btn ghost studio-rerun-btn"
                disabled={running}
                onClick={() => onRerunStage('rig')}
                title="Re-run body auto-rig (and pending clothing)"
              >
                Re-run
              </button>
            ) : null}
          </header>
          {formatStudioNodeTiming(rigNode) ? (
            <p className="studio-node-timing">{formatStudioNodeTiming(rigNode)}</p>
          ) : null}
          <TaskMeshPreview
            className="studio-stage-preview-viewer"
            meshUrl={rigUrl}
            apiEndpoint={apiEndpoint}
            label={`${rigNode?.data?.rigMode || 'rig'} · ${rigNode?.data?.objectName || 'body'}`}
            boneToggle
            defaultShowBones
          />
        </div>
      ) : null}

      {clothingResults.length > 0 ? (
        <div className="studio-stage-preview-card studio-stage-preview-card--clothing">
          <header className="studio-stage-preview-header">
            <h2>Clothing</h2>
            <span>
              {clothingProgress?.total
                ? `${clothingProgress.done}/${clothingProgress.total} rigged garments`
                : 'Rigged garment per slot — toggle bones'}
            </span>
          </header>
          {formatStudioNodeTiming(clothingNode) ? (
            <p className="studio-node-timing">{formatStudioNodeTiming(clothingNode)}</p>
          ) : null}
          <div className="studio-clothing-preview-grid">
            {clothingResults.map((item, index) => {
              const previewUrl = item.traitUrl || item.meshUrl || null;
              const accessoryIndex = findClothingAccessoryIndex(project, item);
              const canRerun =
                typeof onRerunClothing === 'function' &&
                accessoryIndex >= 0 &&
                Boolean(item.traitUrl || item.meshUrl || item.imageUrl);
              return (
                <article
                  key={`${item.objectName || item.label || 'garment'}_${index}`}
                  className="studio-clothing-preview-item"
                >
                  <div className="studio-clothing-preview-meta">
                    <strong>{item.label || item.objectName || `Garment ${index + 1}`}</strong>
                    <span className="studio-clothing-preview-slot">
                      {item.appearance_slot || 'Chest'}
                    </span>
                    {item.completedAt ? (
                      <span className="studio-node-timing">
                        Completed {formatTaskTimestamp(item.completedAt)}
                      </span>
                    ) : null}
                  </div>
                  {canRerun ? (
                    <button
                      type="button"
                      className="studio-btn ghost studio-rerun-btn studio-rerun-btn--compact"
                      disabled={running}
                      onClick={() => onRerunClothing(accessoryIndex)}
                      title="Re-generate this garment (Krea → TRELLIS → appearance_component)"
                    >
                      Re-run
                    </button>
                  ) : null}
                  {item.imageUrl ? (
                    <StudioAuthenticatedThumb
                      imageUrl={item.imageUrl}
                      apiEndpoint={apiEndpoint}
                      label="Krea"
                    />
                  ) : null}
                  {previewUrl ? (
                    <TaskMeshPreview
                      className="studio-stage-preview-viewer"
                      meshUrl={previewUrl}
                      apiEndpoint={apiEndpoint}
                      label={item.traitUrl ? 'Rigged trait' : 'Mesh'}
                      boneToggle
                      defaultShowBones={Boolean(item.traitUrl)}
                    />
                  ) : (
                    <p className="studio-clothing-preview-missing">No mesh URL yet</p>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
