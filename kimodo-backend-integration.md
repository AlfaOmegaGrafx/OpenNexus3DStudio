# Kimodo backend integration (OpenNexus3DStudio)

Frontend triggers **text-to-motion** via animation bar (`KimodoMotionPromptBar.jsx` → `taskManager.js`).

**All DGX ops, failure modes, prefetch, and timeouts** are documented on the API side:

`/home/sifr/3DAIGC-API/memory-bank/kimodo-text-to-motion-ops.md`

Agents debugging Kimodo job failures: read that file first; run prefetch/restart/test on DGX — do not ask the user to run scripts.

**Status (2026-06-25):** Backend verified working (job `544b726e…` → `studio_motion.json`).
