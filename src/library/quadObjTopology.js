/**
 * Quad-aware OBJ loader for retopology results.
 * Preserves quad edges in the viewport (Three.js OBJLoader triangulates diagonals).
 */
import * as THREE from './three.js';

function parseObjIndex(token, vertexCount) {
  const raw = String(token || '').split('/')[0];
  let index = parseInt(raw, 10);
  if (!Number.isFinite(index)) return null;
  if (index < 0) index = vertexCount + index + 1;
  return index - 1;
}

/**
 * @param {string} text
 * @returns {{ vertices: number[][], faces: number[][] }}
 */
export function parseObjQuadTopology(text) {
  const vertices = [];
  const faces = [];
  const lines = String(text || '').split(/\r?\n/);

  for (const line of lines) {
    if (line.startsWith('v ')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        vertices.push([
          Number(parts[1]),
          Number(parts[2]),
          Number(parts[3]),
        ]);
      }
      continue;
    }
    if (!line.startsWith('f ')) continue;

    const parts = line.trim().split(/\s+/).slice(1);
    const face = [];
    for (const token of parts) {
      const idx = parseObjIndex(token, vertices.length);
      if (idx != null && idx >= 0 && idx < vertices.length) {
        face.push(idx);
      }
    }
    if (face.length >= 3) faces.push(face);
  }

  return { vertices, faces };
}

function fanTriangulate(face) {
  if (face.length === 3) return [[face[0], face[1], face[2]]];
  const tris = [];
  for (let i = 1; i < face.length - 1; i += 1) {
    tris.push([face[0], face[i], face[i + 1]]);
  }
  return tris;
}

function collectUniqueEdges(faces) {
  const edges = [];
  const seen = new Set();
  for (const face of faces) {
    for (let i = 0; i < face.length; i += 1) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }
  return edges;
}

/**
 * @param {string} text
 * @param {{ color?: number, edgeColor?: number }} [options]
 * @returns {THREE.Group}
 */
export function buildQuadObjGroup(text, options = {}) {
  const { vertices, faces } = parseObjQuadTopology(text);
  if (!vertices.length || !faces.length) {
    throw new Error('OBJ has no usable quad/tri faces');
  }

  const positions = new Float32Array(vertices.length * 3);
  for (let i = 0; i < vertices.length; i += 1) {
    positions[i * 3] = vertices[i][0];
    positions[i * 3 + 1] = vertices[i][1];
    positions[i * 3 + 2] = vertices[i][2];
  }

  const triIndices = [];
  for (const face of faces) {
    for (const tri of fanTriangulate(face)) {
      triIndices.push(tri[0], tri[1], tri[2]);
    }
  }

  const solidGeometry = new THREE.BufferGeometry();
  solidGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  solidGeometry.setIndex(triIndices);
  solidGeometry.computeVertexNormals();

  const solidMaterial = new THREE.MeshStandardMaterial({
    color: options.color ?? 0xc8c8c8,
    metalness: 0.05,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });

  const solidMesh = new THREE.Mesh(solidGeometry, solidMaterial);
  solidMesh.name = 'quadTopologySolid';
  solidMesh.userData.isQuadTopologySolid = true;

  const edgePairs = collectUniqueEdges(faces);
  const edgePositions = new Float32Array(edgePairs.length * 6);
  for (let i = 0; i < edgePairs.length; i += 1) {
    const [a, b] = edgePairs[i];
    const va = vertices[a];
    const vb = vertices[b];
    const o = i * 6;
    edgePositions[o] = va[0];
    edgePositions[o + 1] = va[1];
    edgePositions[o + 2] = va[2];
    edgePositions[o + 3] = vb[0];
    edgePositions[o + 4] = vb[1];
    edgePositions[o + 5] = vb[2];
  }

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
  const lineMaterial = new THREE.LineBasicMaterial({
    color: options.edgeColor ?? 0x111111,
    transparent: true,
    opacity: 0.95,
    depthTest: true,
  });
  const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
  lineSegments.name = 'quadWireframeOverlay';
  lineSegments.userData.isQuadWireframeOverlay = true;

  const group = new THREE.Group();
  group.name = 'quadTopologyRoot';
  group.add(solidMesh);
  group.add(lineSegments);
  group.userData.hasQuadTopology = true;
  group.userData.quadFaceCount = faces.filter((f) => f.length === 4).length;
  group.userData.triangleFaceCount = faces.filter((f) => f.length === 3).length;
  return group;
}

/**
 * @param {string|File|Blob} source
 * @param {{ color?: number, edgeColor?: number }} [options]
 * @returns {Promise<THREE.Group>}
 */
export async function loadQuadObjFromSource(source, options = {}) {
  let text = '';
  if (typeof source === 'string') {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch OBJ (${response.status})`);
    }
    text = await response.text();
  } else if (source instanceof Blob) {
    text = await source.text();
  } else {
    throw new Error('Unsupported quad OBJ source');
  }
  return buildQuadObjGroup(text, options);
}
