#!/usr/bin/env node
/**
 * HTTPS proxy for NVIDIA Grounding DINO zero-shot detection.
 * Keeps NGC_API_KEY server-side; browser sends JPEG base64 + text prompt.
 *
 * Pattern mirrors Unity-MetaXR-AI-ZeroShot (asset upload → invoke → poll → ZIP JSON).
 * @see https://github.com/lucas-martinic/Unity-MetaXR-AI-ZeroShot
 *
 * POST https://0.0.0.0:8456/api/grounding-dino
 * Body: { imageBase64, prompt, threshold? }
 */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_DIR = process.env.GROUNDING_DINO_PROXY_CERT_DIR || path.resolve(__dirname, '../certs');
const LISTEN_PORT = Number(process.env.GROUNDING_DINO_PROXY_PORT || 8456);
const API_KEY = String(process.env.NGC_API_KEY || process.env.NVIDIA_API_KEY || '').trim();

const INVOKE_URL = 'https://ai.api.nvidia.com/v1/cv/nvidia/nv-grounding-dino';
const ASSET_URL = 'https://api.nvcf.nvidia.com/v2/nvcf/assets';
const POLL_BASE = 'https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/';

const keyPath = path.join(CERT_DIR, 'localhost-key.pem');
const certPath = path.join(CERT_DIR, 'localhost.pem');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function nvidiaFetch(url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, { method, headers, body });
  return res;
}

async function getAssetUploadUrl() {
  const res = await nvidiaFetch(ASSET_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contentType: 'image/jpeg', description: 'OpenNexus GroundingDINO' }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asset URL failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function uploadAsset(uploadUrl, imageBytes) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/jpeg',
      'x-amz-meta-nvcf-asset-description': 'OpenNexus GroundingDINO',
    },
    body: imageBytes,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asset upload failed (${res.status}): ${text}`);
  }
}

async function invokeModel(assetId, prompt, threshold) {
  const payload = {
    model: 'Grounding-Dino',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'media_url', media_url: { url: `data:image/jpeg;asset_id,${assetId}` } },
      ],
    }],
    threshold,
  };
  const res = await nvidiaFetch(INVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/zip',
      'Content-Type': 'application/json',
      'NVCF-INPUT-ASSET-REFERENCES': assetId,
      'NVCF-FUNCTION-ASSET-IDS': assetId,
    },
    body: JSON.stringify(payload),
  });
  return res;
}

async function pollResult(requestId, maxRetries = 20, intervalMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await nvidiaFetch(`${POLL_BASE}${requestId}`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/zip',
      },
    });
    if (res.status === 200)
      return Buffer.from(await res.arrayBuffer());
    if (res.status !== 202) {
      const text = await res.text();
      throw new Error(`Poll failed (${res.status}): ${text}`);
    }
  }
  throw new Error('Grounding DINO polling timed out');
}

function parseZipResponse(zipBuffer) {
  const entries = unzipSync(new Uint8Array(zipBuffer));
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('.response')) {
      const json = JSON.parse(new TextDecoder().decode(data));
      return parseGroundingDinoJson(json);
    }
  }
  throw new Error('No .response file in Grounding DINO ZIP');
}

function parseGroundingDinoJson(json) {
  const content = json?.choices?.[0]?.message?.content;
  const frameW = content?.frameWidth || 1;
  const frameH = content?.frameHeight || 1;
  /** @type {Array<{ phrase: string, label: string, confidence: number, bbox: number[], bboxNormalized: number[] }>} */
  const detections = [];
  for (const group of content?.boundingBoxes || []) {
    const phrase = group.phrase || 'object';
    for (let i = 0; i < (group.bboxes?.length || 0); i++) {
      const bbox = group.bboxes[i];
      if (!bbox || bbox.length < 4) continue;
      const conf = group.confidence?.[i] ?? 1;
      const [x, y, w, h] = bbox;
      detections.push({
        phrase,
        label: phrase,
        confidence: conf,
        bbox: [x, y, w, h],
        bboxNormalized: [x / frameW, y / frameH, (x + w) / frameW, (y + h) / frameH],
      });
    }
  }
  return {
    detections,
    summary: content?.message || '',
    frameWidth: frameW,
    frameHeight: frameH,
  };
}

async function detectObjects(imageBase64, prompt, threshold = 0.3) {
  if (!API_KEY)
    throw new Error('NGC_API_KEY or NVIDIA_API_KEY required on DGX');
  const imageBytes = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const assetInfo = await getAssetUploadUrl();
  await uploadAsset(assetInfo.uploadUrl, imageBytes);
  const initial = await invokeModel(assetInfo.assetId, prompt, threshold);
  let zipBuffer;
  if (initial.status === 202) {
    const requestId = initial.headers.get('nvcf-reqid');
    if (!requestId)
      throw new Error('202 Accepted without NVCF-REQID header');
    zipBuffer = await pollResult(requestId);
  }
  else if (initial.ok) {
    zipBuffer = Buffer.from(await initial.arrayBuffer());
  }
  else {
    const text = await initial.text();
    throw new Error(`Invoke failed (${initial.status}): ${text}`);
  }
  return parseZipResponse(zipBuffer);
}

const server = https.createServer(
  { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, hasKey: Boolean(API_KEY) }));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/api/grounding-dino') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('POST /api/grounding-dino');
      return;
    }
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8'));
      const prompt = String(body.prompt || '').trim();
      const imageBase64 = String(body.imageBase64 || '').trim();
      const threshold = Number(body.threshold ?? 0.3);
      if (!prompt || !imageBase64) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'prompt and imageBase64 required' }));
        return;
      }
      const result = await detectObjects(imageBase64, prompt, threshold);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[grounding-dino-proxy]', message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
  },
);

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`Grounding DINO proxy https://0.0.0.0:${LISTEN_PORT}/api/grounding-dino (key: ${API_KEY ? 'set' : 'MISSING'})`);
});
