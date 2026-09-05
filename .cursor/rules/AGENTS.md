Agent entry point — **read in this order before any code work**:

1. **`CLAUDE.md`** — operating manual (session protocol, workflow routing)
2. **`CURSOR.md`** — MindLink mandatory read-first (Core, SESSION, LOG)
3. **`.agent/STATE.md`** — live session truth
4. **`memory-bank/activeContext.md`** — Cursor memory-bank mirror

Also run `bash scripts/verify-agent-continuity.sh --all-repos` on first turn (see `.cursor/rules/agent-read-first-startup.mdc`).

Optional MindLink memory: `.brain/` (see `.agent/areas/mindlink.md`). Prefer `.agent/` for
engineering state.
