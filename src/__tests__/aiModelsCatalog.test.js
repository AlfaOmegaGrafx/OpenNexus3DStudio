import { describe, expect, it } from 'vitest';
import {
  autoRigSelectionForPipelineKind,
  cleanModelLabel,
  getAutoRigModelsForRigMode,
  getDefaultAutoRigModel,
  getDefaultAutoRigOutputFormat,
  getDefaultModelForFeature,
  getModelLabel,
  getModelsForTaskType,
  implyRigModeFromAutoRigModel,
  inferAutoRigPipelineKind,
  recommendedRigPipelinesForTask,
  resolveAutoRigModelForTask,
  resolveMeshModelForAvatarFromImage,
  API_MAX_MESH_VERTICES,
  PIPELINE_MESH_DECIMATION_MAX,
  PIPELINE_MESH_DECIMATION_TARGET,
  clampPipelineDecimationTarget,
  getPipelineSafeMeshGenerationDefaults,
} from '../library/aiModelsCatalog.js';

describe('aiModelsCatalog auto-rig helpers', () => {
  it('lists auto-rig models including SkinTokens', () => {
    const models = getModelsForTaskType('auto-rigging');
    expect(models.map((m) => m.value)).toContain('unirig_auto_rig');
    expect(models.map((m) => m.value)).toContain('skintokens_auto_rig');
    expect(models.map((m) => m.value)).toContain('creature_template_auto_rig');
  });

  it('getModelLabel uses catalog labels', () => {
    expect(getModelLabel('unirig_auto_rig')).toContain('UniRig');
    expect(getModelLabel('skintokens_auto_rig')).toContain('SkinTokens Auto Rig');
  });

  it('cleanModelLabel title-cases unknown ids', () => {
    expect(cleanModelLabel('custom_backend_v2')).toBe('Custom Backend V2');
  });

  it('getDefaultAutoRigOutputFormat matches backend defaults', () => {
    expect(getDefaultAutoRigOutputFormat('unirig_auto_rig')).toBe('fbx');
    expect(getDefaultAutoRigOutputFormat('unirig_auto_rig', 'template')).toBe('vrm');
    expect(getDefaultAutoRigOutputFormat('unirig_auto_rig', 'template_wrap')).toBe('vrm');
    expect(getDefaultAutoRigOutputFormat('appearance_component_auto_rig', 'appearance_component')).toBe(
      'vrm',
    );
    expect(getDefaultAutoRigOutputFormat('skintokens_auto_rig')).toBe('glb');
    expect(getDefaultAutoRigOutputFormat(undefined)).toBe('fbx');
  });

  it('lists TripoSplat for image-to-splat tasks', () => {
    const models = getModelsForTaskType('image-to-splat');
    expect(models.map((m) => m.value)).toContain('triposplat_image_to_splat');
    expect(getDefaultModelForFeature('image-to-splat')).toBe('triposplat_image_to_splat');
  });

  it('lists enabled backend models for mesh tools', () => {
    expect(getModelsForTaskType('mesh-segmentation').map((m) => m.value)).toContain(
      'p3sam_mesh_segmentation',
    );
    expect(getModelsForTaskType('mesh-retopology').map((m) => m.value)).toContain(
      'instant_meshes_retopology',
    );
    expect(getModelsForTaskType('mesh-retopology').map((m) => m.value)).toContain(
      'autoremesher_retopology',
    );
    expect(getModelsForTaskType('mesh-retopology').map((m) => m.value)).toContain(
      'trimesh_decimate',
    );
    expect(getDefaultModelForFeature('mesh-retopology')).toBe('trimesh_decimate');
    expect(getModelsForTaskType('mesh-uv-unwrapping').map((m) => m.value)).toContain(
      'xatlas_uv_unwrapping',
    );
    expect(getModelsForTaskType('mesh-editing-text').map((m) => m.value)).toContain(
      'voxhammer_text_mesh_editing',
    );
    expect(getDefaultModelForFeature('image-to-raw-mesh')).toBe('hunyuan3dv21_image_to_raw_mesh');
  });

  it('lists Krea 2 Turbo for text-to-image tasks', () => {
    const models = getModelsForTaskType('text-to-image');
    expect(models.map((m) => m.value)).toContain('krea2_turbo_text_to_image');
    expect(getDefaultModelForFeature('text-to-image')).toBe('krea2_turbo_text_to_image');
  });

  it('defaults auto-rig to SkinTokens and image mesh paint to TRELLIS.2', () => {
    expect(getDefaultModelForFeature('auto-rigging')).toBe('skintokens_auto_rig');
    expect(getDefaultModelForFeature('mesh-painting')).toBe('trellis2_image_mesh_painting');
    expect(getDefaultAutoRigModel('full')).toBe('skintokens_auto_rig');
    expect(getDefaultAutoRigModel('template')).toBe('unirig_auto_rig');
    expect(getDefaultAutoRigModel('creature_template')).toBe('creature_template_auto_rig');
    expect(resolveAutoRigModelForTask('template', 'skintokens_auto_rig')).toBe('unirig_auto_rig');
  });

  it('allows UniRig for skeleton/full without snapping back to SkinTokens', () => {
    expect(resolveAutoRigModelForTask('full', 'unirig_auto_rig')).toBe('unirig_auto_rig');
    expect(resolveAutoRigModelForTask('skeleton', 'unirig_auto_rig')).toBe('unirig_auto_rig');
    expect(resolveAutoRigModelForTask('full', 'creature_template_auto_rig')).toBe(
      'skintokens_auto_rig',
    );
  });

  it('recommendedRigPipelinesForTask offers SkinTokens + UniRig for characters', () => {
    expect(recommendedRigPipelinesForTask({ name: 'Fox', options: {} })).toEqual([
      'creature',
      'skintokens',
      'template',
    ]);
    expect(recommendedRigPipelinesForTask({ name: 'Eagle Knight', options: {} })).toEqual([
      'skintokens',
      'template',
    ]);
    expect(
      recommendedRigPipelinesForTask({ name: 'Human Avatar', options: { object_name: 'Human Avatar' } }),
    ).toEqual(['skintokens', 'template']);
  });

  it('infers fox/creature names and syncs model↔rig mode', () => {
    expect(inferAutoRigPipelineKind({ objectName: 'Fox' })).toBe('creature');
    expect(inferAutoRigPipelineKind({ objectName: 'Eagle Knight' })).toBe('skintokens');
    expect(autoRigSelectionForPipelineKind('creature')).toEqual({
      modelPreference: 'creature_template_auto_rig',
      rigMode: 'creature_template',
    });
    expect(implyRigModeFromAutoRigModel('creature_template_auto_rig', 'full')).toBe(
      'creature_template',
    );
    expect(implyRigModeFromAutoRigModel('unirig_auto_rig', 'full')).toBe('full');
    expect(implyRigModeFromAutoRigModel('unirig_auto_rig', 'creature_template')).toBe('template');
    expect(getAutoRigModelsForRigMode('creature_template').map((m) => m.value)).toEqual([
      'creature_template_auto_rig',
    ]);
    expect(getAutoRigModelsForRigMode('template').map((m) => m.value)).toEqual(['unirig_auto_rig']);
  });

  it('resolveMeshModelForAvatarFromImage ignores stale rig and legacy mesh models', () => {
    expect(resolveMeshModelForAvatarFromImage('unirig_auto_rig')).toBe(
      'trellis2_image_to_textured_mesh',
    );
    expect(resolveMeshModelForAvatarFromImage('trellis_image_to_textured_mesh')).toBe(
      'trellis2_image_to_textured_mesh',
    );
    expect(resolveMeshModelForAvatarFromImage('hunyuan3dv21_image_to_textured_mesh')).toBe(
      'hunyuan3dv21_image_to_textured_mesh',
    );
  });

  it('pipeline mesh defaults stay under the auto-rig upload vertex budget', () => {
    const defaults = getPipelineSafeMeshGenerationDefaults();
    expect(defaults.model_parameters.decimation_target).toBe(PIPELINE_MESH_DECIMATION_TARGET);
    expect(PIPELINE_MESH_DECIMATION_TARGET).toBe(API_MAX_MESH_VERTICES);
    expect(PIPELINE_MESH_DECIMATION_MAX).toBe(API_MAX_MESH_VERTICES);
    expect(clampPipelineDecimationTarget(1_000_000)).toBe(API_MAX_MESH_VERTICES);
    expect(clampPipelineDecimationTarget(209_999)).toBe(209_999);
  });
});
