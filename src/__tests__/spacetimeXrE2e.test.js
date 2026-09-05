import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  preflightSpacetimeFabricUrl,
  summarizeSpacetimeWalkSetup,
} from '../library/spacetimeXrE2e.js';
import * as THREE from 'three';
import { prepareSpacetimeWalkSurfaces } from '../library/spacetimeXrGroundFollow.js';

describe('spacetimeXrE2e', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preflightSpacetimeFabricUrl rejects HTTP errors with proxy hint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })),
    );
    await expect(
      preflightSpacetimeFabricUrl('https://10.0.0.32:8453/fabric/sneeze.msf?root=1'),
    ).rejects.toThrow(/8453/);
  });

  it('preflightSpacetimeFabricUrl accepts valid MSF JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ nodes: [{ id: 'n1' }] }),
      })),
    );
    const result = await preflightSpacetimeFabricUrl('https://example.com/fabric/a.msf');
    expect(result.ok).toBe(true);
    expect(result.nodeCount).toBe(1);
  });

  it('summarizeSpacetimeWalkSetup reports capsule collision readiness', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';
    capsule.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.2, 2),
        new THREE.MeshBasicMaterial(),
      ),
    );
    fabricRoot.add(capsule);
    const meshCount = prepareSpacetimeWalkSurfaces(fabricRoot);
    const summary = summarizeSpacetimeWalkSetup(fabricRoot, meshCount);
    expect(summary.capsuleFound).toBe(true);
    expect(summary.collisionReady).toBe(true);
    expect(summary.walkRootName).toBe('Hello World!');
  });
});
