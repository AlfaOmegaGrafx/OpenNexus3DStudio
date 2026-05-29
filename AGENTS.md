# AGENTS.md

## Cursor Cloud specific instructions

- Standard app commands live in `README.md`, `package.json`, and `CLAUDE.md`; use those sources for routine install, lint, test, build, and run commands.
- The main Open3DStudio service is the Vite app on port 3000. The docs site is Docusaurus under `docs/`; run it on a non-3000 port when the app is already running.
- `public/loot-assets/` is an external checkout from `https://github.com/M3-org/loot-assets`, not a repository source directory. It is required for the Vite app to load/build because several UI modules import thumbnails and icons from that path.
- The local mock API (`npm run mock-api`, port 8000) provides `/health` and legacy `/generate/...` routes. The current frontend task code uses `/api/v1/...` routes and defaults to `http://127.0.0.1:7842`, so full AI workflow testing requires a compatible 3DAIGC-API backend or an explicitly aligned endpoint.
- Docusaurus development mode can compile with unresolved markdown-link warnings, but the production docs build currently fails because broken links are treated as build errors.
