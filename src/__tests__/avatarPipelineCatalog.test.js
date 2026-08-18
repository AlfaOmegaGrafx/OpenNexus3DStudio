import { describe, expect, it } from 'vitest';
import {
  AUTO_RIG_MODES,
  buildTemplateAutoRigOptions,
  DEFAULT_HUMANOID_TEMPLATE_ID,
  isHumanoidTemplateWrapMode,
  isTemplateRigMode,
  normalizeHumanoidTemplateId,
  ARC2AVATAR_MODEL_ID,
  ARC2AVATAR_FEATURE,
  ARC2AVATAR_TASK_TYPE,
  ARC2AVATAR_API_READY,
  ARC2AVATAR_STATUS_PATH,
  ARC2AVATAR_IMAGE_TO_HEAD_PATH,
  BODY_CLOTH_STUDIO_TASK_TYPE,
  BODY_CLOTH_STUDIO_TEMPLATE_ID,
  BODY_CLOTH_STUDIO_PATH,
  buildBodyClothStudioPath,
  HEAD_TRACK,
  headTrackUsesArc2Avatar,
  headTrackUsesMeshMonk,
  headTrackIsNone,
  normalizeHeadTrack,
  isArc2AvatarTaskType,
  isBodyClothStudioTaskType,
  fetchArc2AvatarStatus,
} from '../library/avatarPipelineCatalog.js';
import {
  getDefaultAutoRigOutputFormat,
  PREFERRED_PIPELINES,
  PLANNED_MODELS,
  TASK_TYPE_TO_FEATURE,
  ALL_MODELS,
} from '../library/aiModelsCatalog.js';

describe('avatarPipelineCatalog', () => {
  it('normalizes legacy sifr2 template id to template', () => {
    expect(normalizeHumanoidTemplateId('sifr2')).toBe('template');
    expect(normalizeHumanoidTemplateId()).toBe(DEFAULT_HUMANOID_TEMPLATE_ID);
  });

  it('buildTemplateAutoRigOptions matches API contract', () => {
    const opts = buildTemplateAutoRigOptions({ humanoid_template_id: 'sifr2' });
    expect(opts).toEqual({
      rig_mode: AUTO_RIG_MODES.TEMPLATE,
      humanoid_template_id: 'template',
      output_format: 'vrm',
      model_preference: 'unirig_auto_rig',
    });
  });

  it('isTemplateRigMode detects template / template_wrap + UniRig', () => {
    expect(isTemplateRigMode('template', 'unirig_auto_rig')).toBe(true);
    expect(isTemplateRigMode('template_wrap', 'unirig_auto_rig')).toBe(true);
    expect(isTemplateRigMode('template', 'skintokens_auto_rig')).toBe(false);
    expect(isHumanoidTemplateWrapMode('template_wrap', 'unirig_auto_rig')).toBe(true);
    expect(isHumanoidTemplateWrapMode('template', 'unirig_auto_rig')).toBe(false);
  });

  it('getDefaultAutoRigOutputFormat returns vrm for template / wrap / appearance', () => {
    expect(getDefaultAutoRigOutputFormat('unirig_auto_rig', 'template')).toBe('vrm');
    expect(getDefaultAutoRigOutputFormat('unirig_auto_rig', 'template_wrap')).toBe('vrm');
    expect(getDefaultAutoRigOutputFormat('appearance_component_auto_rig', 'appearance_component')).toBe(
      'vrm',
    );
    expect(getDefaultAutoRigOutputFormat('unirig_auto_rig', 'skeleton')).toBe('fbx');
  });

  it('places Arc2Avatar on the same humanoid head track as GNM/MeshMonk', () => {
    expect(normalizeHeadTrack('')).toBe(HEAD_TRACK.MESHMONK);
    expect(normalizeHeadTrack('none')).toBe(HEAD_TRACK.NONE);
    expect(headTrackUsesMeshMonk(HEAD_TRACK.MESHMONK)).toBe(true);
    expect(headTrackUsesMeshMonk(HEAD_TRACK.BOTH)).toBe(true);
    expect(headTrackUsesMeshMonk(HEAD_TRACK.ARC2AVATAR)).toBe(false);
    expect(headTrackUsesMeshMonk(HEAD_TRACK.NONE)).toBe(false);
    expect(headTrackUsesArc2Avatar(HEAD_TRACK.ARC2AVATAR)).toBe(true);
    expect(headTrackUsesArc2Avatar(HEAD_TRACK.BOTH)).toBe(true);
    expect(headTrackUsesArc2Avatar(HEAD_TRACK.NONE)).toBe(false);
    expect(headTrackIsNone(HEAD_TRACK.NONE)).toBe(true);
    expect(headTrackIsNone(HEAD_TRACK.MESHMONK)).toBe(false);

    expect(ARC2AVATAR_MODEL_ID).toBe('arc2avatar_head');
    expect(ARC2AVATAR_FEATURE).toBe('arc2avatar_head');
    expect(ARC2AVATAR_TASK_TYPE).toBe('avatar-head-arc2avatar');
    expect(isArc2AvatarTaskType(ARC2AVATAR_TASK_TYPE)).toBe(true);
    expect(ARC2AVATAR_API_READY).toBe(true);
    expect(ALL_MODELS.some((m) => m.value === ARC2AVATAR_MODEL_ID)).toBe(true);
    expect(PLANNED_MODELS.some((m) => m.value === ARC2AVATAR_MODEL_ID && m.planned)).toBe(false);
    expect(TASK_TYPE_TO_FEATURE[ARC2AVATAR_TASK_TYPE]).toBe(ARC2AVATAR_FEATURE);

    const body = PREFERRED_PIPELINES.composableAvatarBody;
    expect(body.rigMode).toBe(AUTO_RIG_MODES.TEMPLATE_WRAP);
    expect(body.headTrackOptions).toEqual(
      expect.arrayContaining(['meshmonk', 'arc2avatar', 'both', 'none']),
    );
    expect(body.taskTypes).toContain(ARC2AVATAR_TASK_TYPE);
    expect(body.taskTypes).toContain(BODY_CLOTH_STUDIO_TASK_TYPE);

    expect(isBodyClothStudioTaskType(BODY_CLOTH_STUDIO_TASK_TYPE)).toBe(true);
    expect(BODY_CLOTH_STUDIO_TEMPLATE_ID).toBe('krea_composable_avatar_body');
    expect(BODY_CLOTH_STUDIO_PATH).toContain(BODY_CLOTH_STUDIO_TEMPLATE_ID);
    expect(buildBodyClothStudioPath(HEAD_TRACK.BOTH)).toBe(
      `/studio?template=${BODY_CLOTH_STUDIO_TEMPLATE_ID}&head_track=both`,
    );
    expect(buildBodyClothStudioPath('ARC2AVATAR')).toContain('head_track=arc2avatar');

    const studioEntry = PREFERRED_PIPELINES.bodyClothStudio;
    expect(studioEntry.taskType).toBe(BODY_CLOTH_STUDIO_TASK_TYPE);
    expect(studioEntry.sameTrackAs).toBe('composableAvatarBody');
    expect(studioEntry.opensStudio).toBe(true);
    expect(studioEntry.studioTemplateId).toBe(BODY_CLOTH_STUDIO_TEMPLATE_ID);

    const pipe = PREFERRED_PIPELINES.arc2AvatarHead;
    expect(pipe.taskType).toBe(ARC2AVATAR_TASK_TYPE);
    expect(pipe.sameTrackAs).toBe('composableAvatarBody');
    expect(pipe.headTrack).toBe(HEAD_TRACK.ARC2AVATAR);
    expect(pipe.planned).toBe(false);
    expect(ARC2AVATAR_STATUS_PATH).toBe('/api/v1/arc2avatar/status');
    expect(ARC2AVATAR_IMAGE_TO_HEAD_PATH).toBe('/api/v1/arc2avatar/image-to-head');
  });

  it('fetchArc2AvatarStatus maps integrated from API JSON', async () => {
    const prev = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ integrated: true, blocking_reasons: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    try {
      const status = await fetchArc2AvatarStatus('http://10.0.0.158:7842');
      expect(status.integrated).toBe(true);
    } finally {
      globalThis.fetch = prev;
    }
  });
});
