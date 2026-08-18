import { describe, expect, it } from 'vitest';
import {
  COMPANION_HANDOFF_SCHEMA,
  captureCompanionHandoffFromScene,
  createCompanionHandoff,
  parseCompanionHandoffFromLocation,
  toCompanionCharacterExtension,
} from '../library/companionHandoff.public.js';

describe('companionHandoff public stub', () => {
  it('createCompanionHandoff sets schema and version', () => {
    const handoff = createCompanionHandoff();
    expect(handoff.schema).toBe(COMPANION_HANDOFF_SCHEMA);
    expect(handoff.version).toBe(1);
    expect(handoff.exportedAt).toBeTruthy();
  });

  it('does not parse live query-string handoff in the public stub', () => {
    const parsed = parseCompanionHandoffFromLocation({
      search: '?vrm=https%3A%2F%2Fexample.com%2Fa.vrm&role=cheerful%20guide',
    });
    expect(parsed).toBeNull();
  });

  it('captureCompanionHandoffFromScene returns a viewport stub', () => {
    const handoff = captureCompanionHandoffFromScene({
      lastLoadedSource: 'https://example.com/avatar.vrm',
      currentVRM: { meta: { title: 'Luna', author: 'User' } },
    });
    expect(handoff.source).toBe('viewport');
    expect(handoff.vrm).toBeUndefined();
  });

  it('toCompanionCharacterExtension is a schema-only stub', () => {
    const ext = toCompanionCharacterExtension(
      createCompanionHandoff({
        vrm: { source: 'url', url: 'https://example.com/a.vrm' },
        personalityContext: { rolePrompt: 'friendly host', title: 'Host' },
      }),
    );
    expect(ext.opennexus3d.handoffSchema).toBe(COMPANION_HANDOFF_SCHEMA);
    expect(ext.modules).toEqual({});
    expect(ext.agents).toEqual({});
  });
});
