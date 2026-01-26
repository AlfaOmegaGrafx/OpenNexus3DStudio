#!/usr/bin/env node

/**
 * Setup HTTPS certificates for local development
 * This script generates self-signed certificates for WebXR support
 * 
 * Options (in order of preference):
 * 1. Uses mkcert if available (recommended - trusted certificates)
 * 2. Uses selfsigned npm package (no external dependencies)
 * 3. Falls back to OpenSSL if available
 * 4. Provides instructions for manual setup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
  console.log('\n💡 To regenerate, delete the certs directory and run this script again');
  process.exit(0);
}

console.log('🔐 Setting up HTTPS certificates for local development...');
console.log('   This will enable WebXR support (AR/VR)\n');

// Try mkcert first (best option - creates trusted certificates)
try {
  console.log('🔄 Trying mkcert (recommended)...');
  // Check if mkcert is installed
  execSync('mkcert -version', { stdio: 'ignore' });
  
  // Install local CA if not already installed
  try {
    execSync('mkcert -install', { stdio: 'inherit' });
  } catch (e) {
    // CA might already be installed, that's okay
  }
  
  // Generate certificate for localhost and common IPs
  const hosts = ['localhost', '127.0.0.1', '::1', '10.0.0.32'];
  const mkcertCommand = `mkcert ${hosts.join(' ')}`;
  execSync(mkcertCommand, { cwd: certDir, stdio: 'inherit' });
  
  // Rename files to expected names
  const certFiles = fs.readdirSync(certDir).filter(f => f.endsWith('.pem'));
  if (certFiles.length >= 2) {
    const keyFile = certFiles.find(f => f.includes('key'));
    const certFile = certFiles.find(f => !f.includes('key'));
    
    if (keyFile && certFile) {
      fs.renameSync(path.join(certDir, keyFile), keyPath);
      fs.renameSync(path.join(certDir, certFile), certPath);
    }
  }
  
  console.log('\n✅ HTTPS certificates generated successfully with mkcert!');
  console.log(`   Key: ${keyPath}`);
  console.log(`   Cert: ${certPath}`);
  console.log('\n📝 These certificates are trusted by your system - no browser warnings!');
  process.exit(0);
} catch (mkcertError) {
  console.log('⚠️  mkcert not found, trying selfsigned package...\n');
}

// Try selfsigned npm package (no external dependencies needed)
try {
  const selfsigned = require('selfsigned');
  console.log('🔄 Generating certificates with selfsigned package...');
  
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = selfsigned.generate(attrs, {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'basicConstraints',
        cA: true
      },
      {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true
      },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 2, value: '127.0.0.1' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '10.0.0.32' }
        ]
      }
    ]
  });
  
  // Write certificate and key files
  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath, pems.private);
  
  console.log('\n✅ HTTPS certificates generated successfully with selfsigned!');
  console.log(`   Key: ${keyPath}`);
  console.log(`   Cert: ${certPath}`);
  console.log('\n📝 Note: You may need to accept the security warning in your browser');
  console.log('   For Chrome: Click "Advanced" -> "Proceed to localhost (unsafe)"');
  console.log('   For Firefox: Click "Advanced" -> "Accept the Risk and Continue"');
  process.exit(0);
} catch (selfsignedError) {
  console.log('⚠️  selfsigned package failed, trying OpenSSL...\n');
  console.error('Error:', selfsignedError.message);
}

// Try OpenSSL as fallback
try {
  // Check common OpenSSL locations
  const possiblePaths = [
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    'C:\\OpenSSL-Win64\\bin\\openssl.exe',
    'C:\\OpenSSL-Win32\\bin\\openssl.exe'
  ];
  
  let opensslFound = null;
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
    console.log('\n✅ HTTPS certificates generated successfully with OpenSSL!');
    console.log(`   Key: ${keyPath}`);
    console.log(`   Cert: ${certPath}`);
    console.log('\n📝 Note: You may need to accept the security warning in your browser');
    console.log('   For Chrome: Click "Advanced" -> "Proceed to localhost (unsafe)"');
    process.exit(0);
  } else {
    throw new Error('OpenSSL not found');
  }
} catch (opensslError) {
  console.error('\n❌ Could not generate certificates automatically');
  console.error('\n📋 Please install one of the following:\n');
  console.error('Option 1: mkcert (Recommended - creates trusted certificates)');
  console.error('   Windows: choco install mkcert');
  console.error('   Or download from: https://github.com/FiloSottile/mkcert/releases');
  console.error('\nOption 2: OpenSSL');
  console.error('   Windows: Install from https://slproweb.com/products/Win32OpenSSL.html');
  console.error('   Or install Git for Windows (includes OpenSSL)\n');
  console.error('After installing, run: npm run setup-https\n');
  console.error('Or see docs/HTTPS_SETUP.md for manual setup instructions');
  process.exit(1);
}
