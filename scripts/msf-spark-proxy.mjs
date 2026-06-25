#!/usr/bin/env node
/**
 * Zero-dep HTTPS reverse proxy for Scene Assembler (MSF Map Service).
 * Galaxy XR / Surface LAN reaches 10.0.0.32 but not 10.0.0.158 (router client isolation).
 * Run alongside xr-hub-proxy (XR :8443 → DGX :8088; MSF :8453 → DGX :8443).
 */
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_DIR = process.env.MSF_PROXY_CERT_DIR
  || process.env.XR_PROXY_CERT_DIR
  || path.resolve(__dirname, '../certs');
const LISTEN_PORT = Number(process.env.MSF_PROXY_PORT || 8453);
const TARGET = new URL(process.env.MSF_SPARK_URL || 'https://10.0.0.158:8443');

const keyPath = path.join(CERT_DIR, 'localhost-key.pem');
const certPath = path.join(CERT_DIR, 'localhost.pem');

function forward(req, res) {
  const clientHost = req.headers.host || '';
  const headers = {
    ...req.headers,
    host: TARGET.host,
    'x-forwarded-host': clientHost,
    'x-forwarded-proto': 'https',
  };
  const opts = {
    protocol: TARGET.protocol,
    hostname: TARGET.hostname,
    port: TARGET.port || (TARGET.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: req.url,
    headers,
    rejectUnauthorized: false,
  };
  const upstream = (TARGET.protocol === 'https:' ? https : http).request(opts, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`MSF Map Service unreachable: ${err.message}`);
  });
  req.pipe(upstream);
}

const server = https.createServer({
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
}, forward);

server.on('upgrade', (req, socket, head) => {
  const clientHost = req.headers.host || '';
  const headers = {
    ...req.headers,
    host: TARGET.host,
    'x-forwarded-host': clientHost,
    'x-forwarded-proto': 'https',
  };
  const opts = {
    protocol: TARGET.protocol,
    hostname: TARGET.hostname,
    port: TARGET.port || 443,
    path: req.url,
    headers,
    rejectUnauthorized: false,
  };
  const upstream = https.request(opts);
  upstream.on('upgrade', (upRes, upSocket) => {
    socket.write(
      `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}\r\n`
      + Object.entries(upRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')
      + '\r\n\r\n',
    );
    upSocket.pipe(socket);
    socket.pipe(upSocket);
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`MSF proxy https://0.0.0.0:${LISTEN_PORT} → ${TARGET.origin}`);
});
