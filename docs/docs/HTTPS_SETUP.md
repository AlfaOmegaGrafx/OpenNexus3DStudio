# HTTPS Setup for WebXR Support

WebXR (AR/VR) requires HTTPS to work. This guide explains how to set up HTTPS for local development.

**Dev topology:** Run `npm run dev` on your **Surface Laptop** (or whichever machine serves the app to the headset). The **DGX Spark** is a separate headless host (NVIDIA Sync / SSH), not the default browser machine for Vite. See [`DEV_MACHINE_TOPOLOGY.md`](./DEV_MACHINE_TOPOLOGY.md).

## Quick Setup (Recommended)

### Option 1: Using mkcert (Easiest)

1. **Install mkcert:**
   - Windows: `choco install mkcert` or download from [mkcert releases](https://github.com/FiloSottile/mkcert/releases)
   - macOS: `brew install mkcert`
   - Linux: See [mkcert installation guide](https://github.com/FiloSottile/mkcert#installation)

2. **Install local CA:**
   ```bash
   mkcert -install
   ```

3. **Generate certificates:**
   ```bash
   mkcert localhost 127.0.0.1 ::1 <your-dev-workstation-LAN-IP>
   # Example: 10.0.0.32 (Surface on LAN — use `ipconfig` / `hostname -I`, not the DGX unless Vite runs there)
   ```
   This creates `localhost+3.pem` and `localhost+3-key.pem`

4. **Move certificates to certs directory:**
   ```bash
   mkdir certs
   mv localhost+3.pem certs/localhost.pem
   mv localhost+3-key.pem certs/localhost-key.pem
   ```

5. **Restart dev server:**
   ```bash
   npm run dev
   ```

6. **Access via HTTPS:**
   - `https://localhost:3000`
   - `https://<your-dev-workstation-LAN-IP>:3000` (for Galaxy XR — same machine that runs `npm run dev`)

### Option 2: Using OpenSSL

If you have OpenSSL installed:

```bash
npm run setup-https
```

This will generate certificates in the `certs/` directory.

### Option 3: Manual Certificate Generation

1. Create `certs` directory:
   ```bash
   mkdir certs
   ```

2. Generate certificate (using OpenSSL):
   ```bash
   openssl req -x509 -newkey rsa:4096 -keyout certs/localhost-key.pem -out certs/localhost.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
   ```

3. Restart dev server - Vite will automatically use the certificates.

## Browser Security Warning

When using self-signed certificates, browsers will show a security warning. You need to:

1. Click "Advanced" or "Show Details"
2. Click "Proceed to localhost (unsafe)" or "Accept the Risk and Continue"

This is safe for local development.

## Network Access

To access from your Galaxy XR device:

1. Make sure both devices are on the same network
2. Find your **dev workstation** LAN IP (Surface: `ipconfig`; e.g. `10.0.0.32`)
3. Add the IP to the certificate (see mkcert step 3 above)
4. Access via `https://<Surface-LAN-IP>:3000` on the Galaxy XR device (see [`DEV_MACHINE_TOPOLOGY.md`](./DEV_MACHINE_TOPOLOGY.md))

## Troubleshooting

- **Certificate errors**: Make sure certificates are in `certs/` directory with correct names
- **Connection refused**: Check firewall settings, ensure port 3000 is open
- **WebXR still not working**: Verify you're using HTTPS (not HTTP) and have accepted the certificate warning
