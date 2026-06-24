import { describe, expect, it } from 'vitest';
import { buildXrHubEmbedUrl, getXrHubEmbedUrl, showXrAiPanel } from '../src/library/xrHubConfig.js';

describe('xrHubConfig', () => {
  it('buildXrHubEmbedUrl adds embed query param', () => {
    expect(buildXrHubEmbedUrl('https://example.com/hub/')).toContain('embed=1');
  });

  it('returns dev default hub when unset in DEV', () => {
    if (!import.meta.env.DEV) return;
    expect(getXrHubEmbedUrl()).toContain('dgx-spark');
    expect(showXrAiPanel()).toBe(true);
  });
});
