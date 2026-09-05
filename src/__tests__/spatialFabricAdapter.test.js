import { describe, expect, it, vi } from 'vitest';
import {
  buildMetaverseBrowserUrl,
  buildSceneAssemblerOpenUrl,
  buildSpaceTimeBrowserDeepLink,
  buildSpaceTimeBrowserFabricUrl,
  buildSpaceTimeImmersivePageUrl,
  normalizeSpaceTimeFabricUrl,
  resolveBrowserReachableFabricUrl,
  canPublishTaskToSpatialFabric,
  deriveSceneAssemblerRootFromMsfUrl,
  formatSpatialFabricApiError,
  getOmbGuidelinesUrl,
  isFabricMsfFileUrl,
  isSceneAssemblerConfigured,
  mergeSpatialFabricConfig,
  normalizeOmbTier,
  getSyncSceneAssemblerUrl,
  openSpatialFabricInBrowser,
  preopenSpatialFabricTab,
  validateOmbTier,
} from '../library/spatialFabricAdapter.js';

describe('spatialFabricAdapter', () => {
  it('deriveSceneAssemblerRootFromMsfUrl strips fabric file path', () => {
    expect(
      deriveSceneAssemblerRootFromMsfUrl('https://dgx-spark.tail6121eb.ts.net/fabric/sample.msf'),
    ).toBe('https://dgx-spark.tail6121eb.ts.net');
  });

  it('buildSceneAssemblerOpenUrl never returns raw .msf', () => {
    const url = buildSceneAssemblerOpenUrl({
      fabricMsfUrl: 'https://example.com/fabric/demo.msf',
    });
    expect(url).toBe('https://example.com');
    expect(isFabricMsfFileUrl(url)).toBe(false);
  });

  it('mergeSpatialFabricConfig derives public URL from fabric when missing', () => {
    vi.stubEnv('VITE_MSF_PUBLIC_URL', '');
    vi.stubEnv('VITE_RP1_FABRIC_MSF_URL', '');
    const merged = mergeSpatialFabricConfig({
      enabled: true,
      fabric_msf_url: 'https://dgx.example.com/fabric/sample.msf',
    });
    expect(merged.msfPublicUrl).toBe('https://dgx.example.com');
    expect(merged.fabricMsfUrl).toBe('https://dgx.example.com/fabric/sample.msf');
  });

  it('buildSceneAssemblerOpenUrl prefers browser env over API Tailscale URL', () => {
    const url = buildSceneAssemblerOpenUrl(
      { msfPublicUrl: 'https://10.0.0.32:8453' },
      { sceneAssemblerUrl: 'https://dgx-spark.tail6121eb.ts.net/' },
    );
    expect(url).toBe('https://10.0.0.32:8453');
  });

  it('openSpatialFabricInBrowser uses preopened tab after async publish', () => {
    const replace = vi.fn();
    const tab = { closed: false, location: { replace, href: 'about:blank' }, focus: vi.fn() };
    openSpatialFabricInBrowser('https://10.0.0.32:8453', tab);
    expect(replace).toHaveBeenCalledWith('https://10.0.0.32:8453');
  });

  it('preopenSpatialFabricTab opens Scene Assembler URL on click', () => {
    const open = vi.fn(() => ({ closed: false }));
    vi.stubGlobal('window', { open });
    preopenSpatialFabricTab('https://10.0.0.32:8453');
    expect(open).toHaveBeenCalledWith('https://10.0.0.32:8453', '_blank');
  });

  it('openSpatialFabricInBrowser does not hijack current tab when preopened tab exists', () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign }, open: vi.fn(() => null) });
    const tabLocation = {
      href: '',
      replace: vi.fn(() => {
        throw new Error('blocked');
      }),
    };
    Object.defineProperty(tabLocation, 'href', {
      get: () => '',
      set: () => {
        throw new Error('blocked');
      },
    });
    const tab = { closed: false, location: tabLocation, focus: vi.fn() };
    expect(() => openSpatialFabricInBrowser('https://10.0.0.32:8453', tab)).toThrow(/did not open automatically/);
    expect(assign).not.toHaveBeenCalled();
  });

  it('getSyncSceneAssemblerUrl reads VITE_MSF_PUBLIC_URL', () => {
    vi.stubEnv('VITE_MSF_PUBLIC_URL', 'https://10.0.0.32:8453');
    expect(getSyncSceneAssemblerUrl()).toBe('https://10.0.0.32:8453');
  });

  it('normalizeOmbTier maps API snake_case', () => {
    const norm = normalizeOmbTier({ recommended_tier: 2, label: 'Tier 2 Medium' });
    expect(norm.recommendedTier).toBe(2);
    expect(norm.label).toBe('Tier 2 Medium');
  });

  it('validateOmbTier assigns tier from triangle count', () => {
    const tier = validateOmbTier({ triangles: 1000, textureMaxDimension: 64 });
    expect(tier.recommendedTier).toBeGreaterThanOrEqual(1);
    expect(tier.label).toBeTruthy();
  });

  it('buildSpaceTimeBrowserDeepLink encodes fabric URL', () => {
    vi.stubEnv('VITE_RP1_FABRIC_MSF_URL', 'https://host.test/fabric/sneeze.msf');
    const fabric = buildSpaceTimeBrowserFabricUrl({});
    expect(fabric).toContain('sneeze.msf');
    expect(fabric).toContain('root=1');
    const link = buildSpaceTimeBrowserDeepLink(fabric);
    expect(link).toMatch(/^spacetime:\/\/fabric\?url=/);
  });

  it('buildSpaceTimeImmersivePageUrl includes nativeFaceRelay and fabricUrl', () => {
    vi.stubEnv('VITE_RP1_FABRIC_MSF_URL', 'https://host.test:8453/fabric/sneeze.msf');
    const url = buildSpaceTimeImmersivePageUrl({}, { origin: 'https://surface.test:3000' });
    expect(url).toContain('/spacetime-xr?');
    expect(url).toContain('nativeFaceRelay=1');
    expect(url).toContain('fabricUrl=');
    expect(url).toContain('sneeze.msf');
  });

  it('resolveBrowserReachableFabricUrl rewrites Tailscale fabric to Surface MSF proxy', () => {
    const fabric = resolveBrowserReachableFabricUrl(
      'https://dgx-spark.tail6121eb.ts.net:8443/fabric/sneeze.msf?root=1',
      {},
      { publicBase: 'https://10.0.0.32:8453' },
    );
    expect(fabric).toBe('https://10.0.0.32:8453/fabric/sneeze.msf?root=1');
  });

  it('buildSpaceTimeImmersivePageUrl rewrites API Tailscale fabric to env MSF proxy', () => {
    vi.stubEnv('VITE_MSF_PUBLIC_URL', 'https://10.0.0.32:8453');
    vi.stubEnv('VITE_RP1_FABRIC_MSF_URL', '');
    const url = buildSpaceTimeImmersivePageUrl(
      { fabric_msf_url: 'https://dgx-spark.tail6121eb.ts.net:8443/fabric/sneeze.msf?root=1' },
      { origin: 'https://10.0.0.32:3000' },
    );
    expect(url).toContain(encodeURIComponent('https://10.0.0.32:8453/fabric/sneeze.msf?root=1'));
  });

  it('buildSpaceTimeBrowserFabricUrl defaults to sneeze.msf from public base', () => {
    vi.stubEnv('VITE_RP1_FABRIC_MSF_URL', '');
    vi.stubEnv('VITE_MSF_PUBLIC_URL', '');
    const fabric = buildSpaceTimeBrowserFabricUrl({
      public_base_url: 'https://host.test:8443',
    });
    expect(fabric).toBe('https://host.test:8443/fabric/sneeze.msf?root=1');
  });

  it('buildSpaceTimeBrowserFabricUrl rewrites legacy sample.msf to sneeze.msf', () => {
    vi.stubEnv('VITE_RP1_FABRIC_MSF_URL', '');
    vi.stubEnv('VITE_MSF_PUBLIC_URL', '');
    const fabric = buildSpaceTimeBrowserFabricUrl({
      fabricMsfUrl: 'https://dgx.test/fabric/sample.msf',
    });
    expect(fabric).toBe('https://dgx.test/fabric/sneeze.msf?root=1');
  });

  it('normalizeSpaceTimeFabricUrl preserves explicit root', () => {
    const fabric = normalizeSpaceTimeFabricUrl(
      'https://dgx.test/fabric/sneeze.msf?root=3',
      { rootIx: 1 },
    );
    expect(fabric).toBe('https://dgx.test/fabric/sneeze.msf?root=3');
  });

  it('buildMetaverseBrowserUrl falls back to OMB guidelines when MSF URL unset', () => {
    const url = buildSceneAssemblerOpenUrl({});
    expect(url).toBe('');
    expect(getOmbGuidelinesUrl({})).toContain('omb.wiki');
  });

  it('isSceneAssemblerConfigured is false without MSF URL', () => {
    expect(isSceneAssemblerConfigured({})).toBe(false);
    expect(isSceneAssemblerConfigured(null)).toBe(false);
    expect(
      isSceneAssemblerConfigured({
        fabricMsfUrl: 'https://example.com/fabric/demo.msf',
      }),
    ).toBe(true);
  });

  it('formatSpatialFabricApiError maps job-not-found 404', () => {
    const msg = formatSpatialFabricApiError(
      { status: 404 },
      { detail: 'Job not found' },
      'Publish to spatial fabric',
    );
    expect(msg).toContain('job not found on 3DAIGC-API');
    expect(msg).not.toContain('spatial-fabric API not loaded');
  });

  it('canPublishTaskToSpatialFabric rejects splat/ply mesh paths', () => {
    const task = { status: 'completed' };
    expect(
      canPublishTaskToSpatialFabric(task, {}, {
        hasMesh: true,
        meshUrl: '/home/sifr/outputs/worlds/job/environment.ply',
      }),
    ).toBe(false);
    expect(
      canPublishTaskToSpatialFabric(task, {}, {
        hasMesh: true,
        meshUrl: '/api/v1/system/jobs/x/download?asset=model.glb',
        isFullWorld: true,
      }),
    ).toBe(false);
    expect(
      canPublishTaskToSpatialFabric(task, {}, {
        hasMesh: true,
        meshUrl: '/api/v1/system/jobs/x/download',
      }),
    ).toBe(true);
  });
});
