import { describe, expect, it } from 'vitest';
import {
  STUDIO_OUTPUT_PREFIX,
  buildStudioObjectName,
  formatStudioTaskCardTitle,
  isStudioOutputName,
  studioTemplateCode,
  studioUtcStamp,
} from '../library/studioOutputId.js';
import { studioClothingObjectName, studioTaskScopeOptions } from '../library/studioGraph.js';

describe('studioOutputId', () => {
  it('builds wipe-friendly studio_ names with template code + UTC stamp', () => {
    const when = new Date(Date.UTC(2026, 8, 6, 21, 22, 0));
    const name = buildStudioObjectName({
      templateId: 'krea_composable_avatar_body',
      projectName: 'Krea composable body',
      role: 'body',
      when,
    });
    expect(name.startsWith(STUDIO_OUTPUT_PREFIX)).toBe(true);
    expect(name).toContain('studio_bc_20260906T2122_');
    expect(isStudioOutputName(name)).toBe(true);
    expect(studioTemplateCode('krea_trellis_multiview')).toBe('mv');
    expect(studioUtcStamp(when)).toBe('20260906T2122');
  });

  it('stamps job_origin studio on task scope', () => {
    const scope = studioTaskScopeOptions({
      id: 'proj1',
      templateId: 'krea_composable_avatar_body',
      data: { studioWorkspaceId: 'ws1' },
    });
    expect(scope.job_origin).toBe('studio');
    expect(scope.studio_template_id).toBe('krea_composable_avatar_body');
    expect(scope.studio_workspace_id).toBe('ws1');
  });

  it('clothing object names stay under studio_ prefix', () => {
    const name = studioClothingObjectName(
      { templateId: 'krea_composable_avatar_body', name: 'Job 1' },
      { object_name: 'navy_hoodie', appearance_slot: 'Chest' },
      0,
    );
    expect(isStudioOutputName(name)).toBe(true);
    expect(name).toContain('studio_bc_');
  });

  it('formats compact card titles for long studio_ ids', () => {
    expect(
      formatStudioTaskCardTitle('studio_bc_20260907T0449_Krea_composable_body'),
    ).toBe('Body+Cloth · Krea composable body');
    expect(formatStudioTaskCardTitle('plain mesh')).toBe('plain mesh');
  });
});
