import { describe, expect, it } from 'vitest';
import { buildQuadObjGroup, parseObjQuadTopology } from '../library/quadObjTopology.js';

describe('quadObjTopology', () => {
  it('parses quad and triangle faces from OBJ text', () => {
    const text = `
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0.5 0.5 1
f 1 2 3 4
f 1 2 5
`;
    const parsed = parseObjQuadTopology(text);
    expect(parsed.vertices).toHaveLength(5);
    expect(parsed.faces).toHaveLength(2);
    expect(parsed.faces[0]).toHaveLength(4);
    expect(parsed.faces[1]).toHaveLength(3);
  });

  it('builds a group with solid mesh and quad wireframe overlay', () => {
    const text = `
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
f 1 2 3 4
`;
    const group = buildQuadObjGroup(text);
    expect(group.userData.hasQuadTopology).toBe(true);
    expect(group.userData.quadFaceCount).toBe(1);

    let solid = null;
    let overlay = null;
    group.traverse((child) => {
      if (child.userData?.isQuadTopologySolid) solid = child;
      if (child.userData?.isQuadWireframeOverlay) overlay = child;
    });
    expect(solid).toBeTruthy();
    expect(overlay).toBeTruthy();
    expect(solid.geometry.index.count).toBe(6);
    expect(overlay.geometry.attributes.position.count).toBe(8);
  });
});
