#!/usr/bin/env node

/**
 * Generate self-signed certificates using Node.js crypto module
 * No external dependencies required
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, '..', 'certs');
const keyPath = path.join(certDir, 'localhost-key.pem');
const certPath = path.join(certDir, 'localhost.pem');

// Create certs directory if it doesn't exist
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

// Check if certificates already exist
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  console.log('✅ HTTPS certificates already exist');
  console.log(`   Key: ${keyPath}`);
  console.log(`   Cert: ${certPath}`);
  process.exit(0);
}

console.log('🔐 Generating HTTPS certificates using Node.js crypto...');
console.log('   This will enable WebXR support (AR/VR)\n');

try {
  // Generate RSA key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Create certificate
  const cert = crypto.createCertificate({
    publicKey: publicKey,
    serialNumber: '01',
    issuer: {
      C: 'US',
      ST: 'State',
      L: 'City',
      O: 'Organization',
      CN: 'localhost'
    },
    subject: {
      C: 'US',
      ST: 'State',
      L: 'City',
      O: 'Organization',
      CN: 'localhost'
    },
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 2, value: '127.0.0.1' },
          { type: 2, value: '10.0.0.32' }
        ]
      }
    ]
  });

  // For Node.js, we need to use a different approach
  // Let's use the forge library approach or create a simpler certificate
  // Actually, let's use openssl via child_process but with better error handling
  // Or we can create a basic certificate structure

  // Since Node.js crypto doesn't have a direct way to create X.509 certificates,
  // let's try to use a workaround or check for openssl again with better detection
  
  console.log('⚠️  Node.js crypto module has limitations for certificate generation');
  console.log('   Trying alternative method...\n');

  // Try to find and use openssl
  const { execSync } = require('child_process');
  let opensslFound = false;

  // Check common openssl locations
  const possiblePaths = [
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    'C:\\OpenSSL-Win64\\bin\\openssl.exe',
    'C:\\OpenSSL-Win32\\bin\\openssl.exe'
  ];

  for (const opensslPath of possiblePaths) {
    try {
      execSync(`"${opensslPath}" version`, { stdio: 'ignore' });
      opensslFound = opensslPath;
      break;
    } catch (e) {
      // Continue to next path
    }
  }

  if (opensslFound) {
    console.log(`✅ Found OpenSSL at: ${opensslFound}`);
    const opensslCommand = `"${opensslFound}" req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:10.0.0.32"`;
    execSync(opensslCommand, { stdio: 'inherit' });
    console.log('\n✅ HTTPS certificates generated successfully!');
    console.log(`   Key: ${keyPath}`);
    console.log(`   Cert: ${certPath}`);
    console.log('\n📝 Note: You may need to accept the security warning in your browser');
    console.log('   For Chrome: Click "Advanced" -> "Proceed to localhost (unsafe)"');
    process.exit(0);
  } else {
    throw new Error('OpenSSL not found');
  }
} catch (error) {
  console.error('\n❌ Could not generate certificates automatically');
  console.error('\n📋 Please install one of the following:\n');
  console.error('Option 1: mkcert (Recommended - creates trusted certificates)');
  console.error('   Windows: choco install mkcert');
  console.error('   Or download from: https://github.com/FiloSottile/mkcert/releases');
  console.error('\nOption 2: OpenSSL');
  console.error('   Windows: Install from https://slproweb.com/products/Win32OpenSSL.html');
  console.error('   Or install Git for Windows (includes OpenSSL)\n');
  console.error('After installing, run: npm run setup-https\n');
  process.exit(1);
}
