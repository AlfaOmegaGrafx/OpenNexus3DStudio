Agent entry point — **NO EXCEPTIONS. All helpers + all Cursor rules. Do not be lazy.**

| When | Requirement |
|------|-------------|
| **Session / restart / compaction** | **Checklist A (8 steps)** — includes Read every `alwaysApply` rule in `.cursor/rules/` |
| **Every turn before repo tools** | **Checklist B** — SessionMem + graphify + glob-matched rules |

**Checklist A:** verify → AGENTS→CLAUDE→CURSOR → RepoResident → memory-bank → MindLink → SessionMem → **Cursor rules (Read each alwaysApply .mdc)** → graphify.

**Rules index:** `memory-bank/cursor-rules-always-apply-index.md` (index only — still Read the rule files).

Rule: `.cursor/rules/agent-read-first-startup.mdc`
