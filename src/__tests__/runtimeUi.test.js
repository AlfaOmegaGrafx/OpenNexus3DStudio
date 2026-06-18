import { describe, expect, it, vi, afterEach } from 'vitest';
import { formatApiEndpointForDisplay, isLikelyPrivateApiEndpoint, showApiStatusPanel } from '../library/runtimeUi';
describe('runtimeUi', () => {
  it('flags private hosts', () => {
    expect(isLikelyPrivateApiEndpoint('http://10.0.0.158:7842')).toBe(true);
    expect(isLikelyPrivateApiEndpoint('http://dgx-spark.local:7842')).toBe(true);
    expect(isLikelyPrivateApiEndpoint('https://api.example.com')).toBe(false);
  });

  it('labels empty endpoint', () => {
    expect(formatApiEndpointForDisplay('')).toBe('Not configured');
  });

  it('hides API panel on Vercel public demo flag', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_PUBLIC_DEMO', '1');
    expect(showApiStatusPanel()).toBe(false);
    vi.stubEnv('VITE_PUBLIC_DEMO', '');
    expect(showApiStatusPanel()).toBe(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});
