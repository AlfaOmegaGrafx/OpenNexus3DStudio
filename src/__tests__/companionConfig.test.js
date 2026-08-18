import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCompanionEmbedUrl,
  getCompanionBaseUrl,
  getCompanionLaunchUrl,
  isCompanionPublicDemo,
  useCompanionLiveEmbed,
} from '../library/companionConfig.public.js';

describe('companionConfig public stub', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not auto-build a live embed URL', () => {
    expect(buildCompanionEmbedUrl('http://127.0.0.1:5173/')).toBe('');
  });

  it('uses VITE_COMPANION_URL when set', () => {
    vi.stubEnv('VITE_COMPANION_URL', 'https://companion.example.com:8454');
    expect(getCompanionBaseUrl()).toBe('https://companion.example.com:8454/');
    expect(getCompanionLaunchUrl()).toBe('https://companion.example.com:8454/');
  });

  it('does not enable a live embed in the public build', () => {
    expect(useCompanionLiveEmbed()).toBe(false);
  });

  it('treats VITE_PUBLIC_DEMO as the public demo', () => {
    vi.stubEnv('VITE_PUBLIC_DEMO', '1');
    expect(isCompanionPublicDemo()).toBe(true);
  });
});
