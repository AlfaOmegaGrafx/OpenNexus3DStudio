#!/usr/bin/env bash
# Stage only OMB/RP1, XR AI, world/splat models, and scoped docs for a public push.
# Usage: bash scripts/publish-omb-xr-only.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git add \
  package.json \
  package-lock.json \
  scripts/verify-build-deps.mjs \
  .env.example \
  docs/api/api.md \
  docs/SPATIAL_FABRIC_INTEGRATION.md \
  docs/WORLD_PACKAGE.md \
  NVIDIA_XR_AI_INTEGRATION.md \
  scripts/publish-omb-xr-only.sh \
  scripts/xr-spark-hub-proxy.mjs \
  src/App.jsx \
  src/components/GLBExport.jsx \
  src/components/TaskManager.jsx \
  src/components/WorldLibrary.jsx \
  src/components/WorldLibrary.module.css \
  src/components/XrAiPanel.jsx \
  src/components/XrAiPanel.css \
  src/hooks/useSpatialFabric.js \
  src/library/aiModelsCatalog.js \
  src/library/jobHandoff.js \
  src/library/multiImageInput.js \
  src/library/objectNameUtils.js \
  src/library/rigBoneUtils.js \
  src/library/spatialFabricAdapter.js \
  src/library/taskManager.js \
  src/library/taskPersistence.js \
  src/library/utils.js \
  src/library/worldPackage.js \
  src/library/worldSceneLoader.js \
  src/library/xrHubConfig.js \
  src/__tests__/spatialFabricAdapter.test.js \
  src/__tests__/TaskManager.test.js \
  src/__tests__/worldPackage.test.js \
  src/__tests__/worldSceneLoader.test.js \
  src/__tests__/xrHubConfig.test.js \
  src/__tests__/jobHandoff.test.js \
  src/__tests__/multiImageInput.test.js \
  src/__tests__/objectNameUtils.test.js

echo "Staged OMB/XR slice. Review with: git diff --cached --stat"
