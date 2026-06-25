import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildXrHubEmbedUrl, getXrHubEmbedUrl, showXrAiPanel } from '../library/xrHubConfig.js';

describe('xrHubConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('buildXrHubEmbedUrl adds embed query param', () => {
    expect(buildXrHubEmbedUrl('https://example.com/hub/')).toContain('embed=1');
  });

  it('buildXrHubEmbedUrl forwards remoteLog when parent page has remoteLog=1', () => {
    vi.stubGlobal('window', {
      location: { search: '?remoteLog=1' },
      localStorage: { getItem: () => null },
    });
    expect(buildXrHubEmbedUrl('https://example.com/hub/')).toContain('remoteLog=1');
    vi.unstubAllGlobals();
  });

  it('uses VITE_XR_HUB_URL when set', () => {
    vi.stubEnv('VITE_XR_HUB_URL', 'https://hub.example.com:8443');
    expect(getXrHubEmbedUrl()).toBe('https://hub.example.com:8443/');
  });

  it('returns dev default Surface :8443 proxy when unset in DEV', () => {
    vi.stubEnv('VITE_XR_HUB_URL', '');
    if (!import.meta.env.DEV) return;
    expect(getXrHubEmbedUrl()).toBe('https://10.0.0.32:8443/');
    expect(showXrAiPanel()).toBe(true);
  });
});
