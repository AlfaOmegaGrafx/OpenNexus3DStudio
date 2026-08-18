#!/usr/bin/env node
/** Self-signed dev certs for HTTPS proxies (OpenNexus + companion). Creates certs/ if missing. */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.resolve(__dirname, '../certs');
const keyPath = path.join(certDir, 'localhost-key.pem');
const certPath = path.join(certDir, 'localhost.pem');

const DEFAULT_SANS = [
  'DNS:localhost',
  'IP:127.0.0.1',
  'IP:10.0.0.32',
  'IP:10.0.0.158',
  'IP:100.93.124.59',
];

export function ensureDevCerts() {
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { keyPath, certPath };
  }
  fs.mkdirSync(certDir, { recursive: true });
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 825 -nodes -subj "/CN=localhost" -addext "subjectAltName=${DEFAULT_SANS.join(',')}"`,
    { stdio: 'inherit' },
  );
  return { keyPath, certPath };
}

ensureDevCerts();
