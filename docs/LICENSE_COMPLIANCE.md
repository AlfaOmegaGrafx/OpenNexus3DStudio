# License compliance (hygiene audit)

**Date:** 2026-08-25  
**Scope:** OpenNexus3DStudio (npm), chat Companion overlay (pnpm), 3DAIGC-API (models + thirdparty)  
**Not legal advice.** Counsel review for shipping / investor diligence.

## Policy (Space-Time)

1. **Remain compliant** with OSS and model licenses already in the tree (attribution, CONDITIONAL constraints, no BLOCKED weights in commercial paths).
2. **New proprietary product work** that is not already pushed to public remotes goes under **moat** (`src/moat/`, gitignored roadmaps / memory-bank / companion overlay secrets) — do not grow public OSS surface with unreleased IP.
3. **Any new repo, vendored tree, npm/pip/HF dependency, or weight set** must be **license-audited before merge/clone** (see Cursor rule `license-audit-new-deps.mdc` and R&D gate `rd-commercial-license-gate.mdc`).
4. Model commercial gate source of truth: [`3DAIGC-API/docs/MODEL_LICENSES.md`](../../3DAIGC-API/docs/MODEL_LICENSES.md).

## Project licenses

| Repo | Declared | Notes |
|------|----------|-------|
| OpenNexus3DStudio | MIT (`LICENSE`) + trademark reservation | Set `package.json` `"license": "MIT"` to match |
| chat (Moeru AI fork / packages) | MIT | Companion overlay product layers may be moat / private |
| 3DAIGC-API | Apache-2.0 | Weights audited separately in `MODEL_LICENSES.md` |

Attribution inventory (production npm): [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) (regenerate via `scripts/audit-licenses.sh`).

---

## Findings — resolved (2026-08-25)

### P0 — AGPL `@lenml/char-card-reader` → **RESOLVED**

- Removed from `chat/packages/ccc`.
- Replaced with MIT **Avatar Role** (`chat/packages/ccc/src/role/*`, OpenNexus `src/library/avatarRole.js`).
- Portable schema: glTF extras `opennexus.avatar_role` — see [`AVATAR_ROLE.md`](./AVATAR_ROLE.md).
- Still accepts SillyTavern-shaped JSON + PNG `chara` tEXt via own MIT parsers (no AGPL).

### P1 — GPL `@web3-react/*` → **RESOLVED** (Thirdweb)

- Removed from `package.json`.
- `src/pages/Load.jsx` connects via **Thirdweb** (`src/library/thirdwebWalletConnect.js`): MetaMask (`io.metamask`), smart wallet, and in-app wallet. ethers used only for contract reads through `ethers6Adapter`.
- Ready for enterprise branded smart / in-app onboarding.

### P1 — GSAP → **RESOLVED**

- Unused in `src/`; removed from `package.json`.

---

## Findings — remaining hygiene

### P2 — LGPL (usually OK with conditions)

| Package | Notes |
|---------|--------|
| `@img/sharp-libvips*` / sharp win32 | LGPL-3 — dynamic/system imaging; keep LGPL notices; do not static-link into proprietary blobs without counsel |
| `rpc-websockets` | LGPL-3-only — transitive (wallet stack); retain notices |

### P2 — Custom / UNKNOWN (chat XR stack)

- `@pmndrs/*`, `@react-three/xr|handle|uikit*|viverse` report **Custom: LICENSE** — read each package `LICENSE` before shipping forks.  
- `@react-three/rapier` reported **UNKNOWN** in checker — verify upstream license file.

---

## Findings — already gated (models / API)

See `3DAIGC-API/docs/MODEL_LICENSES.md`. Do **not** enable commercially:

- NVIDIA PartField / PartPacker / PartUV / FastMesh (BLOCKED)  
- Kimodo **SMPL-X** paths (BLOCKED) — ship **Kimodo-SOMA-RP** only  
- `briaai/RMBG-2.0` (BLOCKED) — use BiRefNet  

CONDITIONAL stacks (Hunyuan territory/MAU, TRELLIS aux, Krea revenue cap, Live Speech NVIDIA Open Model + Moshi CC BY, etc.) must keep documented constraints.

---

## New dependency / repo checklist

Before `npm i`, `pnpm add`, `pip install`, `git submodule`, or vendoring under `thirdparty/`:

1. Record **SPDX / license text** + source URL.  
2. Classify: **OK** | **CONDITIONAL** | **BLOCKED** | **UNKNOWN** (UNKNOWN = BLOCKED until cleared).  
3. Reject **AGPL / SSPL / Commons Clause / non-commercial research-only** for product/runtime unless counsel approves a dedicated isolation plan. Prefer **MIT / Apache-2.0 / BSD / ISC**.  
4. **GPL** only if the component stays a separate process or you accept GPL obligations for that ship unit — default **reject** for SPA bundles.  
5. For **weights / datasets**, update `MODEL_LICENSES.md` (API) before wiring routes.  
6. Regenerate notices: `bash scripts/audit-licenses.sh`.  
7. Proprietary product code → **moat** (`src/moat/`, gitignored docs), not public `src/` growth, unless intentionally OSS.

---

## Regenerating notices

```bash
cd /home/sifr/OpenNexus3DStudio && bash scripts/audit-licenses.sh
```

Chat overlay: run the same pattern from `chat/app` (see script `--chat` flag).
