/**
 * Run studio graph nodes via TaskContext createAndStartTask.
 * Keeps download URL rules aligned with taskModelUrl (job download path).
 */
import {
  resolveTextToImageDownloadUrl,
  getTaskResultModelUrl,
  getTaskResultMeshUrl,
  resolveTaskModelUrl,
} from './taskModelUrl.js';
import {
  buildOrthographicMultiviewPrompts,
  buildTextToImagePrompt,
  createMultiviewSeed,
  normalizeTextToImagePromptOptions,
} from './textToImagePromptOptions.js';
import { sampleFaceSkinSwatch } from './sampleFaceSkinSwatch.js';
import {
  getPromptText,
  getRunnablePipelineOrder,
  getStudioTemplate,
  getTextToImagePromptOptions,
  getClothingText,
  updateNode,
  studioTaskScopeOptions,
  setHeadJobId,
  setHeadSplatUrl,
  jobIdFromArtifactUrl,
} from './studioGraph.js';
import { get3daigcAuthHeaders } from './taskManager.js';
import { slugifyObjectName } from './objectNameUtils.js';
import {
  getDefaultAutoRigOutputFormat,
  resolveAutoRigModelForTask,
} from './aiModelsCatalog.js';
import {
  AUTO_RIG_MODES,
  DEFAULT_HUMANOID_TEMPLATE_ID,
  HEAD_TRACK,
  TEMPLATE_RIG_MODEL_ID,
  fetchArc2AvatarStatus,
  headTrackUsesArc2Avatar,
  headTrackUsesMeshMonk,
  headTrackIsNone,
  normalizeHeadTrack,
} from './avatarPipelineCatalog.js';
import {
  buildAppearanceComponentAutoRigOptions,
  buildAppearanceGarmentSubjectPrompt,
  DEFAULT_STUDIO_CLOTHING_TEXT,
  equipAppearanceComponentTrait,
  parseClothingAccessoryLines,
} from './appearanceClothing.js';
import {
  studioGarmentTextToImageOptionsForSlot,
} from './textToImagePromptOptions.js';

/**
 * @param {object[]} results
 * @param {{ label: string, appearance_slot: string }} acc
 * @param {string} objectName
 */
function findClothingResultEntry(results, acc, objectName) {
  if (!Array.isArray(results)) return null;
  return (
    results.find(
      (r) =>
        r?.objectName === objectName ||
        (r?.label === acc.label && r?.appearance_slot === acc.appearance_slot),
    ) || null
  );
}

/**
 * @param {object[]} results
 * @param {object} entry
 * @returns {object[]}
 */
function upsertClothingResultEntry(results, entry) {
  const next = Array.isArray(results) ? [...results] : [];
  const idx = next.findIndex(
    (r) =>
      r?.objectName === entry.objectName ||
      (r?.label === entry.label && r?.appearance_slot === entry.appearance_slot),
  );
  if (idx >= 0) {
    next[idx] = { ...next[idx], ...entry };
  } else {
    next.push(entry);
  }
  return next;
}

function resolveStudioMeshJobId(meshApi, meshUrl, existing) {
  return (
    meshApi?.job_id ||
    existing?.meshJobId ||
    jobIdFromArtifactUrl(typeof meshUrl === 'string' ? meshUrl : '') ||
    null
  );
}

/**
 * Recover a completed Krea image from Task Manager when Studio lost poll mid-job.
 * @param {{ listTasks?: Function }} deps
 * @param {string} objectName
 * @param {string} apiEndpoint
 */
async function hydrateClothingImageFromTasks(deps, objectName, apiEndpoint) {
  if (typeof deps?.listTasks !== 'function') return null;
  const imgObjectName = `${objectName}_img`;
  const tasks = deps.listTasks() || [];
  const match = tasks.find((t) => {
    if (t?.type !== 'text-to-image') return false;
    const oname = t?.options?.object_name || t?.result?.object_name || '';
    if (oname !== imgObjectName && oname !== objectName) return false;
    return t?.status === 'completed' || (t?.status === 'failed' && t?.job_id);
  });
  if (!match) return null;

  let jobId = match.job_id || match.result?.job_id || null;
  if (match.status === 'failed' && jobId) {
    try {
      const absolute = resolveTaskModelUrl(`/api/v1/system/jobs/${jobId}`, apiEndpoint);
      const resp = await fetch(absolute, { headers: get3daigcAuthHeaders() });
      if (resp.ok) {
        const body = await resp.json();
        if (body?.status !== 'completed') return null;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  const imageUrl =
    resolveTextToImageDownloadUrl(match, apiEndpoint) ||
    (jobId ? `/api/v1/system/jobs/${jobId}/download` : null);
  if (!imageUrl) return null;
  return { imageUrl, jobId };
}

/**
 * @param {string} relativeOrAbsoluteUrl
 * @param {string} apiEndpoint
 * @param {string} [filename]
 * @returns {Promise<File>}
 */
export async function fetchImageAsFile(relativeOrAbsoluteUrl, apiEndpoint, filename = 'studio.png') {
  const absolute = resolveTaskModelUrl(relativeOrAbsoluteUrl, apiEndpoint);
  if (!absolute) {
    throw new Error('No image URL to fetch for Image to 3D');
  }
  const response = await fetch(absolute, { headers: get3daigcAuthHeaders() });
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status})`);
  }
  const blob = await response.blob();
  const type = blob.type || 'image/png';
  return new File([blob], filename, { type });
}

/**
 * @param {object} apiResult
 * @param {{ getTask?: Function, listTasks?: Function }} deps
 * @param {string|null} jobId
 */
function resolveImageTaskRow(apiResult, deps, jobId) {
  let taskRow = null;
  if (deps.listTasks && jobId) {
    const all = typeof deps.listTasks === 'function' ? deps.listTasks() : [];
    taskRow = all.find((t) => t.job_id === jobId || t.result?.job_id === jobId) || null;
  }
  if (!taskRow) {
    taskRow = {
      id: null,
      type: 'text-to-image',
      status: 'completed',
      result: apiResult,
      job_id: jobId,
    };
  }
  return taskRow;
}

/**
 * Generate one Krea view; returns download URL + metadata.
 */
async function runSingleTextToImageView(createAndStartTask, deps, {
  prompt,
  promptOptions,
  modelPreference,
  objectName,
  seed,
  viewId,
  studioScope = {},
}) {
  const apiResult = await createAndStartTask({
    type: 'text-to-image',
    prompt,
    imageFile: null,
    options: {
      model_preference: modelPreference || 'krea2_turbo_text_to_image',
      width: 1024,
      height: 1024,
      object_name: objectName,
      text_to_image_prompt_options: promptOptions,
      model_parameters: seed != null ? { seed } : undefined,
      ...studioScope,
    },
  });
  const jobId = apiResult?.job_id || null;
  const taskRow = resolveImageTaskRow(apiResult, deps, jobId);
  // Always prefer relative job download — never trust absolute mesh_url hosts from DGX.
  const imageUrl =
    (jobId ? `/api/v1/system/jobs/${jobId}/download` : null) ||
    resolveTextToImageDownloadUrl(taskRow);
  if (!imageUrl) {
    throw new Error(`Text-to-image (${viewId || 'view'}) completed but no downloadable image URL`);
  }
  return { viewId: viewId || 'front', imageUrl, jobId, prompt, taskId: taskRow?.id || null };
}

/**
 * @param {object} project
 * @param {{
 *   createAndStartTask: Function,
 *   getTask?: Function,
 *   listTasks?: Function,
 *   apiEndpoint: string,
 *   onProjectChange?: (project: object) => void,
 *   onStatus?: (message: string) => void,
 * }} deps
 * @param {{
 *   until?: 'text_to_image' | 'image_to_3d' | 'auto_rigging' | 'appearance_clothing',
 *   skipKinds?: string[],
 *   clothingIndexes?: number[],
 *   forceClothingIndexes?: number[],
 * }} [opts]
 */
/**
 * Queue Arc2Avatar from a Studio selfie without blocking Body+Cloth.
 * Polls in the background and dispatches `attachHeadSplatFromUrl` when the PLY is ready.
 */
async function queueStudioArc2AvatarHead(current, deps, faceSelfieFile) {
  const { apiEndpoint, onStatus, taskManager } = deps;
  if (!faceSelfieFile || !taskManager?.queueArc2AvatarHead) {
    return current;
  }
  const status = await fetchArc2AvatarStatus(apiEndpoint);
  if (!status?.integrated) {
    const reasons = (status?.blocking_reasons || []).join('; ') || 'not ready';
    onStatus?.(`Arc2Avatar skipped (not integrated): ${reasons}`);
    return current;
  }
  onStatus?.(
    'Queuing Arc2Avatar head from selfie (SDS — runs in parallel; body continues)…',
  );
  const queued = await taskManager.queueArc2AvatarHead(
    'Studio Arc2Avatar head',
    faceSelfieFile,
    {
      object_name: `${current.name || 'studio'}_arc2head`,
      model_parameters: {},
    },
  );
  const jobId = queued?.job_id;
  if (!jobId) {
    onStatus?.('Arc2Avatar queue returned no job_id');
    return current;
  }
  current = setHeadJobId(current, jobId);
  deps.onProjectChange?.(current);
  onStatus?.(`Arc2Avatar head job ${jobId} queued — Body+Cloth continues`);

  // Background poll; attach when body is in the viewport (event handled in App).
  void taskManager
    .pollJobStatus(jobId, null, 5000, 3600)
    .then((result) => {
      const raw =
        getTaskResultModelUrl(result) ||
        getTaskResultModelUrl({ result }) ||
        (jobId ? `/api/v1/system/jobs/${jobId}/download` : null);
      const absolute = resolveTaskModelUrl(raw, apiEndpoint) || raw;
      if (!absolute) return;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('attachHeadSplatFromUrl', {
            detail: { url: absolute, jobId, source: 'studio-arc2avatar' },
          }),
        );
        window.dispatchEvent(
          new CustomEvent('studioHeadSplatReady', {
            detail: { url: absolute, jobId },
          }),
        );
      }
      onStatus?.('Arc2Avatar head ready — attaching splat to Head bone');
    })
    .catch((err) => {
      onStatus?.(`Arc2Avatar head failed: ${err?.message || err}`);
    });

  return current;
}

export async function runStudioPipeline(project, deps, opts = {}) {
  const { createAndStartTask, apiEndpoint, onProjectChange, onStatus, characterManager } = deps;
  const until = opts.until || 'appearance_clothing';
  const skipKinds = new Set(opts.skipKinds || []);
  const clothingIndexFilter = Array.isArray(opts.clothingIndexes)
    ? new Set(opts.clothingIndexes.map((n) => Number(n)).filter((n) => Number.isFinite(n)))
    : null;
  const forceClothingIndexes = new Set(
    [...(opts.forceClothingIndexes || []), ...(opts.clothingIndexes || [])]
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n)),
  );
  let current = project;
  const studioScope = studioTaskScopeOptions(current);
  const emit = (next) => {
    current = next;
    onProjectChange?.(current);
  };

  const prompt = getPromptText(current).trim();
  if (!prompt) {
    throw new Error('Enter a text prompt before running the pipeline');
  }

  const template = getStudioTemplate(current.templateId);
  const faceSelfieFile = opts.faceSelfieFile || deps.faceSelfieFile || null;
  const headTrack = normalizeHeadTrack(getTextToImagePromptOptions(current)?.head_track);
  if (
    template?.includeArc2AvatarHead &&
    headTrackUsesArc2Avatar(headTrack) &&
    faceSelfieFile &&
    !opts.skipArc2AvatarHead &&
    (until === 'appearance_clothing' || !opts.until)
  ) {
    current = await queueStudioArc2AvatarHead(current, deps, faceSelfieFile);
  } else if (
    template?.includeArc2AvatarHead &&
    headTrackUsesArc2Avatar(headTrack) &&
    !faceSelfieFile &&
    !opts.skipArc2AvatarHead
  ) {
    onStatus?.(
      'Head track includes Arc2Avatar — upload a face selfie (or switch to Ethnicity + Likeness)',
    );
  }

  const runnable = getRunnablePipelineOrder(current).filter((n) => !skipKinds.has(n.kind));

  for (const node of runnable) {
    if (node.kind === 'image_edit' && until === 'text_to_image') {
      break;
    }
    if (
      node.kind === 'image_to_3d' &&
      (until === 'text_to_image' || until === 'image_edit')
    ) {
      break;
    }
    if (
      node.kind === 'auto_rigging' &&
      (until === 'text_to_image' || until === 'image_edit' || until === 'image_to_3d')
    ) {
      break;
    }
    if (
      node.kind === 'appearance_clothing' &&
      (until === 'text_to_image' ||
        until === 'image_edit' ||
        until === 'image_to_3d' ||
        until === 'auto_rigging')
    ) {
      break;
    }

    emit(updateNode(current, node.id, { status: 'running' }));

    if (node.kind === 'text_to_image') {
      let promptOptions = getTextToImagePromptOptions(current);
      const modelPreference = node.data?.modelPreference || 'krea2_turbo_text_to_image';
      const objectName = current.name || 'studio_image';

      // Body+Cloth: bias neck-open Krea body toward selfie face skin tone.
      if (
        faceSelfieFile &&
        promptOptions.headless_body &&
        !promptOptions.skin_tone_phrase
      ) {
        try {
          const swatch =
            opts.skinToneSwatch || (await sampleFaceSkinSwatch(faceSelfieFile));
          if (swatch?.phrase) {
            promptOptions = normalizeTextToImagePromptOptions({
              ...promptOptions,
              skin_tone_phrase: swatch.phrase,
              skin_tone_hex: swatch.hex || '',
            });
            onStatus?.(
              `Body skin tone from selfie ${swatch.hex || ''}`.trim(),
            );
          }
        } catch (swatchErr) {
          console.warn('Face skin swatch skipped', swatchErr);
        }
      } else if (
        opts.skinToneSwatch?.phrase &&
        promptOptions.headless_body &&
        !promptOptions.skin_tone_phrase
      ) {
        promptOptions = normalizeTextToImagePromptOptions({
          ...promptOptions,
          skin_tone_phrase: opts.skinToneSwatch.phrase,
          skin_tone_hex: opts.skinToneSwatch.hex || '',
        });
      }

      try {
        if (promptOptions.all_orthographic_views) {
          const seed = createMultiviewSeed();
          const viewSpecs = buildOrthographicMultiviewPrompts(prompt, promptOptions);
          onStatus?.(
            `Queuing ${viewSpecs.length} orthographic views (shared seed ${seed})…`,
          );

          // Submit all views together so the API queue holds a consistent turnaround batch.
          const settled = await Promise.all(
            viewSpecs.map(async (spec, index) => {
              onStatus?.(
                `Generating ${spec.label} (${index + 1}/${viewSpecs.length}), seed ${seed}…`,
              );
              return runSingleTextToImageView(createAndStartTask, deps, {
                prompt: spec.prompt,
                promptOptions: normalizeTextToImagePromptOptions({
                  ...promptOptions,
                  camera_view: spec.viewId,
                }),
                modelPreference,
                objectName: `${objectName}_${spec.viewId}`,
                seed,
                viewId: spec.viewId,
                studioScope,
              });
            }),
          );

          const primaryId = promptOptions.camera_view || 'front';
          const primary =
            settled.find((v) => v.viewId === primaryId) || settled[0];
          if (!primary?.imageUrl) {
            throw new Error('Multiview batch finished without a primary image');
          }

          emit(
            updateNode(current, node.id, {
              status: 'completed',
              data: {
                taskId: primary.taskId,
                imageUrl: primary.imageUrl,
                jobId: primary.jobId,
                composedPrompt: primary.prompt,
                multiviewSeed: seed,
                views: settled,
              },
            }),
          );
          onStatus?.(`Turnaround ready (${settled.length} views)`);
        } else {
          const composedPrompt = buildTextToImagePrompt(prompt, promptOptions);
          const single = await runSingleTextToImageView(createAndStartTask, deps, {
            prompt: composedPrompt,
            promptOptions,
            modelPreference,
            objectName,
            seed: null,
            viewId: promptOptions.camera_view || 'front',
            studioScope,
          });
          emit(
            updateNode(current, node.id, {
              status: 'completed',
              data: {
                taskId: single.taskId,
                imageUrl: single.imageUrl,
                jobId: single.jobId,
                composedPrompt,
                views: [single],
              },
            }),
          );
          onStatus?.('Image ready');
        }
      } catch (err) {
        emit(updateNode(current, node.id, { status: 'failed' }));
        throw err;
      }

      if (until === 'text_to_image') {
        break;
      }
      continue;
    }

    if (node.kind === 'image_edit') {
      const imageNode = current.nodes.find((n) => n.kind === 'text_to_image');
      const sourceUrl = imageNode?.data?.imageUrl;
      const editPrompt = (node.data?.editPrompt || '').trim();
      if (!sourceUrl) {
        emit(updateNode(current, node.id, { status: 'failed' }));
        throw new Error(
          'Image Edit needs a completed Text to Image result before editing.',
        );
      }
      if (!editPrompt) {
        // Passthrough — keep graph runnable without forcing an edit instruction.
        emit(
          updateNode(current, node.id, {
            status: 'completed',
            data: {
              imageUrl: sourceUrl,
              taskId: imageNode?.data?.taskId || null,
              jobId: imageNode?.data?.jobId || null,
              skipped: true,
              statusMessage: 'skipped (empty edit prompt)',
            },
          }),
        );
        onStatus?.('Image edit skipped (no instruction) — using Krea image');
        if (until === 'image_edit') break;
        continue;
      }

      onStatus?.(`Editing image with Mage-Flow-Edit: ${editPrompt.slice(0, 60)}…`);
      try {
        const baseName = slugifyObjectName(
          current.name || 'studio_edit',
          'studio_edit',
        );
        const imageFile = await fetchImageAsFile(
          sourceUrl,
          apiEndpoint,
          `${baseName}_source.png`,
        );
        const apiResult = await createAndStartTask({
          type: 'image-edit',
          prompt: editPrompt,
          imageFile,
          options: {
            model_preference: node.data?.modelPreference || 'mage_flow_edit_turbo',
            object_name: baseName,
            model_parameters: {
              num_inference_steps: 4,
              guidance_scale: 1.0,
              max_size: 1024,
            },
            ...studioScope,
          },
        });
        const jobId = apiResult?.job_id || null;
        const taskRow = resolveImageTaskRow(
          { ...apiResult, feature: 'image_edit', type: 'image-edit' },
          deps,
          jobId,
        );
        taskRow.type = 'image-edit';
        const imageUrl =
          (jobId ? `/api/v1/system/jobs/${jobId}/download` : null) ||
          resolveTextToImageDownloadUrl(taskRow);
        if (!imageUrl) {
          throw new Error('Image edit completed but no downloadable image URL');
        }
        emit(
          updateNode(current, node.id, {
            status: 'completed',
            data: {
              taskId: taskRow?.id || null,
              imageUrl,
              jobId,
              editPrompt,
              skipped: false,
            },
          }),
        );
        onStatus?.('Edited image ready');
      } catch (err) {
        emit(updateNode(current, node.id, { status: 'failed' }));
        throw err;
      }
      if (until === 'image_edit') break;
      continue;
    }

    if (node.kind === 'image_to_3d') {
      // Prefer Mage-edited image when present; else Krea (and its multiview set).
      const editNode = current.nodes.find((n) => n.kind === 'image_edit');
      const imageNode = current.nodes.find((n) => n.kind === 'text_to_image');
      const editedUrl =
        editNode?.data?.imageUrl && !editNode?.data?.skipped
          ? editNode.data.imageUrl
          : editNode?.data?.imageUrl || null;
      const imageUrl = editedUrl || imageNode?.data?.imageUrl;
      if (!imageUrl) {
        emit(updateNode(current, node.id, { status: 'failed' }));
        throw new Error(
          'Image to 3D needs a completed Text to Image result. Run Generate image first, then Generate mesh.',
        );
      }

      const useEditedPrimary = Boolean(editedUrl && editNode && !editNode.data?.skipped);
      const views = useEditedPrimary
        ? []
        : Array.isArray(imageNode?.data?.views)
          ? imageNode.data.views
          : [];
      const primaryViewId =
        getTextToImagePromptOptions(current).camera_view || views[0]?.viewId || 'front';
      const primaryMeta =
        views.find((v) => v.viewId === primaryViewId) ||
        views[0] || { imageUrl, viewId: 'front' };
      const referenceMetas = views.filter((v) => v.viewId !== primaryMeta.viewId && v.imageUrl);

      onStatus?.(
        referenceMetas.length
          ? `Building TRELLIS multiview mesh (${1 + referenceMetas.length} views)…`
          : useEditedPrimary
            ? 'Building TRELLIS.2 mesh from edited image…'
            : 'Building TRELLIS.2 mesh…',
      );

      try {
        const baseName = slugifyObjectName(
          node.data?.objectName || current.name || 'studio',
          'studio',
        );
        const imageFile = await fetchImageAsFile(
          primaryMeta.imageUrl || imageUrl,
          apiEndpoint,
          `${baseName}_${primaryMeta.viewId || 'front'}.png`,
        );

        const referenceFiles = [];
        for (const ref of referenceMetas) {
          referenceFiles.push(
            await fetchImageAsFile(ref.imageUrl, apiEndpoint, `${baseName}_${ref.viewId}.png`),
          );
        }

        const objectName =
          slugifyObjectName(node.data?.objectName || current.name || 'studio_asset', 'studio_asset');
        onStatus?.(`Submitting ${objectName} to mesh API…`);
        const apiResult = await createAndStartTask(
          {
            type: 'image-to-3d',
            prompt: getPromptText(current) || 'Studio image to 3D',
            imageFile,
            options: {
              model_preference:
                node.data?.modelPreference || 'trellis2_image_to_textured_mesh',
              object_name: objectName,
              reference_image_files: referenceFiles,
              use_multiview_mesh: referenceFiles.length > 0,
              ...studioScope,
            },
          },
          null,
        );

        if (!apiResult?.job_id && !getTaskResultModelUrl(apiResult)) {
          emit(updateNode(current, node.id, { status: 'failed' }));
          throw new Error(
            'Image to 3D did not return a job id — check API connection and Task Manager.',
          );
        }

        const meshUrl =
          getTaskResultModelUrl(apiResult) ||
          getTaskResultModelUrl({ result: apiResult }) ||
          (apiResult?.job_id
            ? `/api/v1/system/jobs/${apiResult.job_id}/download`
            : null);

        emit(
          updateNode(current, node.id, {
            status: 'completed',
            data: {
              jobId: apiResult?.job_id || null,
              meshUrl,
              objectName,
              viewCount: 1 + referenceFiles.length,
            },
          }),
        );

        // Export stays pending until auto-rig finishes (or if rig is skipped).
        const exportNode = current.nodes.find((n) => n.kind === 'export_asset');
        const hasRig = current.nodes.some((n) => n.kind === 'auto_rigging');
        if (exportNode && !hasRig) {
          emit(
            updateNode(current, exportNode.id, {
              status: meshUrl ? 'completed' : 'ready',
              data: { meshUrl },
            }),
          );
        }
      } catch (err) {
        emit(updateNode(current, node.id, { status: 'failed' }));
        throw err;
      }
      continue;
    }

    if (node.kind === 'auto_rigging') {
      const meshNode = current.nodes.find((n) => n.kind === 'image_to_3d');
      const meshUrl = meshNode?.data?.meshUrl;
      if (!meshUrl) {
        emit(updateNode(current, node.id, { status: 'failed' }));
        throw new Error(
          'Auto Rigging needs a completed Image to 3D mesh. Run Generate mesh first.',
        );
      }

      const objectName = slugifyObjectName(
        node.data?.objectName || meshNode?.data?.objectName || current.name || 'studio_asset',
        'studio_asset',
      );
      // Prefer catalog template (Body+Cloth → template_wrap) over stale node prefs
      // that heal may have overwritten with a SkinTokens Task Manager job.
      const template = getStudioTemplate(current.templateId);
      const rigMode =
        template?.bodyRigMode || node.data?.rigMode || AUTO_RIG_MODES.FULL;
      const modelPreference = resolveAutoRigModelForTask(
        rigMode,
        template?.bodyRigModel || node.data?.modelPreference || 'skintokens_auto_rig',
      );

      onStatus?.(`Auto-rigging ${objectName} with ${modelPreference} (${rigMode})…`);

      try {
        const inputMeshJobId =
          meshNode?.data?.jobId || jobIdFromArtifactUrl(meshUrl) || null;
        let meshFile = null;
        if (!inputMeshJobId) {
          meshFile = await fetchImageAsFile(
            meshUrl,
            apiEndpoint,
            `${objectName}.glb`,
          );
        }
        const options = {
          object_name: objectName,
          model_preference: modelPreference,
          rig_mode: rigMode,
          output_format: getDefaultAutoRigOutputFormat(modelPreference, rigMode),
          ...studioScope,
          studio_input_mesh_job_id: inputMeshJobId,
        };
        if (
          rigMode === AUTO_RIG_MODES.TEMPLATE ||
          rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP
        ) {
          options.humanoid_template_id =
            node.data?.humanoidTemplateId || DEFAULT_HUMANOID_TEMPLATE_ID;
          options.model_preference = TEMPLATE_RIG_MODEL_ID;
        }
        if (rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP) {
          const promptOpts = getTextToImagePromptOptions(current);
          const gender = promptOpts?.character_gender || '';
          const ethnicity = promptOpts?.character_ethnicity || '';
          const wrapHeadTrack = normalizeHeadTrack(promptOpts?.head_track);
          // Voxel / non-humanoid heads: skip face wrap engines; keep generated mesh head.
          if (headTrackIsNone(wrapHeadTrack)) {
            options.rig_mode = AUTO_RIG_MODES.TEMPLATE;
            options.model_parameters = {
              ...(options.model_parameters || {}),
              head_track: HEAD_TRACK.NONE,
              gnm_identity: false,
              gnm_bake_expressions: false,
              face_likeness: false,
              likeness_alpha: 0,
            };
            onStatus?.(
              `Auto-rigging ${objectName} with ${TEMPLATE_RIG_MODEL_ID} (template bones-only — head track none)…`,
            );
          } else {
            const useMeshMonk = headTrackUsesMeshMonk(wrapHeadTrack);
            const likenessSource = String(promptOpts?.likeness_source || 'auto').toLowerCase();
            const resolvedLikeness =
              likenessSource === 'selfie' && !faceSelfieFile ? 'auto' : likenessSource;
            const composableBody =
              current.templateId === 'krea_composable_avatar_body' ||
              template?.id === 'krea_composable_avatar_body';
            const expectHeadless = composableBody || Boolean(promptOpts?.headless_body);
            options.model_parameters = {
              ...(options.model_parameters || {}),
              // Same humanoid wrap track — engine chosen via head_track chips.
              head_track: wrapHeadTrack,
              // Body+Cloth → neck-open scale hint (Blender overrides if mesh still has a head).
              expect_headless_body: expectHeadless ? true : undefined,
              /* moat */ gnm_identity: false,
              /* moat */ gnm_bake_expressions: false,
              /* moat */ face_likeness: false,
              /* likeness tuning: moat */ likeness_alpha: 0,
              likeness_source: useMeshMonk ? resolvedLikeness : 'body_roi',
              ...(gender ? { character_gender: gender } : {}),
              ...(ethnicity ? { character_ethnicity: ethnicity } : {}),
            };
            // Same Face selfie upload as Arc2Avatar — MeshMonk can use it as likeness source.
            if (useMeshMonk && faceSelfieFile) {
              options.likeness_image_file = faceSelfieFile;
              if (resolvedLikeness === 'auto' || resolvedLikeness === 'selfie') {
                options.model_parameters.likeness_source = resolvedLikeness;
              }
            }
          }
        }
        if (rigMode === AUTO_RIG_MODES.APPEARANCE_COMPONENT) {
          Object.assign(
            options,
            buildAppearanceComponentAutoRigOptions({
              appearance_slot: node.data?.appearanceSlot,
              objectName,
            }),
          );
        }

        const apiResult = await createAndStartTask(
          {
            type: 'auto-rigging',
            prompt: `Studio auto-rig ${objectName}`,
            imageFile: null,
            options,
          },
          meshFile,
        );

        const riggedUrl =
          getTaskResultMeshUrl(apiResult) ||
          getTaskResultModelUrl(apiResult) ||
          getTaskResultMeshUrl({ result: apiResult }) ||
          getTaskResultModelUrl({ result: apiResult }) ||
          (apiResult?.job_id
            ? `/api/v1/system/jobs/${apiResult.job_id}/download`
            : null);

        emit(
          updateNode(current, node.id, {
            status: 'completed',
            data: {
              jobId: apiResult?.job_id || null,
              meshUrl: riggedUrl || meshUrl,
              objectName,
              modelPreference: options.model_preference,
              rigMode,
              inputMeshUrl: meshUrl,
              inputMeshJobId,
            },
          }),
        );

        const clothingNode = current.nodes.find((n) => n.kind === 'appearance_clothing');
        const exportNode = current.nodes.find((n) => n.kind === 'export_asset');
        if (exportNode && !clothingNode) {
          emit(
            updateNode(current, exportNode.id, {
              status: riggedUrl || meshUrl ? 'completed' : 'ready',
              data: { meshUrl: riggedUrl || meshUrl },
            }),
          );
        } else if (exportNode && clothingNode) {
          emit(
            updateNode(current, exportNode.id, {
              data: { meshUrl: riggedUrl || meshUrl },
            }),
          );
        }
      } catch (err) {
        emit(updateNode(current, node.id, { status: 'failed' }));
        throw err;
      }
      continue;
    }

    if (node.kind === 'appearance_clothing') {
      const bodyStyle = getPromptText(current).trim();
      const clothingText = getClothingText(current);
      let accessories =
        Array.isArray(node.data?.accessories) && node.data.accessories.length
          ? node.data.accessories
          : parseClothingAccessoryLines(clothingText);

      if (!accessories.length && template?.includeClothing) {
        const fallbackText = getClothingText(current).trim() || DEFAULT_STUDIO_CLOTHING_TEXT;
        accessories = parseClothingAccessoryLines(fallbackText);
        if (accessories.length) {
          onStatus?.('Using default clothing lines — fan-out will generate Appearance slots');
          emit(
            updateNode(current, node.id, {
              data: { accessories, results: node.data?.results || [] },
            }),
          );
          current = {
            ...current,
            data: { ...(current.data || {}), clothingText: fallbackText },
          };
          emit(current);
        }
      }

      if (!accessories.length) {
        onStatus?.('No clothing lines — skipping Appearance clothing fan-out');
        emit(
          updateNode(current, node.id, {
            status: 'completed',
            data: { accessories: [], results: [] },
          }),
        );
        const exportNode = current.nodes.find((n) => n.kind === 'export_asset');
        const rigNode = current.nodes.find((n) => n.kind === 'auto_rigging');
        if (exportNode) {
          emit(
            updateNode(current, exportNode.id, {
              status: 'completed',
              data: { meshUrl: rigNode?.data?.meshUrl || exportNode.data?.meshUrl },
            }),
          );
        }
        continue;
      }

      let results = Array.isArray(node.data?.results) ? [...node.data.results] : [];
      try {
        for (let i = 0; i < accessories.length; i += 1) {
          if (clothingIndexFilter && !clothingIndexFilter.has(i)) {
            continue;
          }
          const acc = accessories[i];
          const objectName = slugifyObjectName(
            `${current.name || 'studio'}_${acc.object_name || `garment_${i}`}`,
            `garment_${i}`,
          );
          let existing = findClothingResultEntry(results, acc, objectName);
          const force = forceClothingIndexes.has(i);
          if (force && existing) {
            // Drop prior artifacts so this index regenerates end-to-end.
            results = upsertClothingResultEntry(results, {
              ...existing,
              imageUrl: null,
              imageJobId: null,
              meshUrl: null,
              meshJobId: null,
              traitUrl: null,
              jobId: null,
              equipped: false,
            });
            existing = findClothingResultEntry(results, acc, objectName);
          }
          if (existing?.traitUrl && !force) {
            onStatus?.(
              `Clothing ${i + 1}/${accessories.length}: ${acc.label} — already rigged, skipping`,
            );
            continue;
          }

          try {
          const bodyPromptOpts = getTextToImagePromptOptions(current);
          const garmentSubject = buildAppearanceGarmentSubjectPrompt({
            style: bodyStyle,
            slot: acc.appearance_slot,
            label: acc.label,
            cut: acc.cut,
            body_composition: bodyPromptOpts.body_composition,
          });
          const garmentOpts = studioGarmentTextToImageOptionsForSlot(acc.appearance_slot, {
            body_composition: bodyPromptOpts.body_composition,
            character_gender: bodyPromptOpts.character_gender,
          });
          const garmentPrompt = buildTextToImagePrompt(
            garmentSubject,
            garmentOpts,
          );

          let imageResult = null;
          if (existing?.imageUrl && !force) {
            onStatus?.(
              `Clothing ${i + 1}/${accessories.length}: reusing Krea image — ${acc.label}…`,
            );
            imageResult = {
              imageUrl: existing.imageUrl,
              jobId: existing.imageJobId || null,
            };
          } else {
            const hydrated =
              force
                ? null
                : await hydrateClothingImageFromTasks(deps, objectName, apiEndpoint);
            if (hydrated) {
              onStatus?.(
                `Clothing ${i + 1}/${accessories.length}: recovered Krea image from Task Manager — ${acc.label}…`,
              );
              imageResult = hydrated;
            } else {
              onStatus?.(
                `Clothing ${i + 1}/${accessories.length}: Krea (${acc.appearance_slot}) — ${acc.label}…`,
              );
              imageResult = await runSingleTextToImageView(createAndStartTask, deps, {
                prompt: garmentPrompt,
                promptOptions: garmentOpts,
                modelPreference: 'krea2_turbo_text_to_image',
                objectName: `${objectName}_img`,
                seed: null,
                viewId: 'front',
                studioScope,
              });
            }
          }

          let meshUrl = force ? null : existing?.meshUrl || null;
          let meshApi = !force && existing?.meshJobId ? { job_id: existing.meshJobId } : null;
          if (!meshUrl) {
            onStatus?.(
              `Clothing ${i + 1}/${accessories.length}: TRELLIS.2 mesh…`,
            );
            const imageFile = await fetchImageAsFile(
              imageResult.imageUrl,
              apiEndpoint,
              `${objectName}.png`,
            );
            meshApi = await createAndStartTask(
              {
                type: 'image-to-3d',
                prompt: garmentSubject,
                imageFile,
                options: {
                  model_preference: 'trellis2_image_to_textured_mesh',
                  object_name: objectName,
                  ...studioScope,
                },
              },
              null,
            );
            meshUrl =
              getTaskResultModelUrl(meshApi) ||
              getTaskResultModelUrl({ result: meshApi }) ||
              (meshApi?.job_id
                ? `/api/v1/system/jobs/${meshApi.job_id}/download`
                : null);
            if (!meshUrl) {
              throw new Error(`Clothing mesh failed for ${acc.label}`);
            }
          }

          const meshJobId = resolveStudioMeshJobId(meshApi, meshUrl, existing);
          const rigOpts = buildAppearanceComponentAutoRigOptions({
            appearance_slot: acc.appearance_slot,
            objectName: acc.label,
          });

          let traitUrl = force ? null : existing?.traitUrl || null;
          let rigApi = !force && existing?.jobId ? { job_id: existing.jobId } : null;
          if (!traitUrl) {
            onStatus?.(
              `Clothing ${i + 1}/${accessories.length}: appearance_component → ${rigOpts.appearance_slot}…`,
            );
            let meshFile = null;
            if (!meshJobId) {
              meshFile = await fetchImageAsFile(meshUrl, apiEndpoint, `${objectName}.glb`);
            }
            rigApi = await createAndStartTask(
              {
                type: 'auto-rigging',
                prompt: `Appearance clothing ${acc.label}`,
                imageFile: null,
                options: {
                  object_name: objectName,
                  ...rigOpts,
                  ...studioScope,
                  studio_input_mesh_job_id: meshJobId,
                },
              },
              meshFile,
            );
            traitUrl =
              getTaskResultMeshUrl(rigApi) ||
              getTaskResultModelUrl(rigApi) ||
              getTaskResultMeshUrl({ result: rigApi }) ||
              getTaskResultModelUrl({ result: rigApi }) ||
              (rigApi?.job_id
                ? `/api/v1/system/jobs/${rigApi.job_id}/download`
                : null);
          }

          let equip = { equipped: false };
          if (characterManager && traitUrl) {
            const absolute =
              resolveTaskModelUrl(traitUrl, apiEndpoint) || traitUrl;
            equip = await equipAppearanceComponentTrait(
              characterManager,
              absolute,
              rigOpts.appearance_slot,
              { accessorySegment: acc.accessory_segment || null },
            );
          }

          results = upsertClothingResultEntry(results, {
            label: acc.label,
            appearance_slot: rigOpts.appearance_slot,
            objectName,
            imageUrl: imageResult.imageUrl,
            imageJobId: imageResult.jobId || existing?.imageJobId || null,
            meshUrl,
            meshJobId: meshApi?.job_id || existing?.meshJobId || meshJobId,
            traitUrl,
            jobId: rigApi?.job_id || existing?.jobId || null,
            equipped: Boolean(equip.equipped),
            equipSlot: equip.slot || null,
            avatarSessionId: current.data?.avatarSessionId || null,
            error: null,
            startedAt: existing?.startedAt || new Date().toISOString(),
            completedAt: new Date().toISOString(),
          });

          emit(
            updateNode(current, node.id, {
              status: 'running',
              data: { accessories, results },
            }),
          );
          } catch (itemErr) {
            const message = itemErr?.message || String(itemErr);
            onStatus?.(
              `Clothing ${i + 1}/${accessories.length} failed — ${acc.label}: ${message}`,
            );
            results = upsertClothingResultEntry(results, {
              label: acc.label,
              appearance_slot: acc.appearance_slot,
              objectName,
              imageUrl: existing?.imageUrl || null,
              imageJobId: existing?.imageJobId || null,
              meshUrl: existing?.meshUrl || null,
              meshJobId: existing?.meshJobId || null,
              traitUrl: null,
              jobId: null,
              equipped: false,
              error: message,
              avatarSessionId: current.data?.avatarSessionId || null,
            });
            emit(
              updateNode(current, node.id, {
                status: 'running',
                data: { accessories, results },
              }),
            );
          }
        }

        emit(
          updateNode(current, node.id, {
            status: 'completed',
            data: { accessories, results },
          }),
        );

        const exportNode = current.nodes.find((n) => n.kind === 'export_asset');
        const rigNode = current.nodes.find((n) => n.kind === 'auto_rigging');
        if (exportNode) {
          emit(
            updateNode(current, exportNode.id, {
              status: 'completed',
              data: {
                meshUrl: rigNode?.data?.meshUrl || exportNode.data?.meshUrl,
                clothingResults: results,
                avatarSessionId: current.data?.avatarSessionId || null,
              },
            }),
          );
        }
      } catch (err) {
        emit(
          updateNode(current, node.id, {
            status: 'failed',
            data: { accessories, results },
          }),
        );
        throw err;
      }
    }
  }

  return current;
}
