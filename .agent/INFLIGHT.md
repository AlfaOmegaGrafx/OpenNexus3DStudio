# Cross-chat workboard (agents MUST read)

Updated by `scripts/agent-workboard.sh`. Authority for “what other chats left dirty”
alongside `.agent/STATE.md`. Cap: keep under ~60 lines.

## How to use

```bash
bash scripts/agent-workboard.sh status
bash scripts/agent-workboard.sh claim --id short-id --note "what" --files "path1,path2"
bash scripts/agent-workboard.sh release --id short-id
bash scripts/agent-workboard.sh refresh-dirty
```

Before `git checkout HEAD --`, `git restore`, `git stash -u`, or `git filter-repo` on `src/`:

```bash
bash scripts/guard-destructive-git.sh --check
# then for specific paths:
bash scripts/guard-destructive-git.sh --paths path1 path2
```

## Active claims

<!-- CLAIMS_START -->
- id: `studio-labels-stop-garbed`
  chat: naming / Pixal3D / Stop (this product stream)
  status: restored-on-disk
  note: Generic labels, African/European, Stop/cancel, Body+Cloth garbed preview. Guarded by verify-studio-sync-invariants.sh. Do NOT git checkout HEAD these files.
  files: |
    src/library/aiModelsCatalog.js
    src/library/textToImagePromptOptions.js
    src/library/studioGraph.js
    src/library/studioGraphExecutor.js
    src/library/appearanceClothing.js
    src/library/avatarPipelineCatalog.js
    src/library/taskManager.js
    src/context/TaskContext.jsx
    src/components/TaskManager.jsx
    src/components/studio/StudioStagePreviews.jsx
    src/components/studio/StudioFlowNode.jsx
    src/pages/StudioPage.jsx
    src/pages/StudioPage.css
  updated: 2026-09-09T03:43:00-04:00
- id: `studio-pre-l1759-restore`
  chat: restore good checkpoint
  status: active
  note: Restored Studio UI from stash@{1}/stash@{0} = state up through Sep9 1:03AM (clothing right + Stop + Multiview/3DGSavatar namings). Synced.
  files: |
    src/pages/StudioPage.jsx
    src/pages/StudioPage.css
    src/components/TaskManager.jsx
    src/library/aiModelsCatalog.js
    src/library/appearanceClothing.js
    src/library/studioGraph.js
  updated: 2026-09-09T16:58:21-04:00
<!-- CLAIMS_END -->

## Auto dirty (from last refresh-dirty)

<!-- DIRTY_START -->
_(2026-09-09T16:42:41-04:00)_
- scripts/agent-workboard.sh
- scripts/guard-destructive-git.sh
- scripts/verify-studio-sync-invariants.sh
- src/components/studio/StudioClothingAccessoriesEditor.jsx
- src/components/studio/StudioFlowNode.jsx
- src/components/studio/StudioStagePreviews.jsx
- src/components/TaskManager.jsx
- src/context/TaskContext.jsx
- src/library/aiModelsCatalog.js
- src/library/appearanceClothing.js
- src/library/avatarPipelineCatalog.js
- src/library/studioGraphExecutor.js
- src/library/studioGraph.js
- src/library/taskManager.js
- src/library/textToImagePromptOptions.js
- src/pages/StudioPage.css
- src/pages/StudioPage.jsx
<!-- DIRTY_END -->
