# Phygital Passport API (draft contract)

**Status:** Mock / planning — **not implemented** on 3DAIGC-API yet.  
**Consumer:** OpenNexus3DStudio `/verify/:serialId` page (`src/library/phygital/passportClient.js`).

When `VITE_PHYGITAL_USE_MOCK=0` and `VITE_PHYGITAL_API_BASE` is set, the client will call these endpoints.

## Base URL

| Environment | Base |
|-------------|------|
| Local dev | `http://10.0.0.158:7842` or `/__dev_dgx_proxy` |
| Production | TBD (likely DGX or dedicated API behind HTTPS) |
| Public Vercel | Read-only passport via CDN/API; no DGX secrets in browser |

Suggested env:

```env
VITE_PHYGITAL_API_BASE=https://api.example.com
VITE_PHYGITAL_USE_MOCK=1
```

## `GET /api/v1/phygital/passports/{serialId}`

Returns the Digital Twin Passport for a garment serial.

### Path

- `serialId` — e.g. `ST-OG-001-9842` (URL-encoded)

### Response `200`

```json
{
  "serialId": "ST-OG-001-9842",
  "sku": "ST-OG-001",
  "edition": "Genesis Drop",
  "status": "authentic",
  "brand": "Space-Time",
  "nfc": {
    "vendor": "Acme NFC Co.",
    "chipModel": "NTAG424 DNA",
    "programmingBatch": "2026-Q2-A"
  },
  "digitalTwin": {
    "studioProjectId": "proj_abc123",
    "exportHash": "sha256:…",
    "thumbnailUrl": "https://cdn.example.com/twins/ST-OG-001-9842/thumb.jpg",
    "assets": [
      {
        "format": "glb",
        "label": "Web / Blender",
        "url": "https://cdn.example.com/twins/ST-OG-001-9842/twin.glb",
        "mimeType": "model/gltf-binary"
      },
      {
        "format": "vrm",
        "label": "VRChat / VRM",
        "url": "https://cdn.example.com/twins/ST-OG-001-9842/twin.vrm",
        "mimeType": "model/vrm"
      },
      {
        "format": "usdz",
        "label": "Apple AR",
        "url": null,
        "status": "planned",
        "mimeType": "model/vnd.usdz+zip"
      }
    ]
  },
  "provenance": {
    "manufacturedAt": "2026-06-01T12:00:00Z",
    "fulfillmentRegion": "US",
    "notes": "Space-Time OG hoodie — unit 9842"
  },
  "onChain": {
    "status": "none",
    "chainId": null,
    "contractAddress": null,
    "tokenId": null
  },
  "tapStats": {
    "totalTaps": 3,
    "lastTapAt": "2026-06-18T20:00:00Z"
  }
}
```

### Errors

| Code | Meaning |
|------|---------|
| `404` | Unknown serial |
| `410` | Serial revoked / counterfeit flag |

## `POST /api/v1/phygital/taps/verify` (Phase 3)

Validates NFC SUN / CMAC tap payload server-side.

### Request

```json
{
  "serialId": "ST-OG-001-9842",
  "tapToken": "vendor-specific-string-from-query",
  "clientHint": {
    "userAgent": "…",
    "referrer": "android-nfc"
  }
}
```

### Response `200`

```json
{
  "valid": true,
  "serialId": "ST-OG-001-9842",
  "tapCounter": 4,
  "passport": { }
}
```

### Response `401`

Invalid or replayed tap token.

## Admin (Phase 3+, auth required)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/phygital/passports` | Register serial + twin URLs after QA |
| `PATCH` | `/api/v1/phygital/passports/{serialId}` | Update assets / revoke |
| `POST` | `/api/v1/phygital/batches` | Bulk import from manufacturing CSV |

**Not specified in mock phase** — manufacturing ops TBD with NFC vendor.

## Client behavior (OpenNexus3DStudio)

1. Parse `serialId` from route `/verify/:serialId`.
2. Preserve optional `?tap=` query for future POST verify (Phase 3).
3. If mock mode → `passportMockData.js`.
4. Else → `GET …/passports/{serialId}`.
5. Render passport UI; download buttons use `asset.url` when non-null.

See `src/library/phygital/passportSchema.js` for shared field names.
