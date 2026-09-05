# Decisions — append-only.

2026-08-22 · Companion bottom navbar = floating chips only; Stage Suspense wraps **children only** so Navbar does not remount on VRM `useLoader`. No filled plate / no DOM frost. Guard: `scripts/verify-companion-navbar.sh` + `.cursor/rules/companion-navbar-floating-chips.mdc`. Supersedes earlier “opaque navbar plate” lock. · why: plate + remount looked like opaque slab after avatar load
2026-08-18 · Companion stays iframe (Surface Companion UI + DGX PersonaPlex). Do **not** merge R3F/Rapier/uikit into OpenNexus SPA — OpenNexus already has VRM/WebXR/lipsync; merge would add a second XR engine. Same-document companion only via a future SceneManager port, not a dump. · why: lean viewport, one `navigator.xr`, moat stays overlay, GPU stays on DGX
2026-07-26 · XR disembody: avatar at exit spot facing headset, viewer 1 m behind, Move→Viewpoint; X/stick-click work without menu; embody never shifts rig Y · why: user-confirmed Galaxy XR editing flow
2026-07-26 · LingBot gaussian_splat worlds use Spark + orientationMode none; never XYZRGB point stride · why: wrong stride scatters points; gravity-aligned clouds must not get TripoSplat X-flip
2026-06-26 · UI on Surface, API on DGX · why: XR/webcam + Vite on Windows; GPU jobs on Spark
2026-06-26 · scp sync, no agent git push · why: intentional publish
2026-06-26 · API↔client contracts must land together · why: models.yaml ↔ aiModelsCatalog/taskManager
2026-07-23 · Adopt RepoResident; MindLink archived to `.agent/areas/mindlink.md` · why: engineering harness + personal memory split (same as 3DAIGC-API)
