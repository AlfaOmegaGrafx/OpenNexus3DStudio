# Space-Time competitive model (public overview)

This document explains **what is open source vs. what is proprietary** for OpenNexus3DStudio: SPACE-TIME EDITION. It contains **no pricing, revenue targets, or investor detail**.

For trademark terms see [README Legal & Trademark](../README.md#legal--trademark-information).

---

## Open source (client)

The application source is open (see [LICENSE](../LICENSE)). You may study, fork, and self-host the client if you **remove all Space-Time branding** and use your own product name.

The public [Vercel demo](../docs/PUBLIC_DEPLOY.md) runs viewport/VRM features **without** exposing private AI infrastructure.

---

## Proprietary moat (not granted by the OSS license)

| Area | Why it is not “free to copy” |
|------|------------------------------|
| **Trademark** | “Space-Time”, OpenNexus3DStudio branding, logo, apparel designs — see README Legal & Trademark |
| **Hosted AI** | Commercial **3DAIGC-API** queue, model matrix tuning, and quality gates on operator hardware |
| **Payments** | Micropayment facilitator and API billing (x402 / wallet rails) — secrets stay server-side |
| **Phygital registry** | Official garment serial IDs, NFC secure-url validation, signed digital-twin downloads |
| **Marketplace graph** | Curated mint paths, soulbound identity + equippable assets, official secondary listings |
| **Personalization service** | Optional user-approved profile context for generation — compute product, not sale of raw user data |

Forking the repo does **not** grant rights to operate as “Space-Time”, to issue official passport serials, or to use our payment/registry backends.

---

## Architecture split

```text
[Open OSS client]  ──API──►  [Hosted 3DAIGC + billing + SLA]  (operator moat)
       │
       ├──► Trademark + official drops + /verify passport (brand moat)
       └──► Wallet / mint / phygital loop (network moat)
```

---

## Related public docs

- [Phygital NFC roadmap](./PHYGITAL_NFC_APPAREL_ROADMAP.md) — Phase 0 mock; production registry is hosted
- [Phygital passport API draft](./PHYGITAL_PASSPORT_API.md) — contract only; implementation is not in the OSS client alone
- [Public deploy](./PUBLIC_DEPLOY.md) — safe CI/Vercel boundaries

**Internal strategy** (pricing, ARR, full revenue map) lives in local-only files synced to DGX over SSH — **not** in this repository’s public git history.
