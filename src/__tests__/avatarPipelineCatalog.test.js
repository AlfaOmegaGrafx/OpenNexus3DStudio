import { describe, expect, it } from 'vitest';
import {
  AUTO_RIG_MODES,
  buildTemplateAutoRigOptions,
  DEFAULT_HUMANOID_TEMPLATE_ID,
  isTemplateRigMode,
  normalizeHumanoidTemplateId,
} from '../library/avatarPipelineCatalog.js';
import { getDefaultAutoRigOutputFormat } from '../library/aiModelsCatalog.js';

describe('avatarPipelineCatalog', () => {
  it('normalizes legacy template ids to humanoid', () => {
    expect(normalizeHumanoidTemplateId('sifr2')).toBe('humanoid');
    expect(normalizeHumanoidTemplateId('template')).toBe('humanoid');
    expect(normalizeHumanoidTemplateId()).toBe(DEFAULT_HUMANOID_TEMPLATE_ID);
    expect(DEFAULT_HUMANOID_TEMPLATE_ID).toBe('humanoid');
  });

  it('buildTemplateAutoRigOptions matches API contract', () => {
    const opts = buildTemplateAutoRigOptions({ humanoid_template_id: 'sifr2' });
    expect(opts).toEqual({
      rig_mode: AUTO_RIG_MODES.TEMPLATE,
      humanoid_template_id: 'humanoid',
      output_format: 'vrm',
      model_preference: 'unirig_auto_rig',
    });
    const defaultOpts = buildTemplateAutoRigOptions();
    expect(defaultOpts.humanoid_template_id).toBe('humanoid');
  });

  it('isTemplateRigMode detects template + UniRig', () => {
    expect(isTemplateRigMode('template', 'unirig_auto_rig')).toBe(true);
    expect(isTemplateRigMode('template', 'skintokens_auto_rig')).toBe(false);
  });

  it('getDefaultAutoRigOutputFormat returns vrm for template mode', () => {
    expect(getDefaultAutoRigOutputFormat('unirig_auto_rig', 'template')).toBe('vrm');
    expect(getDefaultAutoRigOutputFormat('unirig_auto_rig', 'skeleton')).toBe('fbx');
  });
});
