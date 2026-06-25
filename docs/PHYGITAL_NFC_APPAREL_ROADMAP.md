# Phygital apparel — NFC + Digital Twin Passport (integration roadmap)

**Status:** Planning / mock phase (2026-06). **NFC hardware supplier:** TBD — placeholders only until vendor + chip SKU are selected.

**Trademark:** Physical "Space-Time" apparel, NFC placement, and passport UX are proprietary brand assets (see README Legal & Trademark). Open-source code does not grant use of Space-Time trade dress.

## Goal

Bridge **physical Space-Time garments** to **digital twins** created in OpenNexus3DStudio with tamper-evident tap-to-verify and a public **Digital Twin Passport**.

```text
[NFC tap on garment]
       ↓
https://open-nexus3-d-studio.vercel.app/verify/{serialId}[?tap=…]
       ↓
Passport UI (Vercel / OpenNexus3DStudio)
       ↓
Passport API (future: 3DAIGC-API or dedicated service) → metadata + download URLs + provenance
```

## Two-layer architecture

### 1. Physical layer — NFC (supplier TBD)

| Topic | Planned approach |
|--------|------------------|
| **Chip class** | NFC Type 4, **NTAG 424 DNA** (or equivalent) with **Secure Unique NFC (SUN)** / CMAC URL — not static QR |
| **Placement** | Silicone patch behind Space-Time logo, collar label, or sleeve cuff (product-dependent) |
| **Why not QR alone** | QR is photocopyable; SUN URLs rotate a **single-use or session token** in the query string per tap |
| **Encoding** | NDEF URI record → `https://…/verify/{serialId}` (+ vendor-specific auth params) |
| **Supplier** | **`TBD_NFC_VENDOR`** — evaluate garment integrator + NTAG programming toolchain in Phase 2 |

Until supplier is named, use **mock serial IDs** and manual `/verify/ST-…` links for UX and API design.

### 2. Digital layer — passport + provenance

| Field | Purpose |
|--------|---------|
| **Serial ID** | Human-readable unique id, e.g. `ST-OG-001-9842` |
| **SKU / edition** | Product line (e.g. OG drop, collab) |
| **Digital twin files** | GLB (web/Blender), VRM (VRChat), USDZ (Apple AR — **planned**) |
| **Studio linkage** | Optional `studioProjectId` / export hash tying twin to OpenNexus export |
| **Provenance** | Manufacture date, fulfillment region, optional on-chain token history |
| **Tap telemetry** | Last tap time, monotonic counter (for SUN replay detection) |

On-chain provenance is **Phase 4** (Thirdweb / existing mint stack) — not required for Phase 0–1 mock.

## OpenNexus3DStudio outputs (digital twin formats)

| Format | Today | Phygital use |
|--------|--------|----------------|
| **GLB** | ✅ Export from studio | Default web twin + Blender/Unreal import |
| **VRM** | ✅ Export | VRChat / VTuber / OpenNexus avatar pipeline |
| **FBX** | ✅ Via pipeline / loot | Legacy rigs, some engines |
| **USDZ** | ❌ Planned | iOS Quick Look / Apple AR try-on for apparel mesh |

Passport download links should point at **CDN or signed URLs** (not raw DGX paths).

## Implementation phases

### Phase 0 — Mock (current)

- [x] Roadmap doc (this file)
- [x] Passport JSON schema + mock records (`src/library/phygital/`)
- [x] Public route **`/verify/:serialId`** with mock UI (`src/pages/PhygitalVerify.jsx`)
- [x] API contract draft ([PHYGITAL_PASSPORT_API.md](./PHYGITAL_PASSPORT_API.md))
- [ ] Link from internal docs / memory bank only (no production NFC programming)

**Test URLs (mock):**

- `/verify/ST-OG-001-9842`
- `/verify/ST-DEMO-0001`

### Phase 1 — Verification page on Vercel

- Deploy `/verify/*` on public Vercel app (static + client fetch)
- Environment: `VITE_PHYGITAL_API_BASE` → future API origin
- `VITE_PHYGITAL_USE_MOCK=0` when real API live
- Mobile-first passport layout, Space-Time branding
- Optional: `?tap=` query preserved for future SUN token validation (display only in mock)

### Phase 2 — NFC supplier + encoding

- Select vendor (`TBD_NFC_VENDOR` → named partner)
- Define serial allocation (prefix `ST-`, SKU segment, unit counter)
- Program chips with NDEF URI template
- Document secure programming SOP (no secrets in repo)

### Phase 3 — Passport API (3DAIGC-API or microservice)

- `GET /api/v1/phygital/passports/{serialId}`
- `POST /api/v1/phygital/taps/verify` — validate SUN/CMAC, increment counter, audit log
- Admin: register garment ↔ twin asset URLs after manufacturing
- See [PHYGITAL_PASSPORT_API.md](./PHYGITAL_PASSPORT_API.md)

### Phase 4 — Provenance + mint linkage

- Optional ERC-721 / Thirdweb token per serial or batch
- Wallet section on passport (owner, transfer history)
- Tie-in to existing mint flow (`Mint.jsx`, `mint-utils.js`) — **separate from** VRM trait minting unless explicitly designed

## Repo map (where code lives)

| Area | Path |
|------|------|
| Roadmap | `docs/PHYGITAL_NFC_APPAREL_ROADMAP.md` |
| API contract | `docs/PHYGITAL_PASSPORT_API.md` |
| Agent summary | `memory-bank/phygital-nfc-roadmap.md` |
| Schema + mocks | `src/library/phygital/` |
| Verify UI | `src/pages/PhygitalVerify.jsx` |
| Route | `src/Main.jsx` → `/verify/:serialId` |
| Future backend | `3DAIGC-API` (separate repo) — endpoints TBD |

## Security notes

- **Never** embed NFC programming keys or SUN master secrets in the frontend or git.
- Tap tokens validated **server-side** only (Phase 3).
- Passport download URLs should use **short-lived signed URLs** for premium twins.
- Mock mode must be **obvious** in UI until production API + NFC are live.

## Related docs

- [PUBLIC_DEPLOY.md](./PUBLIC_DEPLOY.md) — Vercel public app
- [WALLET_OWNED_ASSETS_AVATAR_APPROACH.md](./WALLET_OWNED_ASSETS_AVATAR_APPROACH.md) — on-chain assets (future provenance)
- [VRM_UPLOAD_DISPLAY_EXPORT.md](./VRM_UPLOAD_DISPLAY_EXPORT.md) — twin export invariants

## Open decisions (track here)

| # | Question | Default until decided |
|---|----------|------------------------|
| 1 | NFC supplier & chip SKU | `TBD_NFC_VENDOR`, NTAG 424 DNA (reference) |
| 2 | API host: extend 3DAIGC-API vs separate service | 3DAIGC-API `/api/v1/phygital/*` |
| 3 | USDZ export priority | After GLB/VRM passport MVP |
| 4 | On-chain provenance required for v1? | No — optional Phase 4 |
