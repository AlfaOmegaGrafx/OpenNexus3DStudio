import { describe, expect, it } from 'vitest';
import {
  cleanModelLabel,
  getDefaultAutoRigModel,
  getDefaultAutoRigOutputFormat,
  getDefaultModelForFeature,
  getModelLabel,
  getModelsForTaskType,
  resolveAutoRigModelForTask,
  resolveMeshModelForAvatarFromImage,
} from '../library/aiModelsCatalog.js';

describe('aiModelsCatalog auto-rig helpers', () => {
  it('lists auto-rig models including SkinTokens', () => {
    const models = getModelsForTaskType('auto-rigging');
    expect(models.map((m) => m.value)).toContain('unirig_auto_rig');
    expect(models.map((m) => m.value)).toContain('skintokens_auto_rig');
  });

  it('getModelLabel uses catalog labels', () => {
    expect(getModelLabel('unirig_auto_rig')).toContain('UniRig Auto Rig');
    expect(getModelLabel('skintokens_auto_rig')).toContain('SkinTokens Auto Rig');
  });

  it('cleanModelLabel title-cases unknown ids', () => {
    expect(cleanModelLabel('custom_backend_v2')).toBe('Custom Backend V2');
  });

  it('getDefaultAutoRigOutputFormat matches backend defaults', () => {
    expect(getDefaultAutoRigOutputFormat('unirig_auto_rig')).toBe('fbx');
    expect(getDefaultAutoRigOutputFormat('unirig_auto_rig', 'template')).toBe('glb');
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
    expect(getModelsForTaskType('mesh-uv-unwrapping').map((m) => m.value)).toContain(
      'xatlas_uv_unwrapping',
    );
    expect(getModelsForTaskType('mesh-editing-text').map((m) => m.value)).toContain(
      'voxhammer_text_mesh_editing',
    );
    expect(getDefaultModelForFeature('image-to-raw-mesh')).toBe('hunyuan3dv21_image_to_raw_mesh');
  });

  it('defaults auto-rig to SkinTokens and image mesh paint to TRELLIS.2', () => {
    expect(getDefaultModelForFeature('auto-rigging')).toBe('skintokens_auto_rig');
    expect(getDefaultModelForFeature('mesh-painting')).toBe('trellis2_image_mesh_painting');
    expect(getDefaultAutoRigModel('full')).toBe('skintokens_auto_rig');
    expect(getDefaultAutoRigModel('template')).toBe('unirig_auto_rig');
    expect(resolveAutoRigModelForTask('template', 'skintokens_auto_rig')).toBe('unirig_auto_rig');
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
});
