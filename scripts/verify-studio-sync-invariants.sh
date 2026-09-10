#!/usr/bin/env bash
# Guard critical Studio/Task Manager contracts before DGX → Surface scp.
# Sync overwrites whole files (not a merge). If DGX drops these, Surface loses them.
#
# Usage:
#   bash scripts/verify-studio-sync-invariants.sh
#   bash scripts/verify-studio-sync-invariants.sh --strict   # exit 1 on fail (default)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0

die() {
  echo "FAIL: $*" >&2
  fail=1
}

ok() {
  echo "OK  $*"
}

need() {
  local file="$1"
  local pattern="$2"
  local desc="$3"
  local path="${ROOT}/${file}"
  if [[ ! -f "$path" ]]; then
    die "missing file ${file}"
    return
  fi
  if ! grep -qE "$pattern" "$path"; then
    die "${desc} — expected /${pattern}/ in ${file}"
  else
    ok "$desc"
  fi
}

forbid() {
  local file="$1"
  local pattern="$2"
  local desc="$3"
  local path="${ROOT}/${file}"
  [[ -f "$path" ]] || return 0
  if grep -qE "$pattern" "$path"; then
    die "${desc} — forbidden /${pattern}/ still in ${file}"
  else
    ok "$desc"
  fi
}

echo "=== Studio sync invariants (DGX working tree) ==="

# --- Job cancel / Stop (must survive later StudioPage edits) ---
need "src/pages/StudioPage.jsx" 'data-testid="studio-stop-job-btn"' "Studio Stop job button"
need "src/pages/StudioPage.jsx" 'handleStopPipeline' "Studio handleStopPipeline"
need "src/pages/StudioPage.jsx" 'cancelActiveTasks' "Studio cancelActiveTasks wiring"
need "src/library/taskManager.js" 'async cancelJobOnApi' "taskManager.cancelJobOnApi"
need "src/library/taskManager.js" 'async cancelActiveTasks' "taskManager.cancelActiveTasks"
need "src/library/taskManager.js" '_cancelledJobIds' "poll abort set"
need "src/context/TaskContext.jsx" 'cancelActiveTasks' "TaskContext exports cancelActiveTasks"
need "src/components/TaskManager.jsx" 'data-testid="task-stop-btn"' "Task Manager Stop button"
need "src/pages/StudioPage.css" 'studio-btn-stop' "Stop button styles"

# --- User-facing catalog labels (generic, no vendor names in ALL_MODELS rows) ---
need "src/library/aiModelsCatalog.js" "Multiview Image to 3D Mesh" "Pixel3D UI label"
need "src/library/aiModelsCatalog.js" "Standard Image to Textured 3D Mesh" "TRELLIS.2 UI label"
need "src/library/aiModelsCatalog.js" "Text Image to Mesh" "text→image→mesh pipeline nickname"
need "src/library/aiModelsCatalog.js" "1:1 Walk Environment Scan" "env-scan UI label"
need "src/library/textToImagePromptOptions.js" "label: 'African'" "Ethnicity chip African"
need "src/library/textToImagePromptOptions.js" "label: 'European'" "Ethnicity chip European"
need "src/library/studioGraph.js" "garbedImageUrl" "Body+Cloth clothed preview field"
need "src/library/studioGraph.js" "krea_mage_pixel3dm" "Edit-then-mesh template id"
need "src/library/studioGraphExecutor.js" "buildGarbedBodySubjectPrompt|garbedImageUrl" "Garbed Krea preview path"
need "src/library/appearanceClothing.js" "buildGarbedBodySubjectPrompt" "Garbed outfit prompt helper"
need "src/components/studio/StudioStagePreviews.jsx" "garbedImageUrl" "Stage preview garbed card"

forbid "src/library/aiModelsCatalog.js" "label: 'TRELLIS\.2 Image to Textured Mesh" \
  "ALL_MODELS must not show raw TRELLIS.2 product name as primary label"
forbid "src/library/aiModelsCatalog.js" "label: 'Arc2Avatar" \
  "ALL_MODELS must use 3DGSavatar not Arc2Avatar"
forbid "src/library/textToImagePromptOptions.js" "label: 'Black'" \
  "Ethnicity chip must be African not Black"
forbid "src/library/textToImagePromptOptions.js" "label: 'White'" \
  "Ethnicity chip must be European not White"
forbid "src/library/studioGraph.js" "label: 'Krea → TRELLIS" \
  "Studio templates must stay generic (no Krea → TRELLIS labels)"

# --- API cancel route (DGX API tree; warn-only if missing checkout) ---
API_SYSTEM="${API_SYSTEM:-/home/sifr/3DAIGC-API/api/routers/system.py}"
if [[ -f "$API_SYSTEM" ]]; then
  if grep -q 'jobs/{job_id}/cancel' "$API_SYSTEM"; then
    ok "3DAIGC-API POST /jobs/{id}/cancel present"
  else
    die "3DAIGC-API missing POST /jobs/{id}/cancel in api/routers/system.py"
  fi
else
  echo "WARN: API system.py not found at $API_SYSTEM (skip)"
fi

echo ""
if [[ "$fail" -ne 0 ]]; then
  echo "RESULT: FAIL — fix regressions before sync-changes-to-pc.sh --include-src" >&2
  echo "Sync is full-file scp (DGX overwrites Surface). Do not push a broken tree." >&2
  exit 1
fi
echo "RESULT: PASS"
exit 0
