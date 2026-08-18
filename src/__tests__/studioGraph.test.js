import { describe, it, expect } from 'vitest';
import {
  createKreaTrellisTemplate,
  createKreaMageTrellisTemplate,
  createKreaTrellisMultiviewTemplate,
  createKreaComposableAvatarBodyTemplate,
  getPromptText,
  setPromptText,
  getEditPrompt,
  setEditPrompt,
  getClothingText,
  setClothingText,
  getTextToImagePromptOptions,
  setTextToImagePromptOptions,
  getUpstreamNode,
  getRunnablePipelineOrder,
  groupNodesByStage,
  toReactFlowElements,
  STUDIO_NODE_KINDS,
  updateNode,
  recoverInterruptedStudioNodes,
  hydrateStudioImageFromTasks,
  hydrateStudioClothingFromTasks,
  hydrateStudioProjectFromTasks,
  reconcileStudioChainArtifacts,
  healStudioWorkspaceChain,
  studioClothingObjectName,
  bindProjectToWorkspace,
  getStudioWorkspaceId,
  pickWorkspaceScopedTask,
  formatStudioNodeTiming,
  applyStudioTemplate,
  migrateStudioProject,
  healStudioGraphLayout,
  createStudioWorkspace,
  createDefaultWorkspaceStore,
  updateWorkspaceProject,
  getActiveWorkspace,
  isStudioEdgePending,
  getStudioNodeDisplayStatus,
  nodeHasStudioArtifact,
  getClothingProgress,
  isStudioNodeSatisfied,
  clearClothingGarmentResult,
  findClothingAccessoryIndex,
} from '../library/studioGraph.js';
import { AUTO_RIG_MODES, TEMPLATE_RIG_MODEL_ID } from '../library/avatarPipelineCatalog.js';

describe('studioGraph', () => {
  it('creates locked Krea → TRELLIS.2 template with five stages (incl. auto-rig)', () => {
    const project = createKreaTrellisTemplate({ prompt: 'a red cube' });
    expect(project.templateId).toBe('krea_trellis2');
    expect(project.nodes).toHaveLength(5);
    expect(project.edges).toHaveLength(4);
    expect(getPromptText(project)).toBe('a red cube');

    const kinds = project.nodes.map((n) => n.kind);
    expect(kinds).toEqual([
      'text_prompt',
      'text_to_image',
      'image_to_3d',
      'auto_rigging',
      'export_asset',
    ]);

    const t2i = project.nodes.find((n) => n.kind === 'text_to_image');
    expect(t2i.data.modelPreference).toBe(
      STUDIO_NODE_KINDS.text_to_image.defaultModel,
    );
    expect(t2i.data.promptOptions.all_orthographic_views).toBe(false);
    const i23 = project.nodes.find((n) => n.kind === 'image_to_3d');
    expect(i23.data.modelPreference).toBe(
      STUDIO_NODE_KINDS.image_to_3d.defaultModel,
    );
    const rig = project.nodes.find((n) => n.kind === 'auto_rigging');
    expect(rig.data.modelPreference).toBe('skintokens_auto_rig');
  });

  it('creates Mage Edit template with image_edit between Krea and TRELLIS.2', () => {
    let project = createKreaMageTrellisTemplate({
      prompt: 'knight',
      editPrompt: 'remove background',
    });
    expect(project.templateId).toBe('krea_mage_trellis2');
    expect(project.nodes.map((n) => n.kind)).toEqual([
      'text_prompt',
      'text_to_image',
      'image_edit',
      'image_to_3d',
      'auto_rigging',
      'export_asset',
    ]);
    expect(getEditPrompt(project)).toBe('remove background');
    project = setEditPrompt(project, 'T-pose');
    expect(getEditPrompt(project)).toBe('T-pose');
    const edit = project.nodes.find((n) => n.kind === 'image_edit');
    expect(edit.data.modelPreference).toBe('mage_flow_edit_turbo');
  });

  it('creates separate multiview template with TRELLIS v1 mesh model', () => {
    const project = createKreaTrellisMultiviewTemplate({ prompt: 'dragon knight' });
    expect(project.templateId).toBe('krea_trellis_multiview');
    const opts = getTextToImagePromptOptions(project);
    expect(opts.all_orthographic_views).toBe(true);
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    expect(mesh.data.modelPreference).toBe('trellis_image_to_textured_mesh');
  });

  it('creates composable body+clothing template with wrap rig and clothing node', () => {
    const project = createKreaComposableAvatarBodyTemplate({
      prompt: 'streetwear body',
      clothingText: 'red joggers, leather boots',
      headJobId: 'job123',
    });
    expect(project.templateId).toBe('krea_composable_avatar_body');
    expect(project.data.avatarSessionId).toBe('avatar_job123');
    expect(getClothingText(project)).toContain('red joggers');

    const pos = (kind) => project.nodes.find((n) => n.kind === kind)?.position;
    expect(pos('text_prompt')).toEqual({ x: 40, y: 48 });
    expect(pos('text_to_image')).toEqual({ x: 320, y: 196 });
    expect(pos('image_to_3d')).toEqual({ x: 600, y: 48 });
    expect(pos('auto_rigging')).toEqual({ x: 880, y: 48 });
    expect(pos('appearance_clothing')).toEqual({ x: 880, y: 312 });
    expect(pos('export_asset')).toEqual({ x: 1160, y: 48 });

    const kinds = project.nodes.map((n) => n.kind);
    expect(kinds).toEqual([
      'text_prompt',
      'text_to_image',
      'image_to_3d',
      'auto_rigging',
      'appearance_clothing',
      'export_asset',
    ]);

    const opts = getTextToImagePromptOptions(project);
    expect(opts.headless_body).toBe(true);
    expect(opts.t_pose).toBe(true);

    const rig = project.nodes.find((n) => n.kind === 'auto_rigging');
    expect(rig.data.rigMode).toBe(AUTO_RIG_MODES.TEMPLATE_WRAP);
    expect(rig.data.modelPreference).toBe(TEMPLATE_RIG_MODEL_ID);
    expect(rig.data.humanoidTemplateId).toBe('template');

    const clothing = project.nodes.find((n) => n.kind === 'appearance_clothing');
    expect(clothing.data.accessories).toHaveLength(2);
    expect(clothing.data.accessories[0].appearance_slot).toBe('Legs');
    expect(clothing.data.accessories[1].appearance_slot).toBe('Shoes');

    expect(getRunnablePipelineOrder(project).map((n) => n.kind)).toEqual([
      'text_to_image',
      'image_to_3d',
      'auto_rigging',
      'appearance_clothing',
    ]);
  });

  it('setClothingText refreshes accessory slots', () => {
    let project = createKreaComposableAvatarBodyTemplate({ clothingText: '' });
    project = setClothingText(project, 'blue hoodie');
    expect(getClothingText(project)).toBe('blue hoodie');
    const clothing = project.nodes.find((n) => n.kind === 'appearance_clothing');
    expect(clothing.data.accessories[0].appearance_slot).toBe('Chest');
  });

  it('composable template prefills default clothing when clothingText omitted', () => {
    const project = createKreaComposableAvatarBodyTemplate();
    expect(getClothingText(project)).toContain('navy techwear hoodie');
    const clothing = project.nodes.find((n) => n.kind === 'appearance_clothing');
    expect(clothing.data.accessories.length).toBeGreaterThanOrEqual(5);
  });

  it('updates prompt on text_prompt node', () => {
    let project = createKreaTrellisTemplate();
    project = setPromptText(project, 'samurai helmet');
    expect(getPromptText(project)).toBe('samurai helmet');
  });

  it('resolves upstream for image_to_3d as text_to_image', () => {
    const project = createKreaTrellisTemplate();
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    const upstream = getUpstreamNode(project, mesh.id);
    expect(upstream?.kind).toBe('text_to_image');
  });

  it('runnable order is text_to_image then image_to_3d then auto_rigging', () => {
    const project = createKreaTrellisTemplate();
    const order = getRunnablePipelineOrder(project);
    expect(order.map((n) => n.kind)).toEqual([
      'text_to_image',
      'image_to_3d',
      'auto_rigging',
    ]);
  });

  it('groups nodes into kanban stages', () => {
    const project = createKreaTrellisTemplate();
    const groups = groupNodesByStage(project);
    expect(groups.map((g) => g.id)).toEqual([
      'prompt',
      'image',
      'edit',
      'mesh',
      'rig',
      'export',
    ]);
    // Default TRELLIS.2 template has no image_edit node; edit stage is empty.
    expect(groups.find((g) => g.id === 'edit')?.nodes).toHaveLength(0);
    expect(groups.filter((g) => g.id !== 'edit').every((g) => g.nodes.length === 1)).toBe(true);
  });

  it('maps to React Flow elements', () => {
    const project = createKreaTrellisTemplate();
    const { nodes, edges } = toReactFlowElements(project);
    expect(nodes).toHaveLength(5);
    expect(edges).toHaveLength(4);
    expect(nodes[0].type).toBe('studio');
  });

  it('updateNode merges data without dropping fields', () => {
    const project = createKreaTrellisTemplate();
    const image = project.nodes.find((n) => n.kind === 'text_to_image');
    const next = updateNode(project, image.id, {
      status: 'completed',
      data: { imageUrl: '/api/v1/system/jobs/abc/download' },
    });
    const updated = next.nodes.find((n) => n.id === image.id);
    expect(updated.status).toBe('completed');
    expect(updated.data.modelPreference).toBe('krea2_turbo_text_to_image');
    expect(updated.data.imageUrl).toBe('/api/v1/system/jobs/abc/download');
    expect(updated.data.completedAt).toBeTruthy();
    expect(updated.data.startedAt).toBeTruthy();
    expect(formatStudioNodeTiming(updated)).toMatch(
      /^Started \d{2}-\d{2}-\d{4} \d{1,2}:\d{2}:\d{2} (AM|PM) (EDT|EST) • Completed \d{2}-\d{2}-\d{4} \d{1,2}:\d{2}:\d{2} (AM|PM) (EDT|EST)/,
    );
  });

  it('formatStudioNodeTiming matches OpenNexus Eastern mm-dd-yyyy stamps', () => {
    let project = createKreaTrellisTemplate({ prompt: 'x' });
    const image = project.nodes.find((n) => n.kind === 'text_to_image');
    project = updateNode(project, image.id, {
      status: 'completed',
      data: {
        imageUrl: '/api/v1/system/jobs/abc/download',
        startedAt: '2026-06-18T20:41:54.127912-04:00',
        completedAt: '2026-06-18T20:42:10.127912-04:00',
      },
    });
    const line = formatStudioNodeTiming(project.nodes.find((n) => n.id === image.id));
    expect(line).toContain('Started 06-18-2026');
    expect(line).toContain('Completed 06-18-2026');
    expect(line).toMatch(/(EDT|EST)/);
    expect(line).toMatch(/\d+s elapsed/);
  });

  it('defaults text-to-image prompt options for mesh-ready framing', () => {
    const project = createKreaTrellisTemplate({ prompt: 'dragon knight' });
    const opts = getTextToImagePromptOptions(project);
    expect(opts.full_body).toBe(true);
    expect(opts.t_pose).toBe(true);
    expect(opts.remove_background).toBe(true);
    expect(opts.camera_view).toBe('front');
    expect(opts.all_orthographic_views).toBe(false);
  });

  it('recoverInterruptedStudioNodes clears orphaned running without artifacts', () => {
    let project = createKreaTrellisTemplate({ prompt: 'x' });
    const image = project.nodes.find((n) => n.kind === 'text_to_image');
    project = updateNode(project, image.id, { status: 'running' });
    project = recoverInterruptedStudioNodes(project);
    expect(project.nodes.find((n) => n.kind === 'text_to_image').status).toBe('idle');
  });

  it('recoverInterruptedStudioNodes keeps completed when imageUrl present', () => {
    let project = createKreaTrellisTemplate({ prompt: 'x' });
    const image = project.nodes.find((n) => n.kind === 'text_to_image');
    project = updateNode(project, image.id, {
      status: 'running',
      data: { imageUrl: '/api/v1/system/jobs/abc/download' },
    });
    project = recoverInterruptedStudioNodes(project);
    expect(project.nodes.find((n) => n.kind === 'text_to_image').status).toBe('completed');
  });

  it('hydrateStudioImageFromTasks fills image from completed task', () => {
    let project = createKreaTrellisTemplate({ prompt: 'x' });
    const image = project.nodes.find((n) => n.kind === 'text_to_image');
    project = updateNode(project, image.id, { data: { jobId: 'job-hydrate' } });
    project = hydrateStudioImageFromTasks(project, [
      {
        id: 't1',
        type: 'text-to-image',
        status: 'completed',
        job_id: 'job-hydrate',
        completedAt: '2026-08-06T01:00:00Z',
        result: { feature: 'text_to_image', mesh_url: '/api/v1/system/jobs/job-hydrate/download' },
      },
    ]);
    const hydrated = project.nodes.find((n) => n.kind === 'text_to_image');
    expect(hydrated.status).toBe('completed');
    expect(hydrated.data.imageUrl).toContain('job-hydrate');
    expect(hydrated.data.jobId).toBe('job-hydrate');
    expect(hydrated.data.completedAt).toBe('2026-08-06T01:00:00.000Z');
  });

  it('hydrate does not bind an unrelated newest mesh (e.g. yesterday fox)', () => {
    let project = createKreaComposableAvatarBodyTemplate({
      prompt: 'mannequin',
      projectName: 'studio_mannequin',
    });
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    project = updateNode(project, mesh.id, {
      status: 'idle',
      data: { objectName: 'studio_mannequin', meshUrl: null, jobId: null },
    });

    project = hydrateStudioProjectFromTasks(project, [
      {
        id: 't-fox',
        type: 'image-to-3d',
        status: 'completed',
        job_id: 'job-fox',
        completedAt: '2026-08-05T12:00:00Z',
        options: { object_name: 'fox_character' },
        result: { feature: 'image_to_3d', mesh_url: '/api/v1/system/jobs/job-fox/download' },
      },
    ]);

    const after = project.nodes.find((n) => n.kind === 'image_to_3d');
    expect(after.status).toBe('idle');
    expect(after.data?.meshUrl || null).toBeNull();
  });

  it('hydrate keeps an existing chain meshUrl instead of replacing it', () => {
    let project = createKreaComposableAvatarBodyTemplate({ prompt: 'body' });
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    project = updateNode(project, mesh.id, {
      status: 'idle',
      data: {
        objectName: 'mannequin_body',
        meshUrl: '/api/v1/system/jobs/job-mannequin/download',
      },
    });

    project = hydrateStudioProjectFromTasks(project, [
      {
        id: 't-fox',
        type: 'image-to-3d',
        status: 'completed',
        job_id: 'job-fox',
        options: { object_name: 'fox_character' },
        result: { feature: 'image_to_3d', mesh_url: '/api/v1/system/jobs/job-fox/download' },
      },
    ]);

    const after = project.nodes.find((n) => n.kind === 'image_to_3d');
    expect(after.status).toBe('completed');
    expect(after.data.meshUrl).toContain('job-mannequin');
  });

  it('reconcile keeps wrap artifacts even when mesh lineage looks stale', () => {
    let project = createKreaComposableAvatarBodyTemplate({
      prompt: 'body',
      projectName: 'mannequin_body',
    });
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    const rig = project.nodes.find((n) => n.kind === 'auto_rigging');
    project = updateNode(project, mesh.id, {
      status: 'completed',
      data: {
        objectName: 'mannequin_body',
        jobId: 'job-mannequin',
        meshUrl: '/api/v1/system/jobs/job-mannequin/download',
      },
    });
    project = updateNode(project, rig.id, {
      status: 'completed',
      data: {
        objectName: 'mannequin_body',
        jobId: 'job-fox-wrap',
        meshUrl: '/api/v1/system/jobs/job-fox-wrap/download',
        inputMeshJobId: 'job-fox',
        inputMeshUrl: '/api/v1/system/jobs/job-fox/download',
      },
    });

    project = reconcileStudioChainArtifacts(project, [
      {
        id: 't-mesh',
        type: 'image-to-3d',
        status: 'completed',
        job_id: 'job-mannequin',
        options: { object_name: 'mannequin_body' },
        result: { feature: 'image_to_3d', mesh_url: '/api/v1/system/jobs/job-mannequin/download' },
      },
      {
        id: 't-fox-wrap',
        type: 'auto-rigging',
        status: 'completed',
        job_id: 'job-fox-wrap',
        options: { object_name: 'fox_character' },
        result: { feature: 'template_wrap', mesh_url: '/api/v1/system/jobs/job-fox-wrap/download' },
      },
    ]);

    const afterRig = project.nodes.find((n) => n.kind === 'auto_rigging');
    expect(afterRig.status).toBe('completed');
    expect(afterRig.data.meshUrl).toContain('job-fox-wrap');
  });

  it('heal keeps existing produced cards instead of swapping in another workspace job', () => {
    const ws = createStudioWorkspace(
      createKreaComposableAvatarBodyTemplate({
        prompt: 'body',
        projectName: 'mannequin_body',
      }),
      { name: 'mannequin_body' },
    );
    let project = ws.project;
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    const rig = project.nodes.find((n) => n.kind === 'auto_rigging');
    project = updateNode(project, mesh.id, {
      status: 'completed',
      data: {
        objectName: 'mannequin_body',
        jobId: 'job-fox',
        meshUrl: '/api/v1/system/jobs/job-fox/download',
      },
    });
    project = updateNode(project, rig.id, {
      status: 'completed',
      data: {
        objectName: 'mannequin_body',
        jobId: 'job-fox-wrap',
        meshUrl: '/api/v1/system/jobs/job-fox-wrap/download',
      },
    });

    project = healStudioWorkspaceChain(
      project,
      [
        {
          id: 't-fox',
          type: 'image-to-3d',
          status: 'completed',
          job_id: 'job-fox',
          options: {
            object_name: 'fox_character',
            studio_workspace_id: 'ws_other',
          },
          result: { feature: 'image_to_3d', mesh_url: '/api/v1/system/jobs/job-fox/download' },
        },
        {
          id: 't-fox-wrap',
          type: 'auto-rigging',
          status: 'completed',
          job_id: 'job-fox-wrap',
          options: {
            object_name: 'fox_character',
            studio_workspace_id: 'ws_other',
          },
          result: {
            feature: 'template_wrap',
            mesh_url: '/api/v1/system/jobs/job-fox-wrap/download',
          },
        },
        {
          id: 't-man',
          type: 'image-to-3d',
          status: 'completed',
          job_id: 'job-mannequin',
          options: {
            object_name: 'mannequin_body',
            studio_workspace_id: ws.id,
          },
          result: {
            feature: 'image_to_3d',
            mesh_url: '/api/v1/system/jobs/job-mannequin/download',
          },
        },
      ],
      { workspaceId: ws.id },
    );

    const afterMesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    const afterRig = project.nodes.find((n) => n.kind === 'auto_rigging');
    expect(afterMesh.data.meshUrl).toContain('job-fox');
    expect(afterRig.status).toBe('completed');
    expect(afterRig.data.meshUrl).toContain('job-fox-wrap');
  });

  it('heal does not cross-bind jobs between two workspaces with the same name', () => {
    const wsA = createStudioWorkspace(
      createKreaComposableAvatarBodyTemplate({
        prompt: 'a',
        projectName: 'shared_name',
      }),
      { name: 'shared_name' },
    );
    const wsB = createStudioWorkspace(
      createKreaComposableAvatarBodyTemplate({
        prompt: 'b',
        projectName: 'shared_name',
      }),
      { name: 'shared_name' },
    );
    expect(wsA.id).not.toBe(wsB.id);

    const tasks = [
      {
        id: 't-a',
        type: 'image-to-3d',
        status: 'completed',
        job_id: 'job-a',
        options: { object_name: 'shared_name', studio_workspace_id: wsA.id },
        result: { feature: 'image_to_3d', mesh_url: '/api/v1/system/jobs/job-a/download' },
      },
      {
        id: 't-b',
        type: 'image-to-3d',
        status: 'completed',
        job_id: 'job-b',
        options: { object_name: 'shared_name', studio_workspace_id: wsB.id },
        result: { feature: 'image_to_3d', mesh_url: '/api/v1/system/jobs/job-b/download' },
      },
    ];

    const healedB = healStudioWorkspaceChain(wsB.project, tasks, { workspaceId: wsB.id });
    const meshB = healedB.nodes.find((n) => n.kind === 'image_to_3d');
    expect(meshB.data.meshUrl).toContain('job-b');
    expect(meshB.data.meshUrl).not.toContain('job-a');

    const pick = pickWorkspaceScopedTask(tasks, {
      types: ['image-to-3d'],
      features: ['image_to_3d'],
      workspaceId: wsA.id,
      objectName: 'shared_name',
    });
    expect(pick.job_id).toBe('job-a');
    expect(getStudioWorkspaceId(bindProjectToWorkspace(wsA.project, wsA.id))).toBe(wsA.id);
  });

  it('reconcile keeps legacy wrap artifacts when mesh is newer', () => {
    let project = createKreaComposableAvatarBodyTemplate({
      prompt: 'body',
      projectName: 'mannequin_body',
    });
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    const rig = project.nodes.find((n) => n.kind === 'auto_rigging');
    project = updateNode(project, mesh.id, {
      status: 'completed',
      data: {
        objectName: 'mannequin_body',
        jobId: 'job-mannequin',
        meshUrl: '/api/v1/system/jobs/job-mannequin/download',
      },
    });
    // Same object_name as workspace — previously escaped nameConflict — but older than mesh.
    project = updateNode(project, rig.id, {
      status: 'completed',
      data: {
        objectName: 'mannequin_body',
        jobId: 'job-fox-wrap',
        meshUrl: '/api/v1/system/jobs/job-fox-wrap/download',
      },
    });

    project = reconcileStudioChainArtifacts(project, [
      {
        id: 't-mesh',
        type: 'image-to-3d',
        status: 'completed',
        job_id: 'job-mannequin',
        completedAt: '2026-08-06T18:00:00Z',
        options: { object_name: 'mannequin_body' },
        result: { feature: 'image_to_3d', mesh_url: '/api/v1/system/jobs/job-mannequin/download' },
      },
      {
        id: 't-fox-wrap',
        type: 'auto-rigging',
        status: 'completed',
        job_id: 'job-fox-wrap',
        completedAt: '2026-08-05T12:00:00Z',
        options: { object_name: 'mannequin_body' },
        result: { feature: 'template_wrap', mesh_url: '/api/v1/system/jobs/job-fox-wrap/download' },
      },
    ]);

    const afterRig = project.nodes.find((n) => n.kind === 'auto_rigging');
    expect(afterRig.status).toBe('completed');
    expect(afterRig.data.meshUrl).toContain('job-fox-wrap');
  });

  it('heal refuses SkinTokens auto-rig on Body+Cloth wrap template', () => {
    const ws = createStudioWorkspace(
      createKreaComposableAvatarBodyTemplate({
        prompt: 'body',
        projectName: 'Krea composable body',
      }),
      { name: 'Krea composable body' },
    );
    let project = ws.project;
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    project = updateNode(project, mesh.id, {
      status: 'completed',
      data: {
        objectName: 'Krea composable body',
        jobId: 'job-mesh',
        meshUrl: '/api/v1/system/jobs/job-mesh/download',
      },
    });

    project = healStudioWorkspaceChain(
      project,
      [
        {
          id: 't-rig',
          type: 'auto-rigging',
          status: 'completed',
          job_id: '0ed011cc-2d87-48e7-bca0-8b17b1052e1b',
          completedAt: '2026-08-06T03:23:48Z',
          options: {
            object_name: 'Krea_composable_body',
            rig_mode: 'full',
            model_preference: 'skintokens_auto_rig',
          },
          result: {
            feature: 'auto_rig',
            mesh_url: '/api/v1/system/jobs/0ed011cc-2d87-48e7-bca0-8b17b1052e1b/download',
            generation_info: { model: 'skintokens_auto_rig' },
          },
        },
      ],
      { workspaceId: ws.id },
    );

    const afterRig = project.nodes.find((n) => n.kind === 'auto_rigging');
    expect(afterRig.status).not.toBe('completed');
    expect(afterRig.data.meshUrl || null).toBeNull();
    expect(afterRig.data.rigMode).toBe(AUTO_RIG_MODES.TEMPLATE_WRAP);
    expect(afterRig.data.modelPreference).toBe(TEMPLATE_RIG_MODEL_ID);
  });

  it('heal binds UniRig template_wrap by slug-matched object name', () => {
    const ws = createStudioWorkspace(
      createKreaComposableAvatarBodyTemplate({
        prompt: 'body',
        projectName: 'Krea composable body',
      }),
      { name: 'Krea composable body' },
    );
    let project = ws.project;
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    project = updateNode(project, mesh.id, {
      status: 'completed',
      data: {
        objectName: 'Krea composable body',
        jobId: 'job-mesh',
        meshUrl: '/api/v1/system/jobs/job-mesh/download',
      },
    });

    project = healStudioWorkspaceChain(
      project,
      [
        {
          id: 't-wrap',
          type: 'auto-rigging',
          status: 'completed',
          job_id: 'job-wrap-ok',
          completedAt: '2026-08-06T03:23:48Z',
          options: {
            object_name: 'Krea_composable_body',
            rig_mode: 'template_wrap',
            model_preference: 'unirig_auto_rig',
          },
          result: {
            feature: 'template_wrap',
            mesh_url: '/api/v1/system/jobs/job-wrap-ok/download',
            generation_info: { model: 'unirig_auto_rig' },
          },
        },
      ],
      { workspaceId: ws.id },
    );

    const afterRig = project.nodes.find((n) => n.kind === 'auto_rigging');
    expect(afterRig.status).toBe('completed');
    expect(afterRig.data.jobId).toBe('job-wrap-ok');
    expect(afterRig.data.meshUrl).toContain('job-wrap-ok');
    expect(afterRig.data.rigMode).toBe(AUTO_RIG_MODES.TEMPLATE_WRAP);
    expect(afterRig.data.modelPreference).toBe(TEMPLATE_RIG_MODEL_ID);
  });

  it('migrateStudioProject restores template_wrap prefs on Body+Cloth', () => {
    let project = createKreaComposableAvatarBodyTemplate({ prompt: 'x' });
    const rig = project.nodes.find((n) => n.kind === 'auto_rigging');
    project = updateNode(project, rig.id, {
      data: {
        rigMode: 'full',
        modelPreference: 'skintokens_auto_rig',
      },
    });
    project = migrateStudioProject(project);
    const after = project.nodes.find((n) => n.kind === 'auto_rigging');
    expect(after.data.rigMode).toBe(AUTO_RIG_MODES.TEMPLATE_WRAP);
    expect(after.data.modelPreference).toBe(TEMPLATE_RIG_MODEL_ID);
  });

  it('heals legacy flat-row graph positions to staggered layout', () => {
    let project = createKreaComposableAvatarBodyTemplate();
    for (const node of project.nodes) {
      if (node.kind === 'text_to_image') {
        project = updateNode(project, node.id, { position: { x: 320, y: 120 } });
      } else if (node.kind === 'appearance_clothing') {
        project = updateNode(project, node.id, { position: { x: 880, y: 280 } });
      } else {
        project = updateNode(project, node.id, { position: { x: node.position.x, y: 120 } });
      }
    }
    const healed = healStudioGraphLayout(project);
    expect(healed.nodes.find((n) => n.kind === 'text_to_image').position).toEqual({
      x: 320,
      y: 196,
    });
    expect(healed.nodes.find((n) => n.kind === 'appearance_clothing').position).toEqual({
      x: 880,
      y: 312,
    });
    expect(healed.nodes.find((n) => n.kind === 'auto_rigging').position.y).toBe(48);
  });

  it('workspace store isolates projects and syncs tab name', () => {
    const store = createDefaultWorkspaceStore();
    expect(store.workspaces).toHaveLength(1);
    const second = createStudioWorkspace(null, { name: 'Job 2' });
    let next = {
      activeId: second.id,
      workspaces: [...store.workspaces, second],
    };
    expect(getActiveWorkspace(next).name).toBe('Job 2');
    next = updateWorkspaceProject(next, second.id, (proj) => ({
      ...proj,
      name: 'Dragon body',
    }));
    expect(next.workspaces.find((w) => w.id === second.id).name).toBe('Dragon body');
  });

  it('toReactFlowElements embeds apiEndpoint and payload for in-node previews', () => {
    let project = createKreaTrellisTemplate();
    const image = project.nodes.find((n) => n.kind === 'text_to_image');
    project = updateNode(project, image.id, {
      status: 'completed',
      data: { imageUrl: '/api/v1/system/jobs/x/download' },
    });
    const { nodes } = toReactFlowElements(project, { apiEndpoint: '/proxy' });
    const rfImage = nodes.find((n) => n.data.kind === 'text_to_image');
    expect(rfImage.data.apiEndpoint).toBe('/proxy');
    expect(rfImage.data.payload.imageUrl).toContain('jobs/x');
    expect(rfImage.style?.width).toBe(248);
  });

  it('nodeHasStudioArtifact treats meshUrl and partial clothing as complete for display', () => {
    let project = createKreaComposableAvatarBodyTemplate({ prompt: 'x' });
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    project = updateNode(project, mesh.id, {
      status: 'ready',
      data: { meshUrl: '/api/v1/system/jobs/m/download' },
    });
    const meshNode = project.nodes.find((n) => n.id === mesh.id);
    expect(nodeHasStudioArtifact(meshNode)).toBe(true);
    expect(isStudioNodeSatisfied(meshNode)).toBe(true);

    const clothing = project.nodes.find((n) => n.kind === 'appearance_clothing');
    project = updateNode(project, clothing.id, {
      status: 'failed',
      data: {
        accessories: [{ label: 'a' }, { label: 'b' }],
        results: [{ label: 'a', traitUrl: '/t.glb' }],
      },
    });
    const clothingNode = project.nodes.find((n) => n.id === clothing.id);
    expect(getClothingProgress(clothingNode)).toEqual({
      done: 1,
      total: 2,
      results: [{ label: 'a', traitUrl: '/t.glb' }],
    });
    expect(getStudioNodeDisplayStatus(clothingNode)).toBe('partial');
    expect(nodeHasStudioArtifact(clothingNode)).toBe(true);
  });

  it('clearClothingGarmentResult wipes one garment for re-run', () => {
    let project = createKreaComposableAvatarBodyTemplate({
      prompt: 'knight',
      clothingText: 'Chest: vest\nHands: gloves',
    });
    const clothing = project.nodes.find((n) => n.kind === 'appearance_clothing');
    project = updateNode(project, clothing.id, {
      status: 'completed',
      data: {
        accessories: clothing.data.accessories,
        results: [
          {
            label: clothing.data.accessories[0].label,
            appearance_slot: clothing.data.accessories[0].appearance_slot,
            traitUrl: '/chest.glb',
            imageUrl: '/chest.png',
          },
          {
            label: clothing.data.accessories[1].label,
            appearance_slot: clothing.data.accessories[1].appearance_slot,
            traitUrl: '/hands.glb',
            imageUrl: '/hands.png',
          },
        ],
      },
    });
    const handsIndex = findClothingAccessoryIndex(project, {
      label: clothing.data.accessories[1].label,
      appearance_slot: clothing.data.accessories[1].appearance_slot,
    });
    expect(handsIndex).toBe(1);
    project = clearClothingGarmentResult(project, handsIndex);
    const next = project.nodes.find((n) => n.kind === 'appearance_clothing');
    expect(next.data.results[0].traitUrl).toBe('/chest.glb');
    expect(next.data.results[1].traitUrl).toBeNull();
    expect(next.data.results[1].imageUrl).toBeNull();
    expect(next.status).toBe('ready');
  });

  it('edges stay solid through completed nodes, dashed+animated ahead', () => {
    let project = createKreaTrellisTemplate({ prompt: 'dragon knight' });
    const promptNode = project.nodes.find((n) => n.kind === 'text_prompt');
    const image = project.nodes.find((n) => n.kind === 'text_to_image');
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    const edgePromptImage = project.edges.find(
      (e) => e.source === promptNode.id && e.target === image.id,
    );
    const edgeImageMesh = project.edges.find(
      (e) => e.source === image.id && e.target === mesh.id,
    );
    const edgeMeshRig = project.edges.find((e) => e.source === mesh.id);

    // Nothing completed beyond prompt → incomplete forward pending
    expect(isStudioNodeSatisfied(promptNode)).toBe(true);
    expect(isStudioEdgePending(project, edgePromptImage)).toBe(true);
    expect(isStudioEdgePending(project, edgeImageMesh)).toBe(true);
    expect(isStudioEdgePending(project, edgeMeshRig)).toBe(true);

    project = updateNode(project, image.id, { status: 'completed' });
    // Prompt→image solid; image→mesh still pending; later edges pending
    expect(isStudioEdgePending(project, edgePromptImage)).toBe(false);
    expect(isStudioEdgePending(project, edgeImageMesh)).toBe(true);
    expect(isStudioEdgePending(project, edgeMeshRig)).toBe(true);

    project = updateNode(project, mesh.id, {
      status: 'completed',
      data: { meshUrl: '/api/v1/system/jobs/m/download' },
    });
    expect(isStudioEdgePending(project, edgeImageMesh)).toBe(false);
    expect(isStudioEdgePending(project, edgeMeshRig)).toBe(true);

    const { edges } = toReactFlowElements(project);
    const rfDone = edges.find((e) => e.id === edgeImageMesh.id);
    const rfPending = edges.find((e) => e.id === edgeMeshRig.id);
    expect(rfDone.animated).toBe(false);
    expect(rfDone.className).toBe('studio-edge-done');
    expect(rfDone.style.strokeDasharray).toBe('none');
    expect(rfPending.animated).toBe(true);
    expect(rfPending.className).toBe('studio-edge-pending');
    expect(rfPending.style.strokeDasharray).toBe('6 4');
  });

  it('hydrateStudioProjectFromTasks recovers mesh and rig after refresh', () => {
    let project = createKreaComposableAvatarBodyTemplate({ prompt: 'body' });
    const image = project.nodes.find((n) => n.kind === 'text_to_image');
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    const rig = project.nodes.find((n) => n.kind === 'auto_rigging');
    project = updateNode(project, image.id, {
      status: 'idle',
      data: { jobId: 'job-img' },
    });
    project = updateNode(project, mesh.id, {
      status: 'idle',
      data: { jobId: 'job-mesh' },
    });
    project = updateNode(project, rig.id, {
      status: 'idle',
      data: { jobId: 'job-rig' },
    });

    project = hydrateStudioProjectFromTasks(project, [
      {
        id: 't-img',
        type: 'text-to-image',
        status: 'completed',
        job_id: 'job-img',
        options: { object_name: project.name },
        result: { feature: 'text_to_image', mesh_url: '/api/v1/system/jobs/job-img/download' },
      },
      {
        id: 't-mesh',
        type: 'image-to-3d',
        status: 'completed',
        job_id: 'job-mesh',
        options: { object_name: project.name },
        result: { feature: 'image_to_3d', mesh_url: '/api/v1/system/jobs/job-mesh/download' },
      },
      {
        id: 't-rig',
        type: 'auto-rigging',
        status: 'completed',
        job_id: 'job-rig',
        options: { object_name: project.name },
        result: { feature: 'template_wrap', mesh_url: '/api/v1/system/jobs/job-rig/download' },
      },
    ]);

    expect(project.nodes.find((n) => n.kind === 'text_to_image').status).toBe('completed');
    expect(project.nodes.find((n) => n.kind === 'image_to_3d').status).toBe('completed');
    expect(project.nodes.find((n) => n.kind === 'image_to_3d').data.meshUrl).toContain('job-mesh');
    expect(project.nodes.find((n) => n.kind === 'auto_rigging').status).toBe('completed');
    expect(project.nodes.find((n) => n.kind === 'auto_rigging').data.meshUrl).toContain('job-rig');
  });

  it('hydrateStudioClothingFromTasks reattaches MeshMonk garments by object_name', () => {
    let project = createKreaComposableAvatarBodyTemplate({ prompt: 'body' });
    project = { ...project, name: 'MeshMonk' };
    project = setClothingText(
      project,
      'Chest: textured olive linen overshirt\nLegs: charcoal slim trousers',
    );
    const clothing = project.nodes.find((n) => n.kind === 'appearance_clothing');
    const accessories = clothing.data.accessories;
    expect(accessories.length).toBe(2);

    const chestName = studioClothingObjectName(project, accessories[0], 0);
    const legsName = studioClothingObjectName(project, accessories[1], 1);
    expect(chestName).toContain('MeshMonk');
    expect(chestName).toContain('overshirt');

    project = updateNode(project, clothing.id, {
      status: 'ready',
      data: {
        accessories,
        results: [
          {
            label: accessories[0].label,
            appearance_slot: 'Chest',
            objectName: chestName,
            traitUrl: '/api/v1/system/jobs/job-chest/download',
            jobId: 'job-chest',
          },
        ],
      },
    });

    project = hydrateStudioClothingFromTasks(project, [
      {
        id: 't-chest',
        type: 'auto-rigging',
        status: 'completed',
        job_id: 'job-chest',
        options: {
          object_name: chestName,
          appearance_slot: 'Chest',
          rig_mode: AUTO_RIG_MODES.APPEARANCE_COMPONENT,
        },
        result: {
          feature: 'appearance_component',
          mesh_url: '/api/v1/system/jobs/job-chest/download',
        },
      },
      {
        id: 't-legs',
        type: 'auto-rigging',
        status: 'completed',
        job_id: 'job-legs',
        options: {
          object_name: legsName,
          appearance_slot: 'Legs',
          rig_mode: AUTO_RIG_MODES.APPEARANCE_COMPONENT,
        },
        result: {
          feature: 'appearance_component',
          mesh_url: '/api/v1/system/jobs/job-legs/download',
        },
      },
    ]);

    const nextClothing = project.nodes.find((n) => n.kind === 'appearance_clothing');
    const { done, total, results } = getClothingProgress(nextClothing);
    expect(total).toBe(2);
    expect(done).toBe(2);
    expect(nextClothing.status).toBe('completed');
    expect(results.find((r) => r.appearance_slot === 'Legs')?.traitUrl).toContain('job-legs');
    // Existing Chest trait must not be wiped.
    expect(results.find((r) => r.appearance_slot === 'Chest')?.jobId).toBe('job-chest');
  });

  it('hydrateStudioProjectFromTasks also recovers clothing via heal path', () => {
    let project = createKreaComposableAvatarBodyTemplate({ prompt: 'body' });
    project = { ...project, name: 'MeshMonk' };
    project = setClothingText(project, 'Chest: olive overshirt\nShoes: leather boots');
    const clothing = project.nodes.find((n) => n.kind === 'appearance_clothing');
    const [chest, shoes] = clothing.data.accessories;
    const chestName = studioClothingObjectName(project, chest, 0);
    const shoesName = studioClothingObjectName(project, shoes, 1);

    project = hydrateStudioProjectFromTasks(project, [
      {
        id: 't-chest',
        type: 'auto-rigging',
        status: 'completed',
        job_id: 'job-c',
        options: {
          object_name: chestName,
          appearance_slot: 'Chest',
          rig_mode: AUTO_RIG_MODES.APPEARANCE_COMPONENT,
        },
        result: {
          feature: 'appearance_component',
          mesh_url: '/api/v1/system/jobs/job-c/download',
        },
      },
      {
        id: 't-shoes',
        type: 'auto-rigging',
        status: 'completed',
        job_id: 'job-s',
        options: {
          object_name: shoesName,
          appearance_slot: 'Shoes',
          rig_mode: AUTO_RIG_MODES.APPEARANCE_COMPONENT,
        },
        result: {
          feature: 'appearance_component',
          mesh_url: '/api/v1/system/jobs/job-s/download',
        },
      },
    ]);

    const { done, total } = getClothingProgress(
      project.nodes.find((n) => n.kind === 'appearance_clothing'),
    );
    expect(done).toBe(2);
    expect(total).toBe(2);
  });

  it('heal with no Task Manager tasks keeps produced artifacts', () => {
    let project = createKreaTrellisTemplate({ prompt: 'x', projectName: 'keep_me' });
    const image = project.nodes.find((n) => n.kind === 'text_to_image');
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    const rig = project.nodes.find((n) => n.kind === 'auto_rigging');
    project = updateNode(project, image.id, {
      status: 'completed',
      data: { imageUrl: '/api/v1/system/jobs/img/download', jobId: 'img' },
    });
    project = updateNode(project, mesh.id, {
      status: 'completed',
      data: { meshUrl: '/api/v1/system/jobs/mesh/download', jobId: 'mesh' },
    });
    project = updateNode(project, rig.id, {
      status: 'completed',
      data: { meshUrl: '/api/v1/system/jobs/rig/download', jobId: 'rig' },
    });

    project = healStudioWorkspaceChain(project, []);
    expect(project.nodes.find((n) => n.kind === 'text_to_image').data.imageUrl).toContain('img');
    expect(project.nodes.find((n) => n.kind === 'image_to_3d').data.meshUrl).toContain('mesh');
    expect(project.nodes.find((n) => n.kind === 'auto_rigging').data.meshUrl).toContain('rig');
  });

  it('applyStudioTemplate keeps produced image and mesh when switching chips', () => {
    let project = createKreaTrellisTemplate({ prompt: 'knight', projectName: 'My knight' });
    const image = project.nodes.find((n) => n.kind === 'text_to_image');
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    const imageId = image.id;
    const meshId = mesh.id;
    project = updateNode(project, image.id, {
      status: 'completed',
      data: { imageUrl: '/api/v1/system/jobs/img1/download', jobId: 'img1' },
    });
    project = updateNode(project, mesh.id, {
      status: 'completed',
      data: { meshUrl: '/api/v1/system/jobs/mesh1/download', jobId: 'mesh1' },
    });

    const mage = applyStudioTemplate(project, 'krea_mage_trellis2');
    expect(mage.templateId).toBe('krea_mage_trellis2');
    expect(mage.name).toBe('My knight');
    expect(mage.id).toBe(project.id);
    expect(mage.nodes.find((n) => n.kind === 'text_to_image').id).toBe(imageId);
    expect(mage.nodes.find((n) => n.kind === 'image_to_3d').id).toBe(meshId);
    expect(mage.nodes.find((n) => n.kind === 'text_to_image').data.imageUrl).toContain('img1');
    expect(mage.nodes.find((n) => n.kind === 'image_to_3d').data.meshUrl).toContain('mesh1');
    expect(mage.nodes.find((n) => n.kind === 'image_edit')).toBeTruthy();

    const back = applyStudioTemplate(mage, 'krea_trellis2');
    expect(back.nodes.find((n) => n.kind === 'image_edit')).toBeFalsy();
    expect(back.nodes.find((n) => n.kind === 'text_to_image').data.imageUrl).toContain('img1');
    expect(back.nodes.find((n) => n.kind === 'image_to_3d').data.meshUrl).toContain('mesh1');
  });

  it('applyStudioTemplate restores clothing results when returning to Body+Cloth', () => {
    let project = createKreaComposableAvatarBodyTemplate({
      prompt: 'body',
      projectName: 'mannequin',
      clothingText: 'Chest: vest',
    });
    const clothing = project.nodes.find((n) => n.kind === 'appearance_clothing');
    const mesh = project.nodes.find((n) => n.kind === 'image_to_3d');
    project = updateNode(project, mesh.id, {
      status: 'completed',
      data: { meshUrl: '/api/v1/system/jobs/body/download', jobId: 'body' },
    });
    project = updateNode(project, clothing.id, {
      status: 'completed',
      data: {
        results: [{ label: 'vest', appearance_slot: 'Chest', traitUrl: '/vest.glb' }],
      },
    });

    const trellis = applyStudioTemplate(project, 'krea_trellis2');
    expect(trellis.nodes.find((n) => n.kind === 'appearance_clothing')).toBeFalsy();
    expect(trellis.nodes.find((n) => n.kind === 'image_to_3d').data.meshUrl).toContain('body');

    const restored = applyStudioTemplate(trellis, 'krea_composable_avatar_body');
    const clothingAfter = restored.nodes.find((n) => n.kind === 'appearance_clothing');
    expect(clothingAfter).toBeTruthy();
    expect(clothingAfter.data.results[0].traitUrl).toBe('/vest.glb');
    expect(restored.nodes.find((n) => n.kind === 'image_to_3d').data.meshUrl).toContain('body');
  });
});
