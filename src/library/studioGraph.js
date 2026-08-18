/**
 * Studio pipeline graph — Lychee/3DGenStudio-style node model.
 * Execution stays in TaskManager / 3DAIGC-API; this module is pure data.
 */

import {
  normalizeTextToImagePromptOptions,
  STUDIO_MESH_READY_TEXT_TO_IMAGE_OPTIONS,
  STUDIO_MULTIVIEW_TEXT_TO_IMAGE_OPTIONS,
  STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS,
} from './textToImagePromptOptions.js';
import {
  AUTO_RIG_MODES,
  DEFAULT_HUMANOID_TEMPLATE_ID,
  TEMPLATE_RIG_MODEL_ID,
} from './avatarPipelineCatalog.js';
import {
  DEFAULT_STUDIO_CLOTHING_TEXT,
  parseClothingAccessoryLines,
  normalizeGarmentCutToken,
  resolveGarmentCut,
} from './appearanceClothing.js';
import { slugifyObjectName } from './objectNameUtils.js';
import {
  formatTaskDurationMs,
  formatTaskTimestamp,
  getTaskElapsedMs,
} from './taskPersistence.js';

export const STUDIO_STAGES = Object.freeze([
  { id: 'prompt', label: 'Prompt' },
  { id: 'image', label: 'Image' },
  { id: 'edit', label: 'Edit' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'rig', label: 'Rig' },
  { id: 'export', label: 'Export' },
]);

export const STUDIO_NODE_KINDS = Object.freeze({
  text_prompt: {
    id: 'text_prompt',
    label: 'Text Prompt',
    stage: 'prompt',
    runnable: false,
  },
  text_to_image: {
    id: 'text_to_image',
    label: 'Text to Image',
    stage: 'image',
    runnable: true,
    taskType: 'text-to-image',
    defaultModel: 'krea2_turbo_text_to_image',
  },
  image_edit: {
    id: 'image_edit',
    label: 'Image Edit',
    stage: 'edit',
    runnable: true,
    taskType: 'image-edit',
    defaultModel: 'mage_flow_edit_turbo',
  },
  image_to_3d: {
    id: 'image_to_3d',
    label: 'Image to 3D',
    stage: 'mesh',
    runnable: true,
    taskType: 'image-to-3d',
    defaultModel: 'trellis2_image_to_textured_mesh',
  },
  auto_rigging: {
    id: 'auto_rigging',
    label: 'Auto Rigging',
    stage: 'rig',
    runnable: true,
    taskType: 'auto-rigging',
    defaultModel: 'skintokens_auto_rig',
  },
  appearance_clothing: {
    id: 'appearance_clothing',
    label: 'Appearance Clothing',
    stage: 'rig',
    runnable: true,
    taskType: 'auto-rigging',
    defaultModel: 'appearance_component_auto_rig',
  },
  export_asset: {
    id: 'export_asset',
    label: 'Open in Viewport',
    stage: 'export',
    runnable: false,
  },
});

/** Selectable Studio pipeline templates (separate product paths). */
export const STUDIO_TEMPLATES = Object.freeze([
  {
    id: 'krea_trellis2',
    label: 'Krea → TRELLIS.2',
    shortLabel: 'TRELLIS.2',
    description: 'Single mesh-ready image → TRELLIS.2 textured mesh',
    defaultName: 'Krea → TRELLIS.2',
    imageModel: 'krea2_turbo_text_to_image',
    meshModel: 'trellis2_image_to_textured_mesh',
    promptOptions: STUDIO_MESH_READY_TEXT_TO_IMAGE_OPTIONS,
    bodyRigMode: AUTO_RIG_MODES.FULL,
    bodyRigModel: 'skintokens_auto_rig',
    includeClothing: false,
  },
  {
    id: 'krea_mage_trellis2',
    label: 'Krea → Mage Edit → TRELLIS.2',
    shortLabel: 'Mage Edit',
    description:
      'Mesh-ready Krea image → Mage-Flow-Edit-Turbo → TRELLIS.2 textured mesh',
    defaultName: 'Krea → Mage → TRELLIS.2',
    imageModel: 'krea2_turbo_text_to_image',
    editModel: 'mage_flow_edit_turbo',
    meshModel: 'trellis2_image_to_textured_mesh',
    promptOptions: STUDIO_MESH_READY_TEXT_TO_IMAGE_OPTIONS,
    bodyRigMode: AUTO_RIG_MODES.FULL,
    bodyRigModel: 'skintokens_auto_rig',
    includeClothing: false,
    includeImageEdit: true,
  },
  {
    id: 'krea_trellis_multiview',
    label: 'Krea → TRELLIS Multiview',
    shortLabel: 'Multiview',
    description:
      'Six orthographic views (shared seed) → TRELLIS multiview mesh',
    defaultName: 'Krea → TRELLIS Multiview',
    imageModel: 'krea2_turbo_text_to_image',
    meshModel: 'trellis_image_to_textured_mesh',
    promptOptions: STUDIO_MULTIVIEW_TEXT_TO_IMAGE_OPTIONS,
    bodyRigMode: AUTO_RIG_MODES.FULL,
    bodyRigModel: 'skintokens_auto_rig',
    includeClothing: false,
  },
  {
    id: 'krea_composable_avatar_body',
    label: 'Krea body + clothing (composable)',
    shortLabel: 'Body+Cloth',
    description:
      'Selfie (optional Arc2Avatar head) + neck-open Krea body → TRELLIS.2 → template_wrap; clothing → Appearance slots; head splat attaches to Head bone',
    defaultName: 'Krea composable body',
    imageModel: 'krea2_turbo_text_to_image',
    meshModel: 'trellis2_image_to_textured_mesh',
    promptOptions: STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS,
    bodyRigMode: AUTO_RIG_MODES.TEMPLATE_WRAP,
    bodyRigModel: TEMPLATE_RIG_MODEL_ID,
    includeClothing: true,
    includeArc2AvatarHead: true,
  },
]);

export const DEFAULT_STUDIO_TEMPLATE_ID = 'krea_trellis2';

/** Default canvas positions (staggered row — matches Body+Cloth reference layout). */
export const STUDIO_GRAPH_LAYOUT = Object.freeze({
  colStep: 280,
  originX: 40,
  rowY: 48,
  imageY: 196,
  clothingY: 312,
});

/**
 * @param {'text_prompt'|'text_to_image'|'image_edit'|'image_to_3d'|'auto_rigging'|'appearance_clothing'|'export_asset'} kind
 * @param {{ includeImageEdit?: boolean, includeClothing?: boolean }} layout
 * @returns {{ x: number, y: number }}
 */
export function getStudioGraphNodePosition(kind, layout = {}) {
  const { colStep, originX, rowY, imageY, clothingY } = STUDIO_GRAPH_LAYOUT;
  const includeImageEdit = Boolean(layout.includeImageEdit);
  const includeClothing = Boolean(layout.includeClothing);
  const col = (index) => originX + index * colStep;

  const kindCol = {
    text_prompt: 0,
    text_to_image: 1,
    image_edit: includeImageEdit ? 2 : -1,
    image_to_3d: includeImageEdit ? 3 : 2,
    auto_rigging: includeImageEdit ? 4 : 3,
    appearance_clothing: includeImageEdit ? 4 : 3,
    export_asset: includeImageEdit ? 5 : includeClothing ? 4 : 4,
  };
  const x = col(kindCol[kind] ?? 0);
  if (kind === 'text_to_image') return { x, y: imageY };
  if (kind === 'appearance_clothing') return { x, y: clothingY };
  return { x, y: rowY };
}

/** @deprecated Legacy flat row — used to heal stored projects on migrate. */
const LEGACY_STUDIO_GRAPH_FLAT_Y = 120;
const LEGACY_STUDIO_GRAPH_CLOTHING_Y = 280;

export function getStudioTemplate(templateId) {
  return (
    STUDIO_TEMPLATES.find((t) => t.id === templateId) ||
    STUDIO_TEMPLATES.find((t) => t.id === DEFAULT_STUDIO_TEMPLATE_ID)
  );
}

function newId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}`;
}

/**
 * @param {string} templateId
 * @param {{
 *   prompt?: string,
 *   projectName?: string,
 *   clothingText?: string,
 *   headJobId?: string,
 *   avatarSessionId?: string,
 * }} [opts]
 */
export function createStudioProject(templateId = DEFAULT_STUDIO_TEMPLATE_ID, opts = {}) {
  const template = getStudioTemplate(templateId);
  const prompt = typeof opts.prompt === 'string' ? opts.prompt : '';
  const projectName =
    typeof opts.projectName === 'string' && opts.projectName.trim()
      ? opts.projectName.trim()
      : template.defaultName;
  const clothingTextExplicit = Object.prototype.hasOwnProperty.call(opts, 'clothingText');
  let clothingText = clothingTextExplicit ? String(opts.clothingText ?? '') : '';
  if (!clothingTextExplicit && template.includeClothing) {
    clothingText = DEFAULT_STUDIO_CLOTHING_TEXT;
  }
  const headJobId = typeof opts.headJobId === 'string' ? opts.headJobId.trim() : '';
  const avatarSessionId =
    (typeof opts.avatarSessionId === 'string' && opts.avatarSessionId.trim()) ||
    (headJobId ? `avatar_${headJobId}` : newId('avatar'));

  const includeImageEdit = Boolean(template.includeImageEdit);
  const includeClothing = Boolean(template.includeClothing);
  const graphLayout = { includeImageEdit, includeClothing };
  const nodePos = (kind) => getStudioGraphNodePosition(kind, graphLayout);

  const promptNode = {
    id: newId('n'),
    kind: 'text_prompt',
    label: STUDIO_NODE_KINDS.text_prompt.label,
    stage: 'prompt',
    status: 'ready',
    data: { prompt, clothingText },
    position: nodePos('text_prompt'),
  };
  const imageNode = {
    id: newId('n'),
    kind: 'text_to_image',
    label: STUDIO_NODE_KINDS.text_to_image.label,
    stage: 'image',
    status: 'idle',
    data: {
      modelPreference: template.imageModel,
      promptOptions: {
        ...template.promptOptions,
        ...(opts.promptOptions && typeof opts.promptOptions === 'object'
          ? opts.promptOptions
          : {}),
      },
      taskId: null,
      imageUrl: null,
    },
    position: nodePos('text_to_image'),
  };

  const editPrompt =
    typeof opts.editPrompt === 'string' ? opts.editPrompt : '';
  let editNode = null;
  if (includeImageEdit) {
    editNode = {
      id: newId('n'),
      kind: 'image_edit',
      label: STUDIO_NODE_KINDS.image_edit.label,
      stage: 'edit',
      status: 'idle',
      data: {
        modelPreference: template.editModel || 'mage_flow_edit_turbo',
        editPrompt,
        taskId: null,
        imageUrl: null,
      },
      position: nodePos('image_edit'),
    };
  }

  const meshNode = {
    id: newId('n'),
    kind: 'image_to_3d',
    label:
      template.id === 'krea_trellis_multiview'
        ? 'Image to 3D (Multiview)'
        : STUDIO_NODE_KINDS.image_to_3d.label,
    stage: 'mesh',
    status: 'idle',
    data: {
      modelPreference: template.meshModel,
      taskId: null,
      meshUrl: null,
      objectName: projectName,
    },
    position: nodePos('image_to_3d'),
  };
  const bodyRigMode = template.bodyRigMode || AUTO_RIG_MODES.FULL;
  const bodyRigModel =
    template.bodyRigModel || STUDIO_NODE_KINDS.auto_rigging.defaultModel;
  const rigNode = {
    id: newId('n'),
    kind: 'auto_rigging',
    label:
      bodyRigMode === AUTO_RIG_MODES.TEMPLATE_WRAP
        ? 'Auto Rigging (template wrap)'
        : STUDIO_NODE_KINDS.auto_rigging.label,
    stage: 'rig',
    status: 'idle',
    data: {
      modelPreference: bodyRigModel,
      rigMode: bodyRigMode,
      humanoidTemplateId:
        bodyRigMode === AUTO_RIG_MODES.TEMPLATE ||
        bodyRigMode === AUTO_RIG_MODES.TEMPLATE_WRAP
          ? DEFAULT_HUMANOID_TEMPLATE_ID
          : undefined,
      taskId: null,
      meshUrl: null,
      objectName: projectName,
    },
    position: nodePos('auto_rigging'),
  };

  const nodes = [promptNode, imageNode];
  if (editNode) nodes.push(editNode);
  nodes.push(meshNode, rigNode);

  const edges = [
    { id: newId('e'), source: promptNode.id, target: imageNode.id },
  ];
  if (editNode) {
    edges.push(
      { id: newId('e'), source: imageNode.id, target: editNode.id },
      { id: newId('e'), source: editNode.id, target: meshNode.id },
    );
  } else {
    edges.push({ id: newId('e'), source: imageNode.id, target: meshNode.id });
  }
  edges.push({ id: newId('e'), source: meshNode.id, target: rigNode.id });

  let clothingNode = null;
  if (template.includeClothing) {
    clothingNode = {
      id: newId('n'),
      kind: 'appearance_clothing',
      label: STUDIO_NODE_KINDS.appearance_clothing.label,
      stage: 'rig',
      status: 'idle',
      data: {
        accessories: parseClothingAccessoryLines(clothingText),
        results: [],
      },
      position: nodePos('appearance_clothing'),
    };
    nodes.push(clothingNode);
    edges.push({ id: newId('e'), source: rigNode.id, target: clothingNode.id });
  }

  const exportNode = {
    id: newId('n'),
    kind: 'export_asset',
    label: STUDIO_NODE_KINDS.export_asset.label,
    stage: 'export',
    status: 'idle',
    data: { meshUrl: null },
    position: nodePos('export_asset'),
  };
  nodes.push(exportNode);
  const exportSource = clothingNode || rigNode;
  edges.push({ id: newId('e'), source: exportSource.id, target: exportNode.id });

  return {
    id: newId('proj'),
    name: projectName,
    templateId: template.id,
    createdAt: new Date().toISOString(),
    data: {
      clothingText,
      headJobId,
      avatarSessionId,
    },
    nodes,
    edges,
  };
}

/**
 * Locked single-image pipeline: Krea 2 Turbo → TRELLIS.2.
 * @param {{ prompt?: string, projectName?: string }} [opts]
 */
export function createKreaTrellisTemplate(opts = {}) {
  return createStudioProject('krea_trellis2', opts);
}

/**
 * Krea → Mage-Flow-Edit → TRELLIS.2 (optional instruction edit before mesh).
 * @param {{ prompt?: string, editPrompt?: string, projectName?: string }} [opts]
 */
export function createKreaMageTrellisTemplate(opts = {}) {
  return createStudioProject('krea_mage_trellis2', opts);
}

/**
 * Orthographic turnaround pipeline: Krea ×6 → TRELLIS multiview.
 * @param {{ prompt?: string, projectName?: string }} [opts]
 */
export function createKreaTrellisMultiviewTemplate(opts = {}) {
  return createStudioProject('krea_trellis_multiview', opts);
}

/**
 * Neck-open body + clothing → Appearance slots (composable VRM).
 * @param {{ prompt?: string, projectName?: string, clothingText?: string, headJobId?: string }} [opts]
 */
export function createKreaComposableAvatarBodyTemplate(opts = {}) {
  return createStudioProject('krea_composable_avatar_body', opts);
}

const STUDIO_ARTIFACT_DATA_KEYS = [
  'imageUrl',
  'views',
  'meshUrl',
  'jobId',
  'taskId',
  'inputMeshUrl',
  'inputMeshJobId',
  'results',
  'objectName',
  'promptOptions',
  'startedAt',
  'completedAt',
];

function remapStudioNodeId(project, fromId, toId) {
  if (!project?.nodes || !fromId || !toId || fromId === toId) return project;
  if (project.nodes.some((n) => n.id === toId)) return project;
  return {
    ...project,
    nodes: project.nodes.map((n) => (n.id === fromId ? { ...n, id: toId } : n)),
    edges: project.edges.map((e) => ({
      ...e,
      source: e.source === fromId ? toId : e.source,
      target: e.target === fromId ? toId : e.target,
    })),
  };
}

function mergeStudioArtifactData(templateData, oldData) {
  const merged = { ...(templateData || {}) };
  if (!oldData) return merged;
  for (const key of STUDIO_ARTIFACT_DATA_KEYS) {
    if (oldData[key] != null) merged[key] = oldData[key];
  }
  return merged;
}

function studioKindsForTemplate(template) {
  const kinds = new Set([
    'text_prompt',
    'text_to_image',
    'image_to_3d',
    'auto_rigging',
    'export_asset',
  ]);
  if (template?.includeImageEdit) kinds.add('image_edit');
  if (template?.includeClothing) kinds.add('appearance_clothing');
  return kinds;
}

/**
 * Switch pipeline template without dropping produced stage cards.
 * Re-run updates a stage in place; Reset is the explicit wipe.
 * Nodes that the new template does not include are stashed on
 * `data.preservedByKind` and restored if you switch back.
 *
 * @param {object} project
 * @param {string} templateId
 * @param {{
 *   prompt?: string,
 *   editPrompt?: string,
 *   clothingText?: string,
 *   headJobId?: string,
 *   promptOptions?: object,
 *   projectName?: string,
 * }} [opts]
 */
export function applyStudioTemplate(project, templateId, opts = {}) {
  const template = getStudioTemplate(templateId);
  if (!project?.nodes) {
    return createStudioProject(template.id, opts);
  }

  const preserved = { ...(project.data?.preservedByKind || {}) };
  const nextKinds = studioKindsForTemplate(template);
  for (const node of project.nodes) {
    if (!nextKinds.has(node.kind) && (nodeHasStudioArtifact(node) || node.kind === 'image_edit')) {
      preserved[node.kind] = {
        status: node.status,
        data: { ...(node.data || {}) },
        position: node.position || null,
      };
    }
  }

  const existingClothing = Object.prototype.hasOwnProperty.call(opts, 'clothingText')
    ? String(opts.clothingText ?? '')
    : getClothingText(project);
  let clothingText = existingClothing;
  if (template.includeClothing && !String(clothingText || '').trim()) {
    clothingText = DEFAULT_STUDIO_CLOTHING_TEXT;
  }

  const stashedEdit = preserved.image_edit?.data || {};
  let next = createStudioProject(template.id, {
    prompt: Object.prototype.hasOwnProperty.call(opts, 'prompt')
      ? opts.prompt
      : getPromptText(project),
    editPrompt: Object.prototype.hasOwnProperty.call(opts, 'editPrompt')
      ? opts.editPrompt
      : getEditPrompt(project) || stashedEdit.editPrompt || '',
    clothingText,
    headJobId: Object.prototype.hasOwnProperty.call(opts, 'headJobId')
      ? opts.headJobId
      : getHeadJobId(project),
    avatarSessionId: project.data?.avatarSessionId,
    projectName:
      (typeof opts.projectName === 'string' && opts.projectName.trim()) ||
      project.name ||
      template.defaultName,
    promptOptions: opts.promptOptions,
  });

  next = {
    ...next,
    id: project.id,
    createdAt: project.createdAt || next.createdAt,
    data: {
      ...(project.data || {}),
      ...next.data,
      studioWorkspaceId: project.data?.studioWorkspaceId,
      preservedByKind: preserved,
    },
  };

  const snapshotForKind = (kind) => {
    const live = project.nodes.find((n) => n.kind === kind);
    if (live) return live;
    const stash = preserved[kind];
    if (!stash) return null;
    return {
      id: null,
      kind,
      status: stash.status,
      data: stash.data,
      position: stash.position,
    };
  };

  for (const kind of nextKinds) {
    const newNode = next.nodes.find((n) => n.kind === kind);
    const old = snapshotForKind(kind);
    if (!newNode || !old) continue;
    if (old.id) {
      next = remapStudioNodeId(next, newNode.id, old.id);
    }
    const nodeId = old.id || newNode.id;
    const current = next.nodes.find((n) => n.id === nodeId) || newNode;
    const mergedData = mergeStudioArtifactData(current.data, old.data);
    if (kind === 'appearance_clothing') {
      mergedData.results = Array.isArray(old.data?.results) ? old.data.results : [];
      if (Array.isArray(old.data?.accessories) && old.data.accessories.length) {
        mergedData.accessories = old.data.accessories;
      }
    }
    const mergedNode = { ...current, data: mergedData };
    const keepStatus = nodeHasStudioArtifact(mergedNode)
      ? old.status === 'running'
        ? 'completed'
        : old.status || 'completed'
      : current.status;
    next = updateNode(next, nodeId, {
      status: keepStatus,
      data: mergedData,
      position: old.position || current.position,
    });
  }

  const stillPreserved = { ...preserved };
  for (const node of next.nodes) {
    delete stillPreserved[node.kind];
  }
  next = {
    ...next,
    data: {
      ...(next.data || {}),
      preservedByKind: stillPreserved,
    },
  };

  return migrateStudioProject(next);
}

/**
 * Move nodes from the legacy flat row (y=120) to the staggered reference layout.
 * @param {object} project
 * @returns {object}
 */
export function healStudioGraphLayout(project) {
  if (!project?.nodes?.length) return project;
  const template = getStudioTemplate(project.templateId);
  const includeImageEdit = Boolean(template?.includeImageEdit);
  const includeClothing = project.nodes.some((n) => n.kind === 'appearance_clothing');
  const layout = { includeImageEdit, includeClothing };

  const usesLegacyFlatRow = project.nodes.some((n) => {
    if (n.kind === 'text_to_image') {
      return n.position?.y === LEGACY_STUDIO_GRAPH_FLAT_Y;
    }
    if (n.kind === 'appearance_clothing') {
      return n.position?.y === LEGACY_STUDIO_GRAPH_CLOTHING_Y;
    }
    if (
      n.kind === 'text_prompt' ||
      n.kind === 'image_to_3d' ||
      n.kind === 'auto_rigging' ||
      n.kind === 'export_asset' ||
      n.kind === 'image_edit'
    ) {
      return n.position?.y === LEGACY_STUDIO_GRAPH_FLAT_Y;
    }
    return false;
  });
  if (!usesLegacyFlatRow) return project;

  let next = project;
  for (const node of project.nodes) {
    const target = getStudioGraphNodePosition(node.kind, layout);
    if (
      node.position?.x === target.x &&
      node.position?.y === target.y
    ) {
      continue;
    }
    next = updateNode(next, node.id, { position: target });
  }
  return next;
}

export function getNodeKind(kind) {
  return STUDIO_NODE_KINDS[kind] || null;
}

export function getUpstreamNode(project, nodeId) {
  const edge = project.edges.find((e) => e.target === nodeId);
  if (!edge) return null;
  return project.nodes.find((n) => n.id === edge.source) || null;
}

export function getDownstreamNodes(project, nodeId) {
  const targets = project.edges.filter((e) => e.source === nodeId).map((e) => e.target);
  return project.nodes.filter((n) => targets.includes(n.id));
}

/**
 * Stamp Started/Completed ISO times onto a node. Re-run resets the clock.
 * Explicit timestamps in `existingData` (hydrate / Task Manager) win over `now`.
 * @param {object} [existingData]
 * @param {'running'|'completed'|'failed'} phase
 */
export function applyStudioRunTiming(existingData, phase) {
  const now = new Date().toISOString();
  const data = existingData && typeof existingData === 'object' ? existingData : {};
  if (phase === 'running') {
    return { startedAt: now, completedAt: null };
  }
  if (phase === 'completed' || phase === 'failed') {
    return {
      startedAt: data.startedAt || now,
      completedAt: data.completedAt || now,
    };
  }
  return {};
}

/**
 * Same Started / Completed / elapsed line as Task Manager generation cards
 * (`mm-dd-yyyy h:mm:ss AM/PM EDT` via formatTaskTimestamp).
 * @param {object} [node]
 * @returns {string}
 */
export function formatStudioNodeTiming(node) {
  const started = node?.data?.startedAt;
  const completed = node?.data?.completedAt;
  const display = getStudioNodeDisplayStatus(node);
  if (display === 'running') {
    return started ? `Started ${formatTaskTimestamp(started)}` : '';
  }
  const parts = [];
  if (started) parts.push(`Started ${formatTaskTimestamp(started)}`);
  if (completed) parts.push(`Completed ${formatTaskTimestamp(completed)}`);
  const elapsedMs = getTaskElapsedMs({
    startedAt: started,
    createdAt: started,
    completedAt: completed,
  });
  if (elapsedMs != null) parts.push(`${formatTaskDurationMs(elapsedMs)} elapsed`);
  return parts.join(' • ');
}

export function updateNode(project, nodeId, patch) {
  return {
    ...project,
    nodes: project.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      let data = patch.data ? { ...n.data, ...patch.data } : n.data;
      if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
        if (patch.status === 'running' && n.status !== 'running') {
          data = { ...data, ...applyStudioRunTiming(data, 'running') };
        } else if (patch.status === 'completed' || patch.status === 'failed') {
          data = { ...data, ...applyStudioRunTiming(data, patch.status) };
        }
      }
      return {
        ...n,
        ...patch,
        data,
      };
    }),
  };
}

export function setPromptText(project, prompt) {
  const promptNode = project.nodes.find((n) => n.kind === 'text_prompt');
  if (!promptNode) return project;
  return updateNode(project, promptNode.id, {
    status: prompt.trim() ? 'ready' : 'idle',
    data: { prompt },
  });
}

export function getPromptText(project) {
  const promptNode = project.nodes.find((n) => n.kind === 'text_prompt');
  return promptNode?.data?.prompt ?? '';
}

export function setEditPrompt(project, editPrompt) {
  const editNode = project.nodes.find((n) => n.kind === 'image_edit');
  if (!editNode) return project;
  const text = typeof editPrompt === 'string' ? editPrompt : '';
  return updateNode(project, editNode.id, {
    data: { editPrompt: text },
  });
}

export function getEditPrompt(project) {
  const editNode = project.nodes.find((n) => n.kind === 'image_edit');
  return editNode?.data?.editPrompt ?? '';
}

export function getClothingText(project) {
  const fromData = project?.data?.clothingText;
  if (typeof fromData === 'string') return fromData;
  const promptNode = project?.nodes?.find((n) => n.kind === 'text_prompt');
  return promptNode?.data?.clothingText ?? '';
}

export function setClothingText(project, clothingText) {
  const text = typeof clothingText === 'string' ? clothingText : '';
  const accessories = parseClothingAccessoryLines(text);
  let next = {
    ...project,
    data: {
      ...(project.data || {}),
      clothingText: text,
    },
  };
  const promptNode = next.nodes.find((n) => n.kind === 'text_prompt');
  if (promptNode) {
    next = updateNode(next, promptNode.id, { data: { clothingText: text } });
  }
  const clothingNode = next.nodes.find((n) => n.kind === 'appearance_clothing');
  if (clothingNode) {
    next = updateNode(next, clothingNode.id, {
      status: accessories.length ? 'ready' : 'idle',
      data: { accessories, results: clothingNode.data?.results || [] },
    });
  }
  return next;
}

export function getHeadJobId(project) {
  return project?.data?.headJobId || '';
}

export function setHeadJobId(project, headJobId) {
  const id = typeof headJobId === 'string' ? headJobId.trim() : '';
  const avatarSessionId =
    id ? `avatar_${id}` : project?.data?.avatarSessionId || newId('avatar');
  return {
    ...project,
    data: {
      ...(project.data || {}),
      headJobId: id,
      avatarSessionId,
    },
  };
}

export function getHeadSplatUrl(project) {
  return project?.data?.headSplatUrl || '';
}

export function setHeadSplatUrl(project, headSplatUrl) {
  const url = typeof headSplatUrl === 'string' ? headSplatUrl.trim() : '';
  return {
    ...project,
    data: {
      ...(project.data || {}),
      headSplatUrl: url,
    },
  };
}

export function getFaceSelfieName(project) {
  return project?.data?.faceSelfieName || '';
}

/** Persist selfie filename only (File blob lives in StudioPage state). */
export function setFaceSelfieMeta(project, fileOrNull) {
  const name =
    fileOrNull && typeof fileOrNull.name === 'string' ? fileOrNull.name : '';
  return {
    ...project,
    data: {
      ...(project.data || {}),
      faceSelfieName: name,
      queueArc2AvatarHead: Boolean(name),
    },
  };
}

export function getAvatarSessionId(project) {
  return project?.data?.avatarSessionId || '';
}

export function setClothingAccessorySlot(project, index, appearanceSlot) {
  const clothingNode = project.nodes.find((n) => n.kind === 'appearance_clothing');
  if (!clothingNode) return project;
  const accessories = [...(clothingNode.data?.accessories || [])];
  if (!accessories[index]) return project;
  const slot =
    String(appearanceSlot || '').trim() || accessories[index].appearance_slot;
  const nextAcc = {
    ...accessories[index],
    appearance_slot: slot,
  };
  // Re-resolve cut defaults when slot changes.
  const cutInfo = resolveGarmentCut({
    label: nextAcc.label,
    appearance_slot: slot,
    cut: nextAcc.cut,
  });
  nextAcc.cut = cutInfo.cut;
  nextAcc.cut_locked = cutInfo.locked;
  nextAcc.cut_kind = cutInfo.kind;
  accessories[index] = nextAcc;
  // Mirror slot override into clothing text is optional; keep structured list authoritative.
  return updateNode(project, clothingNode.id, { data: { accessories } });
}

/**
 * Set exclusive garment cut (Legs length or Chest sleeve) for one accessory.
 * @param {object} project
 * @param {number} index
 * @param {'long'|'short'|string} cut
 */
export function setClothingAccessoryCut(project, index, cut) {
  const clothingNode = project.nodes.find((n) => n.kind === 'appearance_clothing');
  if (!clothingNode) return project;
  const accessories = [...(clothingNode.data?.accessories || [])];
  if (!accessories[index]) return project;
  const normalized = normalizeGarmentCutToken(cut);
  if (!normalized) return project;
  const cutInfo = resolveGarmentCut({
    label: accessories[index].label,
    appearance_slot: accessories[index].appearance_slot,
    cut: normalized,
  });
  accessories[index] = {
    ...accessories[index],
    cut: normalized,
    cut_locked: false,
    cut_kind: cutInfo.kind,
  };
  return updateNode(project, clothingNode.id, { data: { accessories } });
}

/**
 * Clear artifacts for one clothing accessory so the next clothing fan-out
 * regenerates it (Krea → TRELLIS → appearance_component).
 * @param {object} project
 * @param {number} accessoryIndex
 * @param {{ keepImage?: boolean }} [opts]
 */
export function clearClothingGarmentResult(project, accessoryIndex, opts = {}) {
  const clothingNode = project.nodes.find((n) => n.kind === 'appearance_clothing');
  if (!clothingNode) return project;
  const accessories = clothingNode.data?.accessories || [];
  const acc = accessories[accessoryIndex];
  if (!acc) return project;
  const keepImage = Boolean(opts.keepImage);
  const results = Array.isArray(clothingNode.data?.results)
    ? clothingNode.data.results.map((r) => {
        const match =
          (r?.label === acc.label && r?.appearance_slot === acc.appearance_slot) ||
          (acc.object_name && r?.objectName && String(r.objectName).includes(acc.object_name));
        if (!match) return r;
        return {
          ...r,
          imageUrl: keepImage ? r.imageUrl : null,
          imageJobId: keepImage ? r.imageJobId : null,
          meshUrl: null,
          meshJobId: null,
          traitUrl: null,
          jobId: null,
          equipped: false,
          equipSlot: null,
          statusMessage: 'Queued for re-run',
        };
      })
    : [];
  return updateNode(project, clothingNode.id, {
    status: 'ready',
    data: {
      accessories,
      results,
      statusMessage: `Re-run queued: ${acc.label}`,
    },
  });
}

/**
 * Accessory index for a clothing result row (label + slot).
 * @param {object} project
 * @param {{ label?: string, appearance_slot?: string, objectName?: string }} item
 * @returns {number}
 */
export function findClothingAccessoryIndex(project, item) {
  const clothingNode = project.nodes.find((n) => n.kind === 'appearance_clothing');
  const accessories = clothingNode?.data?.accessories || [];
  if (!item || !accessories.length) return -1;
  const byLabelSlot = accessories.findIndex(
    (a) =>
      a.label === item.label &&
      a.appearance_slot === (item.appearance_slot || item.equipSlot),
  );
  if (byLabelSlot >= 0) return byLabelSlot;
  if (item.objectName) {
    const byName = accessories.findIndex(
      (a) => a.object_name && String(item.objectName).includes(a.object_name),
    );
    if (byName >= 0) return byName;
  }
  return -1;
}

export function getTextToImagePromptOptions(project) {
  const imageNode = project.nodes.find((n) => n.kind === 'text_to_image');
  const template = getStudioTemplate(project.templateId);
  return normalizeTextToImagePromptOptions(
    imageNode?.data?.promptOptions || template.promptOptions,
  );
}

export function setTextToImagePromptOptions(project, options) {
  const imageNode = project.nodes.find((n) => n.kind === 'text_to_image');
  if (!imageNode) return project;
  return updateNode(project, imageNode.id, {
    data: {
      promptOptions: normalizeTextToImagePromptOptions(options),
    },
  });
}

/**
 * Clear orphaned `running` statuses left in localStorage when a pipeline was
 * interrupted (refresh / hung poll). Artifacts keep the node `completed`.
 * @param {object} project
 */
export function recoverInterruptedStudioNodes(project) {
  if (!project?.nodes) return project;
  let changed = false;
  const nodes = project.nodes.map((n) => {
    if (n.status !== 'running') return n;
    changed = true;
    const hasImage =
      Boolean(n.data?.imageUrl) ||
      (Array.isArray(n.data?.views) && n.data.views.some((v) => v?.imageUrl));
    const hasMesh = Boolean(n.data?.meshUrl);
    const hasClothing = Array.isArray(n.data?.results) && n.data.results.length > 0;
    if (hasImage || hasMesh || hasClothing) {
      const completedAt = n.data?.completedAt || new Date().toISOString();
      return {
        ...n,
        status: 'completed',
        data: {
          ...n.data,
          startedAt: n.data?.startedAt || completedAt,
          completedAt,
        },
      };
    }
    // Keep job-linked nodes recoverable instead of idle-black-hole.
    if (n.data?.jobId) {
      return { ...n, status: 'ready' };
    }
    if (n.kind === 'text_prompt') {
      return { ...n, status: n.data?.prompt?.trim() ? 'ready' : 'idle' };
    }
    return { ...n, status: 'idle' };
  });
  return changed ? { ...project, nodes } : project;
}

function taskTerminalSuccess(task) {
  if (!task) return false;
  const status = String(task.status || '').toLowerCase();
  const resultStatus = String(task.result?.status || '').toLowerCase();
  return (
    ['completed', 'success', 'done', 'succeeded'].includes(status) ||
    ['completed', 'success', 'done', 'succeeded'].includes(resultStatus)
  );
}

function taskJobId(task) {
  return task?.job_id || task?.result?.job_id || null;
}

function sortTasksNewestFirst(tasks) {
  return [...tasks].sort((a, b) => {
    const ta = Date.parse(a.completedAt || a.updatedAt || a.createdAt || 0) || 0;
    const tb = Date.parse(b.completedAt || b.updatedAt || b.createdAt || 0) || 0;
    return tb - ta;
  });
}

function pickCompletedTask(tasks, { types = [], features = [], jobId = null, allowNewestFallback = false } = {}) {
  const typeSet = new Set(types);
  const featureSet = new Set(features);
  const candidates = tasks.filter((t) => {
    if (!taskTerminalSuccess(t)) return false;
    const typeOk = typeSet.has(t.type);
    const featureOk = featureSet.has(t.result?.feature) || featureSet.has(t.feature);
    return typeOk || featureOk;
  });
  if (!candidates.length) return null;
  const sorted = sortTasksNewestFirst(candidates);
  if (jobId) {
    return sorted.find((t) => taskJobId(t) === jobId) || null;
  }
  // Never grab an unrelated historical job unless explicitly allowed.
  if (!allowNewestFallback) return null;
  return sorted[0];
}

function taskObjectName(task) {
  return String(
    task?.options?.object_name ||
      task?.object_name ||
      task?.name ||
      task?.metadata?.object_name ||
      task?.result?.object_name ||
      '',
  ).trim();
}

/** Compare Studio project names and Task Manager object_names (spaces vs underscores). */
export function studioObjectNamesMatch(a, b) {
  const ka = String(slugifyObjectName(String(a || '').trim(), '') || '').toLowerCase();
  const kb = String(slugifyObjectName(String(b || '').trim(), '') || '').toLowerCase();
  if (!ka || !kb) return false;
  return ka === kb;
}

export function getStudioWorkspaceId(project) {
  return (
    project?.data?.studioWorkspaceId ||
    project?.data?.workspaceId ||
    null
  );
}

export function bindProjectToWorkspace(project, workspaceId) {
  if (!project || !workspaceId) return project;
  if (getStudioWorkspaceId(project) === workspaceId) return project;
  return {
    ...project,
    data: {
      ...(project.data || {}),
      studioWorkspaceId: workspaceId,
    },
  };
}

/** Options stamped onto every Studio Task Manager job for multi-workspace heal. */
export function studioTaskScopeOptions(project) {
  const workspaceId = getStudioWorkspaceId(project);
  const out = {};
  if (workspaceId) out.studio_workspace_id = workspaceId;
  if (project?.id) out.studio_project_id = project.id;
  return out;
}

function taskStudioWorkspaceId(task) {
  return (
    task?.options?.studio_workspace_id ||
    task?.studio_workspace_id ||
    task?.result?.studio_workspace_id ||
    null
  );
}

/**
 * Pick a completed task that belongs to this workspace chain.
 * Priority: exact node jobId → workspace-tagged + object_name →
 * untagged Task Manager job with matching object_name (not owned by another workspace).
 */
/**
 * Whether a completed Task Manager auto-rig job matches the Studio body rig mode.
 * Body+Cloth expects UniRig `template_wrap` — never bind SkinTokens / full auto_rig.
 * @param {object} [task]
 * @param {string} [expectedRigMode]
 */
export function taskMatchesExpectedBodyRig(task, expectedRigMode) {
  if (!task || !expectedRigMode) return true;
  const mode = String(
    task?.options?.rig_mode ||
      task?.result?.rig_mode ||
      task?.result?.generation_info?.rig_mode ||
      '',
  ).trim();
  const feature = String(task?.result?.feature || task?.feature || '').trim();
  const model = String(
    task?.options?.model_preference ||
      task?.result?.generation_info?.model ||
      task?.result?.model_preference ||
      '',
  ).trim();

  if (
    expectedRigMode === AUTO_RIG_MODES.TEMPLATE_WRAP ||
    expectedRigMode === AUTO_RIG_MODES.TEMPLATE
  ) {
    if (mode === expectedRigMode) return true;
    if (feature === expectedRigMode) return true;
    // Older UniRig wrap jobs may only stamp feature/model.
    if (
      expectedRigMode === AUTO_RIG_MODES.TEMPLATE_WRAP &&
      (feature === 'template_wrap' || mode === AUTO_RIG_MODES.TEMPLATE_WRAP)
    ) {
      return true;
    }
    if (
      expectedRigMode === AUTO_RIG_MODES.TEMPLATE &&
      (feature === 'template' || mode === AUTO_RIG_MODES.TEMPLATE)
    ) {
      return true;
    }
    if (model === TEMPLATE_RIG_MODEL_ID && (mode === expectedRigMode || feature === expectedRigMode)) {
      return true;
    }
    return false;
  }

  if (expectedRigMode === AUTO_RIG_MODES.APPEARANCE_COMPONENT) {
    return (
      mode === AUTO_RIG_MODES.APPEARANCE_COMPONENT ||
      feature === AUTO_RIG_MODES.APPEARANCE_COMPONENT ||
      model === 'appearance_component_auto_rig'
    );
  }

  // skeleton / skin / full — reject template / appearance-only jobs
  if (
    mode === AUTO_RIG_MODES.TEMPLATE_WRAP ||
    mode === AUTO_RIG_MODES.TEMPLATE ||
    mode === AUTO_RIG_MODES.APPEARANCE_COMPONENT ||
    feature === 'template_wrap' ||
    feature === 'template' ||
    feature === AUTO_RIG_MODES.APPEARANCE_COMPONENT
  ) {
    return false;
  }
  return true;
}

export function pickWorkspaceScopedTask(
  tasks,
  {
    types = [],
    features = [],
    jobId = null,
    workspaceId = null,
    objectName = '',
    expectedRigMode = null,
  } = {},
) {
  const modeFilter = (t) => taskMatchesExpectedBodyRig(t, expectedRigMode);
  if (jobId) {
    const hit = pickCompletedTask(tasks, { types, features, jobId });
    return hit && modeFilter(hit) ? hit : null;
  }
  const list = tasks || [];
  if (workspaceId) {
    const scoped = list.filter((t) => taskStudioWorkspaceId(t) === workspaceId);
    const byName = pickTaskByObjectName(scoped, {
      types,
      features,
      objectName,
      expectedRigMode,
    });
    if (byName) return byName;
  }
  // Task Manager / legacy Studio jobs often lack studio_workspace_id.
  const compatible = list.filter((t) => {
    const tw = taskStudioWorkspaceId(t);
    return !tw || (workspaceId && tw === workspaceId);
  });
  return pickTaskByObjectName(compatible, {
    types,
    features,
    objectName,
    expectedRigMode,
  });
}

function pickTaskByObjectName(
  tasks,
  { types = [], features = [], objectName = '', expectedRigMode = null } = {},
) {
  const want = String(objectName || '').trim();
  if (!want) return null;
  const typeSet = new Set(types);
  const featureSet = new Set(features);
  const matches = sortTasksNewestFirst(
    tasks.filter((t) => {
      if (!taskTerminalSuccess(t)) return false;
      const typeOk = typeSet.has(t.type);
      const featureOk = featureSet.has(t.result?.feature) || featureSet.has(t.feature);
      if (!typeOk && !featureOk) return false;
      if (!taskMatchesExpectedBodyRig(t, expectedRigMode)) return false;
      return studioObjectNamesMatch(taskObjectName(t), want);
    }),
  );
  return matches[0] || null;
}

function meshUrlFromTask(task) {
  if (!task) return null;
  const result = task.result || task;
  return (
    result.mesh_url ||
    result.modelUrl ||
    result.downloadUrl ||
    result.model_url ||
    (taskJobId(task) ? `/api/v1/system/jobs/${taskJobId(task)}/download` : null)
  );
}

export function jobIdFromArtifactUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/jobs\/([^/?#]+)/i);
  return match ? match[1] : null;
}

function findTaskByJobId(tasks, jobId) {
  if (!jobId || !Array.isArray(tasks)) return null;
  return tasks.find((t) => taskJobId(t) === jobId) || null;
}

function isoFromUnknown(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Prefer existing node stamps, then Task Manager job clocks. */
function timingFieldsFromTask(task, existing = {}) {
  const prev = existing && typeof existing === 'object' ? existing : {};
  const started =
    isoFromUnknown(prev.startedAt) ||
    isoFromUnknown(task?.startedAt) ||
    isoFromUnknown(task?.started_at) ||
    isoFromUnknown(task?.createdAt) ||
    isoFromUnknown(task?.created_at);
  const completed =
    isoFromUnknown(prev.completedAt) ||
    isoFromUnknown(task?.completedAt) ||
    isoFromUnknown(task?.completed_at);
  const out = {};
  if (started) out.startedAt = started;
  if (completed) out.completedAt = completed;
  return out;
}

function fillStudioTimestampsFromTasks(project, tasks = []) {
  if (!project?.nodes || !Array.isArray(tasks) || !tasks.length) return project;
  let next = project;
  for (const node of next.nodes) {
    const jobId =
      node.data?.jobId ||
      jobIdFromArtifactUrl(node.data?.imageUrl || node.data?.meshUrl);
    if (!jobId) continue;
    const task = findTaskByJobId(tasks, jobId);
    if (!task) continue;
    const fields = timingFieldsFromTask(task, {});
    if (!fields.startedAt && !fields.completedAt) continue;
    next = updateNode(next, node.id, {
      data: {
        ...(fields.startedAt ? { startedAt: fields.startedAt } : {}),
        ...(fields.completedAt ? { completedAt: fields.completedAt } : {}),
      },
    });
  }
  const clothing = next.nodes.find((n) => n.kind === 'appearance_clothing');
  if (clothing && Array.isArray(clothing.data?.results)) {
    let changed = false;
    const results = clothing.data.results.map((entry) => {
      const task = findTaskByJobId(tasks, entry?.jobId);
      if (!task) return entry;
      const fields = timingFieldsFromTask(task, {});
      if (!fields.startedAt && !fields.completedAt) return entry;
      changed = true;
      return {
        ...entry,
        ...(fields.startedAt ? { startedAt: fields.startedAt } : {}),
        ...(fields.completedAt ? { completedAt: fields.completedAt } : {}),
      };
    });
    if (changed) {
      next = updateNode(next, clothing.id, { data: { results } });
    }
  }
  return next;
}

function expectedObjectNameSet(project, node) {
  const names = new Set();
  for (const raw of [node?.data?.objectName, project?.name]) {
    const value = String(raw || '').trim();
    if (!value) continue;
    names.add(value.toLowerCase());
    const slug = slugifyObjectName(value, '');
    if (slug) names.add(String(slug).toLowerCase());
  }
  return names;
}

function taskConflictsWithExpectedNames(task, expectedNames) {
  if (!task || !expectedNames?.size) return false;
  const name = taskObjectName(task);
  if (!name) return false;
  for (const expected of expectedNames) {
    if (studioObjectNamesMatch(name, expected)) return false;
  }
  return true;
}

function taskConflictsWithWorkspace(task, workspaceId) {
  if (!task || !workspaceId) return false;
  const taskWs = taskStudioWorkspaceId(task);
  // Untagged legacy jobs are allowed only when rebound via explicit jobId.
  if (!taskWs) return false;
  return taskWs !== workspaceId;
}

function clearNodeMeshArtifacts(project, nodeId, message) {
  return updateNode(project, nodeId, {
    status: 'idle',
    data: {
      meshUrl: null,
      jobId: null,
      taskId: null,
      inputMeshUrl: null,
      inputMeshJobId: null,
      statusMessage: message || 'Cleared mismatched artifact — re-run this stage',
    },
  });
}

function clearNodeImageArtifacts(project, nodeId, message) {
  return updateNode(project, nodeId, {
    status: 'idle',
    data: {
      imageUrl: null,
      jobId: null,
      taskId: null,
      views: null,
      statusMessage: message || 'Cleared mismatched image — Generate image again',
    },
  });
}

/**
 * Produced stage cards persist until the user re-runs that stage or hits Reset.
 * Reload / Task Manager heal must not drop imageUrl/meshUrl/results.
 * Empty nodes still hydrate from this workspace's matching jobs.
 * @param {object} project
 * @param {object[]} [_tasks]
 */
export function reconcileStudioChainArtifacts(project, _tasks = []) {
  return project;
}

/**
 * If Text→Image never got marked completed but Task Manager has a finished
 * Krea job, hydrate the studio node (image URL + completed).
 * Rebinds only via node jobId or this workspace's tagged jobs.
 * @param {object} project
 * @param {object[]} [tasks]
 * @param {(task: object) => string|null} [resolveImageUrl]
 */
export function hydrateStudioImageFromTasks(project, tasks = [], resolveImageUrl) {
  if (!project?.nodes || !Array.isArray(tasks) || !tasks.length) return project;
  const imageNode = project.nodes.find((n) => n.kind === 'text_to_image');
  if (!imageNode) return project;
  if (imageNode.status === 'completed' && imageNode.data?.imageUrl) return project;

  const workspaceId = getStudioWorkspaceId(project);
  const best = pickWorkspaceScopedTask(tasks, {
    types: ['text-to-image'],
    features: ['text_to_image'],
    jobId: imageNode.data?.jobId || null,
    workspaceId,
    objectName: imageNode.data?.objectName || project.name || '',
  });
  if (!best) return project;
  if (taskConflictsWithWorkspace(best, workspaceId)) return project;

  const imageUrl =
    (typeof resolveImageUrl === 'function' ? resolveImageUrl(best) : null) ||
    best?.result?.mesh_url ||
    best?.result?.downloadUrl ||
    best?.result?.modelUrl ||
    (taskJobId(best) ? `/api/v1/system/jobs/${taskJobId(best)}/download` : null);
  if (!imageUrl) return project;

  const jobId = taskJobId(best) || imageNode.data?.jobId || null;
  return updateNode(project, imageNode.id, {
    status: 'completed',
    data: {
      imageUrl,
      jobId,
      taskId: best.id || imageNode.data?.taskId || null,
      views: [{ viewId: 'front', imageUrl, jobId }],
      statusMessage: null,
      ...timingFieldsFromTask(best, imageNode.data),
    },
  });
}

/**
 * Build the Task Manager object_name used for a clothing accessory fan-out job.
 * @param {object} project
 * @param {{ object_name?: string, label?: string }} acc
 * @param {number} [index]
 */
export function studioClothingObjectName(project, acc, index = 0) {
  return slugifyObjectName(
    `${project?.name || 'studio'}_${acc?.object_name || acc?.label || `garment_${index}`}`,
    `garment_${index}`,
  );
}

function taskAppearanceSlot(task) {
  return String(
    task?.options?.appearance_slot ||
      task?.result?.generation_info?.appearance_slot ||
      task?.result?.rig_info?.appearance_slot ||
      task?.result?.rig_info?.equip_slot ||
      task?.result?.appearance_slot ||
      '',
  ).trim();
}

function taskBelongsToProjectSlug(taskName, projectSlug) {
  const tn = String(slugifyObjectName(String(taskName || '').trim(), '') || '').toLowerCase();
  const ps = String(slugifyObjectName(String(projectSlug || '').trim(), '') || '').toLowerCase();
  if (!tn || !ps) return false;
  return tn === ps || tn.startsWith(`${ps}_`);
}

function clothingResultHasTrait(entry) {
  return Boolean(entry?.traitUrl || entry?.meshUrl);
}

function findClothingResultForAccessory(results, acc, objectName) {
  if (!Array.isArray(results)) return null;
  return (
    results.find(
      (r) =>
        (objectName && r?.objectName === objectName) ||
        (r?.label === acc.label && r?.appearance_slot === acc.appearance_slot),
    ) || null
  );
}

function upsertClothingHydrateResult(results, entry) {
  const next = Array.isArray(results) ? [...results] : [];
  const idx = next.findIndex(
    (r) =>
      (entry.objectName && r?.objectName === entry.objectName) ||
      (r?.label === entry.label && r?.appearance_slot === entry.appearance_slot),
  );
  if (idx >= 0) {
    next[idx] = { ...next[idx], ...entry };
  } else {
    next.push(entry);
  }
  return next;
}

function normalizeAppearanceSlotSafe(slot) {
  const s = String(slot || '').trim();
  if (!s) return null;
  const known = ['Chest', 'Legs', 'Shoes', 'Waist', 'Neck', 'Hands', 'Head', 'Hip'];
  const hit = known.find((k) => k.toLowerCase() === s.toLowerCase());
  return hit || s;
}

/**
 * Pick newest completed appearance_component job for a project+slot
 * (MeshMonk_* garments after Studio lost mid-fan-out state).
 */
function pickAppearanceTaskForProjectSlot(
  tasks,
  { workspaceId = null, projectSlug = '', slot = '', objectName = '' } = {},
) {
  const wantSlot = String(slot || '').trim().toLowerCase();
  const list = Array.isArray(tasks) ? tasks : [];
  const compatible = list.filter((t) => {
    if (!taskTerminalSuccess(t)) return false;
    if (!taskMatchesExpectedBodyRig(t, AUTO_RIG_MODES.APPEARANCE_COMPONENT)) return false;
    const tw = taskStudioWorkspaceId(t);
    if (workspaceId && tw && tw !== workspaceId) return false;
    const name = taskObjectName(t);
    if (objectName && studioObjectNamesMatch(name, objectName)) return true;
    if (!projectSlug || !taskBelongsToProjectSlug(name, projectSlug)) return false;
    if (!wantSlot) return true;
    return String(taskAppearanceSlot(t) || '').toLowerCase() === wantSlot;
  });
  return sortTasksNewestFirst(compatible)[0] || null;
}

function imageUrlFromTask(task, resolveImageUrl) {
  if (!task) return null;
  if (typeof resolveImageUrl === 'function') {
    const resolved = resolveImageUrl(task);
    if (resolved) return resolved;
  }
  const result = task.result || task;
  return (
    result.image_url ||
    result.imageUrl ||
    result.download_url ||
    result.mesh_url ||
    (taskJobId(task) ? `/api/v1/system/jobs/${taskJobId(task)}/download` : null)
  );
}

/**
 * Reattach completed appearance_component (and optional Krea/TRELLIS) tasks onto
 * the clothing node — recovers MeshMonk / Body+Cloth workspaces after refresh
 * or a mid-fan-out stall (heal previously only rebound image/mesh/wrap).
 *
 * @param {object} project
 * @param {object[]} [tasks]
 * @param {{ resolveImageUrl?: Function }} [opts]
 */
export function hydrateStudioClothingFromTasks(project, tasks = [], opts = {}) {
  if (!project?.nodes) return project;
  const clothingNode = project.nodes.find((n) => n.kind === 'appearance_clothing');
  if (!clothingNode) return project;

  const accessories = Array.isArray(clothingNode.data?.accessories)
    ? clothingNode.data.accessories
    : [];
  if (!accessories.length) return project;

  const list = Array.isArray(tasks) ? tasks : [];
  if (!list.length) return project;

  const workspaceId = getStudioWorkspaceId(project);
  const projectSlug = slugifyObjectName(project.name || '', '');
  let results = Array.isArray(clothingNode.data?.results)
    ? [...clothingNode.data.results]
    : [];
  let changed = false;

  accessories.forEach((acc, index) => {
    if (!acc) return;
    const objectName = studioClothingObjectName(project, acc, index);
    const existing = findClothingResultForAccessory(results, acc, objectName);
    if (clothingResultHasTrait(existing)) return;

    let rigTask = pickWorkspaceScopedTask(list, {
      types: ['auto-rigging'],
      features: ['auto_rig', 'auto_rigging', 'appearance_component'],
      jobId: existing?.jobId || null,
      workspaceId,
      objectName,
      expectedRigMode: AUTO_RIG_MODES.APPEARANCE_COMPONENT,
    });

    if (!rigTask) {
      rigTask = pickAppearanceTaskForProjectSlot(list, {
        workspaceId,
        projectSlug,
        slot: acc.appearance_slot,
        objectName,
      });
    }

    if (!rigTask) return;

    const traitUrl = meshUrlFromTask(rigTask);
    if (!traitUrl) return;

    const resolvedObjectName = taskObjectName(rigTask) || objectName;
    const slot =
      normalizeAppearanceSlotSafe(taskAppearanceSlot(rigTask)) ||
      acc.appearance_slot ||
      'Chest';

    let imageUrl = existing?.imageUrl || null;
    let imageJobId = existing?.imageJobId || null;
    if (!imageUrl) {
      const imgTask =
        pickWorkspaceScopedTask(list, {
          types: ['text-to-image'],
          features: ['text_to_image', 'image_generation'],
          workspaceId,
          objectName: `${resolvedObjectName}_img`,
        }) ||
        pickWorkspaceScopedTask(list, {
          types: ['text-to-image'],
          features: ['text_to_image', 'image_generation'],
          workspaceId,
          objectName: `${objectName}_img`,
        });
      if (imgTask) {
        imageUrl = imageUrlFromTask(imgTask, opts.resolveImageUrl);
        imageJobId = taskJobId(imgTask) || imageJobId;
      }
    }

    let meshUrl = existing?.meshUrl || null;
    let meshJobId = existing?.meshJobId || null;
    if (!meshUrl) {
      const meshTask = pickWorkspaceScopedTask(list, {
        types: ['image-to-3d'],
        features: ['image_to_3d', 'image_to_textured_mesh'],
        workspaceId,
        objectName: resolvedObjectName,
      });
      if (meshTask) {
        meshUrl = meshUrlFromTask(meshTask);
        meshJobId = taskJobId(meshTask) || meshJobId;
      }
    }

    results = upsertClothingHydrateResult(results, {
      label: acc.label,
      appearance_slot: slot,
      objectName: resolvedObjectName,
      imageUrl,
      imageJobId,
      meshUrl,
      meshJobId,
      traitUrl,
      jobId: taskJobId(rigTask),
      equipped: Boolean(existing?.equipped),
      equipSlot: existing?.equipSlot || slot,
      statusMessage: null,
      hydratedFromTasks: true,
      ...timingFieldsFromTask(rigTask, existing),
    });
    changed = true;
  });

  if (!changed) return project;

  const done = results.filter((r) => clothingResultHasTrait(r)).length;
  const total = accessories.length;
  const status = done >= total && total > 0 ? 'completed' : 'ready';

  let next = updateNode(project, clothingNode.id, {
    status,
    data: {
      accessories,
      results,
      statusMessage:
        done >= total
          ? null
          : `Recovered ${done}/${total} garments from Task Manager`,
    },
  });

  const exportNode = next.nodes.find((n) => n.kind === 'export_asset');
  const bodyRig = next.nodes.find((n) => n.kind === 'auto_rigging');
  if (exportNode && results.length) {
    next = updateNode(next, exportNode.id, {
      data: {
        clothingResults: results,
        meshUrl: exportNode.data?.meshUrl || bodyRig?.data?.meshUrl || null,
      },
    });
  }
  return next;
}

/**
 * Hydrate empty image / mesh / rig / clothing nodes from Task Manager.
 * Never replaces a node that already has produced artifacts.
 * @param {object} project
 * @param {object[]} [tasks]
 * @param {{ resolveImageUrl?: (task: object) => string|null }} [opts]
 */
export function hydrateStudioProjectFromTasks(project, tasks = [], opts = {}) {
  if (!project?.nodes) return project;
  const list = Array.isArray(tasks) ? tasks : [];
  const workspaceId = getStudioWorkspaceId(project);
  let next = reconcileStudioChainArtifacts(project, list);
  if (!list.length) return next;

  const resolveImageUrl = opts.resolveImageUrl;
  next = hydrateStudioImageFromTasks(next, list, resolveImageUrl);

  const meshNode = next.nodes.find((n) => n.kind === 'image_to_3d');
  if (meshNode) {
    if (meshNode.data?.meshUrl && meshNode.status !== 'completed') {
      next = updateNode(next, meshNode.id, { status: 'completed', data: { statusMessage: null } });
    } else if (!(meshNode.status === 'completed' && meshNode.data?.meshUrl)) {
      const objectNameHint = meshNode.data?.objectName || next.name || '';
      const meshTask = pickWorkspaceScopedTask(list, {
        types: ['image-to-3d'],
        features: ['image_to_3d', 'image_to_textured_mesh'],
        jobId: meshNode.data?.jobId || null,
        workspaceId,
        objectName: objectNameHint,
      });
      const expected = expectedObjectNameSet(next, meshNode);
      const meshUrl =
        meshTask &&
        !taskConflictsWithWorkspace(meshTask, workspaceId) &&
        !taskConflictsWithExpectedNames(meshTask, expected)
          ? meshUrlFromTask(meshTask)
          : null;
      if (meshUrl) {
        next = updateNode(next, meshNode.id, {
          status: 'completed',
          data: {
            meshUrl,
            jobId: taskJobId(meshTask) || null,
            taskId: meshTask.id || null,
            statusMessage: null,
            ...timingFieldsFromTask(meshTask, meshNode.data),
          },
        });
        const exportNode = next.nodes.find((n) => n.kind === 'export_asset');
        if (exportNode && !exportNode.data?.meshUrl) {
          next = updateNode(next, exportNode.id, { data: { meshUrl } });
        }
      }
    }
  }

  const refreshedMesh = next.nodes.find((n) => n.kind === 'image_to_3d');
  const rigNode = next.nodes.find((n) => n.kind === 'auto_rigging');
  const template = getStudioTemplate(next.templateId);
  const expectedBodyRigMode =
    template?.bodyRigMode || rigNode?.data?.rigMode || AUTO_RIG_MODES.FULL;
  if (rigNode) {
    const rigAfterClear = next.nodes.find((n) => n.kind === 'auto_rigging');
    if (rigAfterClear?.data?.meshUrl && rigAfterClear.status !== 'completed') {
      next = updateNode(next, rigAfterClear.id, {
        status: 'completed',
        data: { statusMessage: null },
      });
    } else if (
      !(rigAfterClear?.status === 'completed' && rigAfterClear?.data?.meshUrl)
    ) {
      const objectNameHint =
        rigAfterClear?.data?.objectName ||
        refreshedMesh?.data?.objectName ||
        next.name ||
        '';
      const expected = expectedObjectNameSet(next, {
        ...rigAfterClear,
        data: { ...rigAfterClear?.data, objectName: objectNameHint },
      });
      const meshTask = findTaskByJobId(
        list,
        refreshedMesh?.data?.jobId || jobIdFromArtifactUrl(refreshedMesh?.data?.meshUrl),
      );
      const wrapFeatures =
        expectedBodyRigMode === AUTO_RIG_MODES.TEMPLATE_WRAP ||
        expectedBodyRigMode === AUTO_RIG_MODES.TEMPLATE
          ? ['template_wrap', 'template']
          : ['auto_rigging', 'auto_rig', 'template_wrap'];
      const rigTask = pickWorkspaceScopedTask(list, {
        types: ['auto-rigging'],
        features: wrapFeatures,
        jobId: rigAfterClear?.data?.jobId || null,
        workspaceId,
        objectName: objectNameHint,
        expectedRigMode: expectedBodyRigMode,
      });
      const lineageOk =
        !meshTask ||
        !rigTask ||
        !taskObjectName(meshTask) ||
        !taskObjectName(rigTask) ||
        studioObjectNamesMatch(taskObjectName(meshTask), taskObjectName(rigTask));
      const inputOk =
        !rigTask ||
        !refreshedMesh?.data?.jobId ||
        !rigTask.options?.studio_input_mesh_job_id ||
        rigTask.options.studio_input_mesh_job_id === refreshedMesh.data.jobId;
      const rigUrl =
        rigTask &&
        !taskConflictsWithWorkspace(rigTask, workspaceId) &&
        !taskConflictsWithExpectedNames(rigTask, expected) &&
        lineageOk &&
        inputOk
          ? meshUrlFromTask(rigTask)
          : null;
      if (rigUrl) {
        const inputMeshUrl = refreshedMesh?.data?.meshUrl || null;
        const rigModel =
          rigTask?.options?.model_preference ||
          rigTask?.result?.generation_info?.model ||
          rigTask?.result?.model_preference ||
          template?.bodyRigModel ||
          null;
        next = updateNode(next, rigAfterClear.id, {
          status: 'completed',
          data: {
            meshUrl: rigUrl,
            jobId: taskJobId(rigTask) || null,
            taskId: rigTask.id || null,
            inputMeshUrl,
            inputMeshJobId:
              refreshedMesh?.data?.jobId || jobIdFromArtifactUrl(inputMeshUrl),
            rigMode: expectedBodyRigMode,
            ...(rigModel ? { modelPreference: rigModel } : {}),
            statusMessage: null,
            ...timingFieldsFromTask(rigTask, rigAfterClear?.data),
          },
        });
        next = reconcileStudioChainArtifacts(next, list);
        const exportNode = next.nodes.find((n) => n.kind === 'export_asset');
        const rigAfter = next.nodes.find((n) => n.kind === 'auto_rigging');
        if (exportNode && rigAfter?.status === 'completed' && rigAfter?.data?.meshUrl) {
          next = updateNode(next, exportNode.id, {
            status: 'completed',
            data: { meshUrl: rigAfter.data.meshUrl },
          });
        }
      }
    }
  }

  next = hydrateStudioClothingFromTasks(next, list, opts);
  next = fillStudioTimestampsFromTasks(next, list);
  return next;
}

/**
 * Full chain heal for one workspace: recover interrupted nodes, then fill
 * empty stages from this workspace's matching jobs. Produced cards stay.
 * @param {object} project
 * @param {object[]} [tasks]
 * @param {{ resolveImageUrl?: Function, workspaceId?: string }} [opts]
 */
export function healStudioWorkspaceChain(project, tasks = [], opts = {}) {
  if (!project?.nodes) return project;
  let next = project;
  if (opts.workspaceId) {
    next = bindProjectToWorkspace(next, opts.workspaceId);
  }
  next = recoverInterruptedStudioNodes(next);
  next = hydrateStudioProjectFromTasks(next, tasks, {
    resolveImageUrl: opts.resolveImageUrl,
  });
  next = recoverInterruptedStudioNodes(next);
  return next;
}

/**
 * Whether a studio node has downloadable artifacts worth previewing (even if
 * status is failed/ready after heal or a partial clothing fan-out).
 * @param {object} [node]
 */
export function nodeHasStudioArtifact(node) {
  if (!node) return false;
  if (node.kind === 'text_to_image' || node.kind === 'image_edit') {
    return (
      Boolean(node.data?.imageUrl) ||
      (Array.isArray(node.data?.views) && node.data.views.some((v) => v?.imageUrl))
    );
  }
  if (node.kind === 'image_to_3d' || node.kind === 'auto_rigging' || node.kind === 'export_asset') {
    return Boolean(node.data?.meshUrl);
  }
  if (node.kind === 'appearance_clothing') {
    const results = node.data?.results;
    return (
      Array.isArray(results) &&
      results.some((r) => r?.traitUrl || r?.meshUrl || r?.imageUrl)
    );
  }
  return false;
}

/**
 * @param {object} [node] appearance_clothing node
 * @returns {{ done: number, total: number, results: object[] }}
 */
export function getClothingProgress(node) {
  const results = Array.isArray(node?.data?.results) ? node.data.results : [];
  const total = Array.isArray(node?.data?.accessories)
    ? node.data.accessories.length
    : results.length;
  const done = results.filter((r) => r?.traitUrl || r?.meshUrl).length;
  return { done, total, results };
}

/**
 * Status label for graph/kanban when artifacts exist but node.status is stale.
 * @param {object} [node]
 */
export function getStudioNodeDisplayStatus(node) {
  if (!node) return 'idle';
  if (node.status === 'running') return 'running';
  if (node.status === 'completed') return 'completed';
  if (node.kind === 'appearance_clothing') {
    const { done, total } = getClothingProgress(node);
    if (done > 0 && total > 0 && done < total) return 'partial';
    if (done > 0 && done >= total) return 'completed';
  }
  if (nodeHasStudioArtifact(node)) return 'completed';
  if (node.status === 'failed') return 'failed';
  return node.status || 'idle';
}

/**
 * Whether a node counts as finished for edge solid/pending styling.
 */
export function isStudioNodeSatisfied(node) {
  if (!node) return false;
  if (node.status === 'completed') return true;
  if (node.kind === 'text_prompt') {
    return Boolean(node.data?.prompt?.trim()) || node.status === 'ready';
  }
  if (node.kind === 'export_asset') {
    return Boolean(node.data?.meshUrl);
  }
  if (node.kind === 'appearance_clothing') {
    const { done, total } = getClothingProgress(node);
    if (total > 0) return done >= total;
    return done > 0;
  }
  if (nodeHasStudioArtifact(node)) return true;
  return false;
}

/**
 * Completed path stays solid; incomplete workflow ahead is dashed + animated.
 * An edge is "done" when both ends are satisfied (prompt ready / stage completed / export has mesh).
 */
export function isStudioEdgePending(project, edge) {
  const source = project.nodes.find((n) => n.id === edge.source);
  const target = project.nodes.find((n) => n.id === edge.target);
  if (!source || !target) return true;
  return !(isStudioNodeSatisfied(source) && isStudioNodeSatisfied(target));
}

export function toReactFlowElements(project, { apiEndpoint, running, onRerunClothing } = {}) {
  const nodes = project.nodes.map((n) => ({
    id: n.id,
    type: 'studio',
    position: n.position || { x: 0, y: 0 },
    style:
      n.kind === 'appearance_clothing'
        ? (() => {
            const resultCount = Array.isArray(n.data?.results) ? n.data.results.length : 0;
            const accessoryCount = Array.isArray(n.data?.accessories)
              ? n.data.accessories.length
              : 0;
            const garmentCount = Math.max(resultCount, accessoryCount, 1);
            const cols = Math.min(5, garmentCount);
            // Fit up to five cards across (compact column width ~152px + gap).
            return { width: Math.min(980, 36 + cols * 168) };
          })()
        : n.kind === 'auto_rigging' || n.kind === 'image_to_3d'
          ? { width: 260 }
          : n.kind === 'text_to_image'
            ? { width: 248 }
            : undefined,
    data: {
      kind: n.kind,
      label: n.label,
      stage: n.stage,
      status: n.status,
      displayStatus: getStudioNodeDisplayStatus(n),
      payload: n.data,
      apiEndpoint: apiEndpoint || '',
      statusMessage: n.data?.statusMessage || '',
      timingLine: formatStudioNodeTiming(n),
      clothingProgress:
        n.kind === 'appearance_clothing' ? getClothingProgress(n) : null,
      running: Boolean(running),
      onRerunClothing:
        n.kind === 'appearance_clothing' && typeof onRerunClothing === 'function'
          ? onRerunClothing
          : undefined,
      clothingAccessories:
        n.kind === 'appearance_clothing' ? n.data?.accessories || [] : undefined,
    },
  }));
  const edges = project.edges.map((e) => {
    const pending = isStudioEdgePending(project, e);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      animated: pending,
      className: pending ? 'studio-edge-pending' : 'studio-edge-done',
      style: pending
        ? {
            stroke: '#3d8bfd',
            strokeWidth: 2.25,
            strokeDasharray: '6 4',
          }
        : {
            stroke: '#5a6a82',
            strokeWidth: 2,
            strokeDasharray: 'none',
          },
    };
  });
  return { nodes, edges };
}

/** Ensure older localStorage projects map to the selectable template catalog. */
export function migrateStudioProject(project) {
  if (!project?.nodes) return project;
  let next = recoverInterruptedStudioNodes({ ...project });

  if (!next.templateId || next.templateId === 'krea_trellis') {
    const imageNode = next.nodes.find((n) => n.kind === 'text_to_image');
    const looksMultiview = Boolean(imageNode?.data?.promptOptions?.all_orthographic_views);
    next = {
      ...next,
      templateId: looksMultiview ? 'krea_trellis_multiview' : 'krea_trellis2',
    };
  }

  const template = getStudioTemplate(next.templateId);
  const imageNode = next.nodes.find((n) => n.kind === 'text_to_image');
  if (imageNode && !imageNode.data?.promptOptions) {
    next = updateNode(next, imageNode.id, {
      data: {
        promptOptions: { ...template.promptOptions },
        modelPreference: imageNode.data?.modelPreference || template.imageModel,
      },
    });
  } else if (
    next.templateId === 'krea_composable_avatar_body' &&
    imageNode &&
    !imageNode.data?.promptOptions?.headless_body
  ) {
    next = updateNode(next, imageNode.id, {
      data: {
        promptOptions: normalizeTextToImagePromptOptions({
          ...STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS,
          ...(imageNode.data?.promptOptions || {}),
        }),
      },
    });
  }

  const meshNode = next.nodes.find((n) => n.kind === 'image_to_3d');
  if (meshNode && !meshNode.data?.modelPreference) {
    next = updateNode(next, meshNode.id, {
      data: { modelPreference: template.meshModel },
    });
  }

  // Keep body auto-rig node aligned with the selected Studio template
  // (Body+Cloth must stay on UniRig template_wrap, not SkinTokens full).
  const existingRig = next.nodes.find((n) => n.kind === 'auto_rigging');
  if (existingRig && template.bodyRigMode) {
    const needsSync =
      existingRig.data?.rigMode !== template.bodyRigMode ||
      existingRig.data?.modelPreference !== template.bodyRigModel;
    if (needsSync) {
      next = updateNode(next, existingRig.id, {
        label:
          template.bodyRigMode === AUTO_RIG_MODES.TEMPLATE_WRAP
            ? 'Auto Rigging (template wrap)'
            : STUDIO_NODE_KINDS.auto_rigging.label,
        data: {
          rigMode: template.bodyRigMode,
          modelPreference: template.bodyRigModel,
          humanoidTemplateId:
            template.bodyRigMode === AUTO_RIG_MODES.TEMPLATE ||
            template.bodyRigMode === AUTO_RIG_MODES.TEMPLATE_WRAP
              ? existingRig.data?.humanoidTemplateId || DEFAULT_HUMANOID_TEMPLATE_ID
              : undefined,
        },
      });
    }
  }

  // Older projects: insert Auto Rigging between mesh and export.
  if (!next.nodes.some((n) => n.kind === 'auto_rigging')) {
    const exportNode = next.nodes.find((n) => n.kind === 'export_asset');
    const mesh = next.nodes.find((n) => n.kind === 'image_to_3d');
    if (mesh && exportNode) {
      const rigNode = {
        id: newId('n'),
        kind: 'auto_rigging',
        label: STUDIO_NODE_KINDS.auto_rigging.label,
        stage: 'rig',
        status: 'idle',
        data: {
          modelPreference: STUDIO_NODE_KINDS.auto_rigging.defaultModel,
          rigMode: 'full',
          taskId: null,
          meshUrl: null,
          objectName: next.name || mesh.data?.objectName || 'studio_asset',
        },
        position: getStudioGraphNodePosition('auto_rigging', {
          includeImageEdit: Boolean(getStudioTemplate(next.templateId)?.includeImageEdit),
          includeClothing: next.nodes.some((n) => n.kind === 'appearance_clothing'),
        }),
      };
      next = {
        ...next,
        nodes: [
          ...next.nodes.filter((n) => n.id !== exportNode.id),
          rigNode,
          exportNode,
        ],
        edges: [
          ...next.edges.filter(
            (e) => !(e.source === mesh.id && e.target === exportNode.id),
          ),
          { id: newId('e'), source: mesh.id, target: rigNode.id },
          { id: newId('e'), source: rigNode.id, target: exportNode.id },
        ],
      };
    }
  }

  return healStudioGraphLayout(next);
}
export function groupNodesByStage(project) {
  const groups = STUDIO_STAGES.map((stage) => ({
    ...stage,
    nodes: project.nodes.filter((n) => n.stage === stage.id),
  }));
  return groups;
}

/** Linear run order for the locked template (topological by edges). */
export function getRunnablePipelineOrder(project) {
  const kindOrder = [
    'text_to_image',
    'image_edit',
    'image_to_3d',
    'auto_rigging',
    'appearance_clothing',
  ];
  return kindOrder
    .map((kind) => project.nodes.find((n) => n.kind === kind))
    .filter(Boolean);
}

const STORAGE_KEY = 'opennexus.studio.project.v1';
const WORKSPACE_STORAGE_KEY = 'opennexus.studio.workspaces.v2';

export function saveProjectToStorage(project) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

export function loadProjectFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.nodes || !parsed?.edges) return null;
    return migrateStudioProject(parsed);
  } catch {
    return null;
  }
}

function newWorkspaceId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `ws_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `ws_${Date.now().toString(36)}`;
}

/**
 * @param {object} [project]
 * @param {{ name?: string }} [opts]
 */
export function createStudioWorkspace(project, opts = {}) {
  const id = newWorkspaceId();
  let proj = migrateStudioProject(
    project || createStudioProject(DEFAULT_STUDIO_TEMPLATE_ID),
  );
  proj = bindProjectToWorkspace(proj, id);
  return {
    id,
    name: opts.name || proj.name || 'Workspace',
    project: recoverInterruptedStudioNodes(proj),
    createdAt: new Date().toISOString(),
  };
}

/**
 * @returns {{ activeId: string, workspaces: object[] }}
 */
export function createDefaultWorkspaceStore() {
  const ws = createStudioWorkspace();
  return { activeId: ws.id, workspaces: [ws] };
}

/**
 * Load multi-workspace store; migrates legacy single-project key.
 * @returns {{ activeId: string, workspaces: object[] }}
 */
export function loadWorkspaceStore() {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.workspaces?.length && parsed.activeId) {
        return {
          activeId: parsed.activeId,
          workspaces: parsed.workspaces.map((w) => ({
            ...w,
            project: recoverInterruptedStudioNodes(
              migrateStudioProject(bindProjectToWorkspace(w.project, w.id)),
            ),
            name: w.name || w.project?.name || 'Workspace',
          })),
        };
      }
    }
  } catch {
    // fall through
  }

  const legacy = loadProjectFromStorage();
  if (legacy) {
    const ws = createStudioWorkspace(legacy, { name: legacy.name });
    const store = { activeId: ws.id, workspaces: [ws] };
    saveWorkspaceStore(store);
    return store;
  }
  return createDefaultWorkspaceStore();
}

/**
 * @param {{ activeId: string, workspaces: object[] }} store
 */
export function saveWorkspaceStore(store) {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(store));
    // Keep legacy key as the active project for older readers.
    const active = store.workspaces.find((w) => w.id === store.activeId);
    if (active?.project) saveProjectToStorage(active.project);
    return true;
  } catch {
    return false;
  }
}

export function getActiveWorkspace(store) {
  if (!store?.workspaces?.length) return null;
  return (
    store.workspaces.find((w) => w.id === store.activeId) || store.workspaces[0]
  );
}

/**
 * @param {{ activeId: string, workspaces: object[] }} store
 * @param {string} workspaceId
 * @param {object|((project: object) => object)} projectOrUpdater
 */
export function updateWorkspaceProject(store, workspaceId, projectOrUpdater) {
  const workspaces = store.workspaces.map((w) => {
    if (w.id !== workspaceId) return w;
    const nextProject =
      typeof projectOrUpdater === 'function'
        ? projectOrUpdater(w.project)
        : projectOrUpdater;
    const bound = bindProjectToWorkspace(nextProject, workspaceId);
    return {
      ...w,
      project: bound,
      name: bound?.name || w.name,
    };
  });
  return { ...store, workspaces };
}
