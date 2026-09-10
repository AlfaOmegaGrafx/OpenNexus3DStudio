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
 *   onClothingEditPromptChange?: (accessoryIndex: number, text: string) => void,
 * }} props
 */
export default function StudioStagePreviews({
  project,
  apiEndpoint,
  running = false,
  onRerunStage,
  onRerunClothing,
  onClothingEditPromptChange,
}) {
  if (!project?.nodes) return null;

  const imageNode = project.nodes.find((n) => n.kind === 'text_to_image');
  const editNode = project.nodes.find((n) => n.kind === 'image_edit');
  const meshNode = project.nodes.find((n) => n.kind === 'image_to_3d');
  const rigNode = project.nodes.find((n) => n.kind === 'auto_rigging');
  const clothingNode = project.nodes.find((n) => n.kind === 'appearance_clothing');
  const isComposable = project.templateId === 'krea_composable_avatar_body';

  const imageUrl = imageNode?.data?.imageUrl || null;
  const garbedImageUrl = imageNode?.data?.garbedImageUrl || null;
  const editImageUrl = editNode?.data?.imageUrl || null;
  const meshUrl = meshNode?.data?.meshUrl || null;
  const rigUrl = rigNode?.data?.meshUrl || null;
  const clothingProgress = clothingNode ? getClothingProgress(clothingNode) : null;
  const clothingResults = clothingProgress?.results?.length ? clothingProgress.results : [];
  const clothingAccessories = clothingNode?.data?.accessories || [];

  const completedNodes = project.nodes.filter((n) => nodeHasStudioArtifact(n));
  const showPipelineSummary = completedNodes.length > 0;

  if (
    !imageUrl &&
    !garbedImageUrl &&
    !editImageUrl &&
    !meshUrl &&
    !rigUrl &&
    clothingResults.length === 0
  ) {
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
            <span>{isComposable ? 'Review image (nude body)' : 'Review image'}</span>
            {onRerunStage ? (
              <button
                type="button"
                className="studio-btn ghost studio-rerun-btn"
                disabled={running}
                onClick={() => onRerunStage('image')}
                title="Re-run text-to-image for this stage"
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

      {isComposable && (garbedImageUrl || imageUrl) ? (
        <div className="studio-stage-preview-card">
          <header className="studio-stage-preview-header">
            <h2>Generated image</h2>
            <span>Fully clothed preview (not used for mesh)</span>
          </header>
          {garbedImageUrl ? (
            <StudioAuthenticatedThumb
              imageUrl={garbedImageUrl}
              apiEndpoint={apiEndpoint}
              label="Garbed"
            />
          ) : (
            <p className="studio-field-hint">
              {imageNode?.data?.garbedStatusMessage ||
                'Clothed preview pending after nude body completes'}
            </p>
          )}
        </div>
      ) : null}

      {editImageUrl ? (
        <div className="studio-stage-preview-card">
          <header className="studio-stage-preview-header">
            <h2>Edit Image</h2>
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
            <h2>Image to 3D Mesh</h2>
            <span>Textured mesh preview</span>
            {onRerunStage ? (
              <button
                type="button"
                className="studio-btn ghost studio-rerun-btn"
                disabled={running}
                onClick={() => onRerunStage('mesh')}
                title="Re-run textured mesh from the current image"
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

      {clothingResults.length > 0 || (isComposable && clothingAccessories.length > 0) ? (
        <div className="studio-stage-preview-card studio-stage-preview-card--clothing">
          <header className="studio-stage-preview-header">
            <h2>Clothing</h2>
            <span>
              {clothingProgress?.total
                ? `${clothingProgress.done}/${clothingProgress.total} rigged garments`
                : 'Rigged garment per slot — edit then Re-run'}
            </span>
          </header>
          {formatStudioNodeTiming(clothingNode) ? (
            <p className="studio-node-timing">{formatStudioNodeTiming(clothingNode)}</p>
          ) : null}
          <div className="studio-clothing-preview-grid">
            {(clothingResults.length
              ? clothingResults
              : clothingAccessories.map((acc) => ({
                  label: acc.label,
                  appearance_slot: acc.appearance_slot,
                  objectName: acc.object_name,
                }))
            ).map((item, index) => {
              const accessoryIndex = findClothingAccessoryIndex(project, item);
              const resolvedIndex = accessoryIndex >= 0 ? accessoryIndex : index;
              const acc = clothingAccessories[resolvedIndex] || null;
              const editPrompt = typeof acc?.editPrompt === 'string' ? acc.editPrompt : '';
              const canRerun =
                typeof onRerunClothing === 'function' &&
                resolvedIndex >= 0 &&
                Boolean(item.traitUrl || item.meshUrl || item.imageUrl);
              const previewUrl = item.traitUrl || item.meshUrl || null;
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
                  {typeof onClothingEditPromptChange === 'function' && resolvedIndex >= 0 ? (
                    <label className="studio-clothing-mage-field">
                      <span>Edit instruction</span>
                      <textarea
                        rows={2}
                        value={editPrompt}
                        disabled={running}
                        placeholder="e.g. change clothes and accessories"
                        onChange={(e) =>
                          onClothingEditPromptChange(resolvedIndex, e.target.value)
                        }
                      />
                    </label>
                  ) : null}
                  {canRerun ? (
                    <button
                      type="button"
                      className="studio-btn ghost studio-rerun-btn studio-rerun-btn--compact"
                      disabled={running}
                      onClick={() => onRerunClothing(resolvedIndex)}
                      title={
                        editPrompt.trim()
                          ? 'Edit this garment image, then remesh + clothing fit'
                          : 'Re-generate this garment (image → mesh → clothing fit)'
                      }
                    >
                      Re-run
                    </button>
                  ) : null}
                  {item.imageUrl ? (
                    <StudioAuthenticatedThumb
                      imageUrl={item.imageUrl}
                      apiEndpoint={apiEndpoint}
                      label="Image"
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
