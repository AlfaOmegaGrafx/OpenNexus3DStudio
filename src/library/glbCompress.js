/**
 * Browser GLB compression — Draco geometry, optional Meshopt simplify, WebP textures.
 * Pipeline adapted from glb-shrink (MIT).
 */
import { NodeIO } from '@gltf-transform/core';
import {
  KHRDracoMeshCompression,
  KHRMeshQuantization,
  ALL_EXTENSIONS,
} from '@gltf-transform/extensions';
import {
  weld,
  simplify,
  textureCompress,
  prune,
  dedup,
  draco,
} from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import {
  formatByteSize,
  getCompressHint,
  resolveCompressProfile,
} from './glbCompressPresets.js';

let ioPromise;
let plainIoPromise;
let simplifierReadyPromise;

/** Full IO with Draco + meshopt (needed for compress/export). May fail if .wasm MIME is wrong in Vite. */
async function getIO() {
  if (!ioPromise) {
    ioPromise = (async () => {
      await MeshoptDecoder.ready;
      await MeshoptEncoder.ready;
      await MeshoptSimplifier.ready;
      return new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
          'draco3d.decoder': await draco3d.createDecoderModule(),
          'draco3d.encoder': await draco3d.createEncoderModule(),
          'meshopt.decoder': MeshoptDecoder,
          'meshopt.encoder': MeshoptEncoder,
        });
    })();
  }
  return ioPromise;
}

/** Plain NodeIO — no WASM fetches. Enough for uncompressed AIGC GLBs. */
async function getPlainIO() {
  if (!plainIoPromise) {
    plainIoPromise = Promise.resolve(new NodeIO());
  }
  return plainIoPromise;
}

/** MeshoptSimplifier embeds WASM in JS — no separate .wasm fetch. */
async function ensureSimplifierReady() {
  if (!simplifierReadyPromise) {
    simplifierReadyPromise = MeshoptSimplifier.ready;
  }
  await simplifierReadyPromise;
}

function countTriangles(root) {
  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (indices) tris += Math.floor(indices.getCount() / 3);
    }
  }
  return tris;
}

function countVertices(root) {
  let verts = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      if (position) verts += position.getCount();
    }
  }
  return verts;
}

/**
 * Meshopt simplify ratio from current mesh stats (recompute each pass — verts lag behind tris).
 */
export function computeApiUploadSimplifyRatio(
  vertexCount,
  triangleCount,
  maxVertices,
  maxFaces,
  headroom = 0.85,
) {
  const v = Math.max(1, Number(vertexCount) || 1);
  const t = Math.max(1, Number(triangleCount) || 1);
  const maxV = Math.max(1, Number(maxVertices) || 1);
  const maxF = Math.max(1, Number(maxFaces) || 1);
  const byVerts = (maxV * headroom) / v;
  const byFaces = (maxF * headroom) / t;
  return Math.min(1, byVerts, byFaces);
}

export function documentNeedsSafeMode(root) {
  for (const mesh of root.listMeshes()) {
    if (typeof mesh.listTargets === 'function' && mesh.listTargets().length > 0) {
      return true;
    }
    for (const prim of mesh.listPrimitives()) {
      if (typeof prim.listTargets === 'function' && prim.listTargets().length > 0) {
        return true;
      }
      if (prim.getAttribute('JOINTS_0') || prim.getAttribute('WEIGHTS_0')) {
        return true;
      }
    }
  }
  return false;
}

function stripMeshAttributesExcept(root, keepSemantics) {
  const keep = new Set(keepSemantics);
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const semantics = prim.listSemantics?.() || [];
      for (const sem of semantics) {
        if (!keep.has(sem)) prim.setAttribute(sem, null);
      }
    }
  }
}

async function runSimplifyPass(doc, root, options) {
  const {
    ratio,
    error,
    weldTolerance = 0.001,
    preserveTextures = false,
  } = options;
  await doc.transform(
    weld({ tolerance: weldTolerance }),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio,
      error,
      lockBorder: false,
    }),
    weld({ tolerance: weldTolerance }),
    dedup(),
    prune({ keepAttributes: preserveTextures }),
  );
  if (!preserveTextures) {
    rebakeSmoothNormals(doc, root);
  }
}

function rebakeSmoothNormals(doc, root) {
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      const indices = prim.getIndices();
      if (!position || !indices) continue;

      const posArr = position.getArray();
      const idxArr = indices.getArray();
      if (!posArr || !idxArr) continue;

      const vCount = position.getCount();
      const normals = new Float32Array(vCount * 3);

      for (let t = 0; t < idxArr.length; t += 3) {
        const a = idxArr[t];
        const b = idxArr[t + 1];
        const c = idxArr[t + 2];

        const ax = posArr[a * 3];
        const ay = posArr[a * 3 + 1];
        const az = posArr[a * 3 + 2];
        const bx = posArr[b * 3];
        const by = posArr[b * 3 + 1];
        const bz = posArr[b * 3 + 2];
        const cx = posArr[c * 3];
        const cy = posArr[c * 3 + 1];
        const cz = posArr[c * 3 + 2];

        const abx = bx - ax;
        const aby = by - ay;
        const abz = bz - az;
        const acx = cx - ax;
        const acy = cy - ay;
        const acz = cz - az;

        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;

        normals[a * 3] += nx;
        normals[a * 3 + 1] += ny;
        normals[a * 3 + 2] += nz;
        normals[b * 3] += nx;
        normals[b * 3 + 1] += ny;
        normals[b * 3 + 2] += nz;
        normals[c * 3] += nx;
        normals[c * 3 + 1] += ny;
        normals[c * 3 + 2] += nz;
      }

      for (let i = 0; i < vCount; i++) {
        const nx = normals[i * 3];
        const ny = normals[i * 3 + 1];
        const nz = normals[i * 3 + 2];
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 1e-8) {
          normals[i * 3] = nx / len;
          normals[i * 3 + 1] = ny / len;
          normals[i * 3 + 2] = nz / len;
        } else {
          normals[i * 3] = 0;
          normals[i * 3 + 1] = 1;
          normals[i * 3 + 2] = 0;
        }
      }

      const existingNormal = prim.getAttribute('NORMAL');
      if (existingNormal) {
        existingNormal.setArray(normals).setType('VEC3').setNormalized(false);
      } else {
        const accessor = doc.createAccessor().setArray(normals).setType('VEC3');
        prim.setAttribute('NORMAL', accessor);
      }
    }
  }
}

async function canvasWebpEncoder(buffer, mimeType) {
  const supported =
    mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp';
  if (!supported || typeof document === 'undefined') {
    return buffer;
  }

  const blob = new Blob([buffer], { type: mimeType });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const webpBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('WebP encode failed'))),
      'image/webp',
      0.75,
    );
  });

  return new Uint8Array(await webpBlob.arrayBuffer());
}

/**
 * Ensure a GLB fits 3DAIGC-API mesh upload limits (MAX_MESH_VERTICES / MAX_MESH_FACES).
 * Decimates with Meshopt when over cap. Writes plain GLB (no Draco) for trimesh loaders.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {Object} [options]
 * @param {number} [options.maxVertices]
 * @param {number} [options.maxFaces]
 * @param {boolean} [options.preserveTextures] Keep TEXCOORD + materials for SkinTokens texture transfer
 * @param {boolean} [options.allowPositionOnlyFallback] Strip UVs as last resort (default true)
 * @returns {Promise<{ buffer: ArrayBuffer, stats: Object }>}
 */
export async function prepareGlbForApiUpload(arrayBuffer, options = {}) {
  const maxVertices = options.maxVertices ?? 210000;
  const maxFaces = options.maxFaces ?? 210000;
  const preserveTextures = options.preserveTextures === true;
  const allowPositionOnlyFallback = options.allowPositionOnlyFallback !== false;
  const beforeBytes = arrayBuffer.byteLength;
  // Avoid Draco/meshopt decoder WASM (Vite often serves HTML for those .wasm URLs).
  // MeshoptSimplifier embeds its WASM; plain NodeIO is enough for typical AIGC GLBs.
  const io = await getPlainIO();
  const doc = await io.readBinary(new Uint8Array(arrayBuffer));
  const root = doc.getRoot();

  for (const ext of [...root.listExtensionsUsed()]) {
    const name = ext.extensionName;
    if (
      name === KHRDracoMeshCompression.EXTENSION_NAME ||
      name === KHRMeshQuantization.EXTENSION_NAME ||
      name === 'EXT_meshopt_compression'
    ) {
      ext.dispose();
    }
  }

  const sourceVerts = countVertices(root);
  const sourceTris = countTriangles(root);
  if (sourceVerts <= maxVertices && sourceTris <= maxFaces) {
    return {
      buffer: arrayBuffer,
      stats: {
        decimated: false,
        beforeBytes,
        afterBytes: beforeBytes,
        sourceVerts,
        sourceTris,
        verts: sourceVerts,
        tris: sourceTris,
      },
    };
  }

  if (documentNeedsSafeMode(root)) {
    throw new Error(
      `Mesh has ${sourceVerts} vertices / ${sourceTris} faces (API max ${maxVertices}/${maxFaces}), ` +
        'but it is already skinned — cannot auto-decimate. Export a lower-poly mesh or re-generate with a lower decimation target.',
    );
  }

  await ensureSimplifierReady();

  if (preserveTextures) {
    // Normals/tangents multiply unique verts; drop them before simplify while keeping UVs.
    stripMeshAttributesExcept(root, ['POSITION', 'TEXCOORD_0', 'TEXCOORD']);
  }

  let verts = sourceVerts;
  let tris = sourceTris;
  let attempts = 0;
  const maxAttempts = 25;
  let lastVerts = verts;
  let lastTris = tris;

  while ((verts > maxVertices || tris > maxFaces) && attempts < maxAttempts) {
    attempts += 1;
    let ratio = computeApiUploadSimplifyRatio(verts, tris, maxVertices, maxFaces);
    // Meshopt ratio tracks triangles; verts often stay high — bias down when verts are over.
    if (verts > maxVertices) {
      // Stronger bias because we sometimes see faces under cap while verts are still over.
      ratio = Math.min(ratio, ((maxVertices * 0.6) / verts) * 0.8);
    }
    if (tris > maxFaces) {
      ratio = Math.min(ratio, ((maxFaces * 0.6) / tris) * 0.8);
    }

    ratio = Math.max(0.01, Math.min(ratio, 0.999));
    // If we’re not improving at all, stop early to avoid a long no-op loop.
    if (
      verts >= lastVerts &&
      tris >= lastTris &&
      attempts >= 4 &&
      ratio >= 0.85
    ) {
      break;
    }
    lastVerts = verts;
    lastTris = tris;

    // Higher error ceiling tends to collapse vertex-heavy meshes more effectively.
    const simplifyError = preserveTextures
      ? Math.min(1, 0.12 + attempts * 0.06)
      : Math.min(0.28, 0.06 + attempts * 0.03);
    const weldTolerance = preserveTextures
      ? Math.min(0.08, 0.001 * 1.45 ** (attempts - 1))
      : 0.001;
    await doc.transform(
      weld({ tolerance: weldTolerance }),
      simplify({
        simplifier: MeshoptSimplifier,
        ratio,
        error: simplifyError,
        lockBorder: false,
      }),
      weld({ tolerance: weldTolerance }),
      dedup(),
      prune({ keepAttributes: preserveTextures }),
    );
    if (!preserveTextures) {
      rebakeSmoothNormals(doc, root);
    }
    verts = countVertices(root);
    tris = countTriangles(root);
  }

  if (verts > maxVertices || tris > maxFaces) {
    // UV-preserving fallback: drop normals/tangents/skin attrs so welds collapse UV splits.
    if (preserveTextures || !allowPositionOnlyFallback) {
      const weldTolerances = [0.005, 0.01, 0.02, 0.04, 0.08, 0.12];
      for (const weldTolerance of weldTolerances) {
        stripMeshAttributesExcept(root, ['POSITION', 'TEXCOORD_0', 'TEXCOORD']);
        const ratio = computeApiUploadSimplifyRatio(verts, tris, maxVertices, maxFaces, 0.75);
        await runSimplifyPass(doc, root, {
          ratio: Math.max(0.05, ratio),
          error: 1,
          weldTolerance,
          preserveTextures: true,
        });
        verts = countVertices(root);
        tris = countTriangles(root);
        if (verts <= maxVertices && tris <= maxFaces) break;
      }
    }

    if ((verts > maxVertices || tris > maxFaces) && allowPositionOnlyFallback && !preserveTextures) {
      // Last resort for non-rig uploads: POSITION-only simplify.
      try {
        stripMeshAttributesExcept(root, ['POSITION']);

        await runSimplifyPass(doc, root, {
          ratio: 0.2,
          error: 1,
          weldTolerance: 0.001,
          preserveTextures: false,
        });

        verts = countVertices(root);
        tris = countTriangles(root);
      } catch {
        // ignore; we'll throw the original error below
      }
    }

    if (verts > maxVertices || tris > maxFaces) {
      const rigHint = preserveTextures
        ? ' For auto-rigging, re-run Image-to-3D with decimation target ≤210k faces (the API upload cap; Avatar from Image / defaults do this automatically). Prefer Mesh Decimate over Instant Meshes on characters — Instant Meshes often leaves holes in capes, fingers, and thin geometry.'
        : '';
      throw new Error(
        `Could not decimate mesh under API limits (still ${verts} verts / ${tris} faces; max ${maxVertices}/${maxFaces}).${rigHint}`,
      );
    }
  }

  const output = await io.writeBinary(doc);
  const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);

  return {
    buffer,
    stats: {
      decimated: true,
      beforeBytes,
      afterBytes: buffer.byteLength,
      sourceVerts,
      sourceTris,
      verts,
      tris,
      attempts,
      beforeLabel: formatByteSize(beforeBytes),
      afterLabel: formatByteSize(buffer.byteLength),
    },
  };
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {Object} options
 * @param {number} [options.quality] 0–100
 * @param {'smallest'|'balanced'|'sharpest'|'safe'} [options.preset]
 * @param {boolean} [options.includeTextures]
 */
export async function compressGlbBuffer(arrayBuffer, options = {}) {
  const beforeBytes = arrayBuffer.byteLength;
  const profile = resolveCompressProfile(options);
  const io = await getIO();
  const doc = await io.readBinary(new Uint8Array(arrayBuffer));
  const root = doc.getRoot();

  for (const ext of [...root.listExtensionsUsed()]) {
    const name = ext.extensionName;
    if (
      name === KHRDracoMeshCompression.EXTENSION_NAME ||
      name === KHRMeshQuantization.EXTENSION_NAME ||
      name === 'EXT_meshopt_compression'
    ) {
      ext.dispose();
    }
  }

  const sourceTris = countTriangles(root);
  const safeMode = options.safeMode ?? documentNeedsSafeMode(root);
  let simplifyRatio = profile.simplifyRatio ?? 0.008;
  if (profile.targetMaxTriangles > 0 && sourceTris > 0) {
    simplifyRatio = Math.min(simplifyRatio, profile.targetMaxTriangles / sourceTris);
  }
  const simplifyEnabled =
    profile.simplify !== false && simplifyRatio > 0 && !safeMode;

  const transforms = [weld({})];
  if (simplifyEnabled) {
    transforms.push(
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: simplifyRatio,
        error: profile.simplifyError,
        lockBorder: false,
      }),
    );
  }
  transforms.push(dedup(), prune({ keepAttributes: false }));
  await doc.transform(...transforms);

  if (simplifyEnabled) {
    rebakeSmoothNormals(doc, root);
  }

  if (options.includeTextures !== false && profile.textureEdge > 0) {
    await doc.transform(
      textureCompress({
        encoder: canvasWebpEncoder,
        targetFormat: 'webp',
        resize: [profile.textureEdge, profile.textureEdge],
      }),
    );
  }

  await doc.transform(
    prune(),
    dedup(),
    draco({
      method: 'edgebreaker',
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeGeneric: 12,
    }),
  );

  const output = await io.writeBinary(doc);
  const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
  const finalTris = countTriangles(doc.getRoot());
  const afterBytes = buffer.byteLength;

  return {
    buffer,
    stats: {
      beforeBytes,
      afterBytes,
      sourceTris,
      finalTris,
      safeMode,
      simplifyApplied: simplifyEnabled,
      savingsPercent: beforeBytes > 0 ? Math.round((1 - afterBytes / beforeBytes) * 100) : 0,
      hint: safeMode
        ? 'Rig detected — geometry simplification skipped; Draco + textures only.'
        : getCompressHint(profile.quality),
      beforeLabel: formatByteSize(beforeBytes),
      afterLabel: formatByteSize(afterBytes),
    },
  };
}

export { formatByteSize, getCompressHint, resolveCompressProfile };
