import { describe, it, expect } from 'vitest';
import {
  normalizeObjectName,
  slugifyObjectName,
  buildTaskDisplayName,
  resolveObjectNameFromJob,
  objectNameFromFilename,
  requireObjectNameFromOptions,
} from '../library/objectNameUtils.js';

describe('objectNameUtils', () => {
  it('normalizeObjectName trims and caps length', () => {
    expect(normalizeObjectName('  Dragon   Knight  ')).toBe('Dragon Knight');
    expect(normalizeObjectName('')).toBeNull();
    expect(normalizeObjectName('x'.repeat(80))?.length).toBe(64);
  });

  it('slugifyObjectName produces RP1-safe stems', () => {
    expect(slugifyObjectName('Dragon Knight')).toBe('Dragon_Knight');
  });

  it('buildTaskDisplayName prefers object name', () => {
    expect(buildTaskDisplayName('image-to-3d', 'Desk Lamp', 'ignored')).toBe('Desk Lamp');
  });

  it('resolveObjectNameFromJob reads inputs and metadata', () => {
    expect(
      resolveObjectNameFromJob({
        inputs: { object_name: 'Hero' },
        metadata: {},
      }),
    ).toBe('Hero');
    expect(
      resolveObjectNameFromJob({
        inputs: { world_name: 'Bedroom' },
        metadata: {},
      }),
    ).toBe('Bedroom');
  });

  it('objectNameFromFilename strips extension', () => {
    expect(objectNameFromFilename('dragon_knight.png')).toBe('dragon knight');
  });

  it('requireObjectNameFromOptions throws when missing', () => {
    expect(() => requireObjectNameFromOptions({})).toThrow(/required/i);
    expect(requireObjectNameFromOptions({ object_name: ' Hero ' })).toBe('Hero');
  });
});
