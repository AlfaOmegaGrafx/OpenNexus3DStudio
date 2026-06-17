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
  it('normalizes legacy sifr2 template id to template', () => {
    expect(normalizeHumanoidTemplateId('sifr2')).toBe('template');
    expect(normalizeHumanoidTemplateId()).toBe(DEFAULT_HUMANOID_TEMPLATE_ID);
  });

  it('buildTemplateAutoRigOptions matches API contract', () => {
    const opts = buildTemplateAutoRigOptions({ humanoid_template_id: 'sifr2' });
    expect(opts).toEqual({
      rig_mode: AUTO_RIG_MODES.TEMPLATE,
      humanoid_template_id: 'template',
      output_format: 'glb',
      model_preference: 'unirig_auto_rig',
    });
  });

  it('isTemplateRigMode detects template + UniRig', () => {
    expect(isTemplateRigMode('template', 'unirig_auto_rig')).toBe(true);
    expect(isTemplateRigMode('template', 'skintokens_auto_rig')).toBe(false);
  });

  it('getDefaultAutoRigOutputFormat returns glb for template mode', () => {
    expect(getDefaultAutoRigOutputFormat('unirig_auto_rig', 'template')).toBe('glb');
    expect(getDefaultAutoRigOutputFormat('unirig_auto_rig', 'skeleton')).toBe('fbx');
  });
});
