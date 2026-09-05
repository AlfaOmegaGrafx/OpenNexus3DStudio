#!/usr/bin/env bash
# Refresh local Graphify AST graphs (no LLM cost). Run on DGX after meaningful code changes.
# PersonaPlex: moat + companion-chat-proxy are partly gitignored — this script reindexes them
# and merges OpenNexus + moeChat (chat) into graphify-out/personaplex-merged-graph.json.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
if ! command -v graphify >/dev/null 2>&1; then
  echo "Install: curl -LsSf https://astral.sh/uv/install.sh | sh && uv tool install graphifyy"
  exit 1
fi

ROOT_CS="${HOME}/OpenNexus3DStudio"
ROOT_API="${HOME}/3DAIGC-API"
ROOT_CHAT="${HOME}/chat"

update_repo() {
  local repo="$1"
  if [[ -d "$repo" ]]; then
    echo "=== graphify update: $repo ==="
    (cd "$repo" && graphify update . --no-cluster)
  else
    echo "=== skip (missing): $repo ==="
  fi
}

update_repo "$ROOT_CS"
update_repo "$ROOT_API"
update_repo "$ROOT_CHAT"

MERGE_OUT="${ROOT_CS}/graphify-out/personaplex-merged-graph.json"
CS_GRAPH="${ROOT_CS}/graphify-out/graph.json"
CHAT_GRAPH="${ROOT_CHAT}/graphify-out/graph.json"
if [[ -f "$CS_GRAPH" && -f "$CHAT_GRAPH" ]]; then
  echo "=== merge OpenNexus + moeChat → personaplex-merged-graph.json ==="
  GRAPHIFY_PY="${HOME}/.local/share/uv/tools/graphifyy/bin/python3"
  if [[ ! -x "$GRAPHIFY_PY" ]]; then
    GRAPHIFY_PY="$(command -v python3)"
  fi
  "$GRAPHIFY_PY" - <<'PY' "$CS_GRAPH" "$CHAT_GRAPH" "$MERGE_OUT"
import json, sys
from pathlib import Path
import networkx as nx
from networkx.readwrite import json_graph as jg
from graphify.build import prefix_graph_for_global as prefix

paths = [Path(p) for p in sys.argv[1:3]]
out_path = Path(sys.argv[3])
merged = nx.MultiGraph()
for gp in paths:
    data = json.loads(gp.read_text(encoding="utf-8"))
    if "links" not in data and "edges" in data:
        data = dict(data, links=data["edges"])
    G = jg.node_link_graph(data, edges="links")
    merged = nx.compose(merged, prefix(G, gp.parent.parent.name))
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps(jg.node_link_data(merged, edges="links"), indent=2), encoding="utf-8")
print(f"Merged {len(paths)} graphs -> {merged.number_of_nodes()} nodes, {merged.number_of_edges()} edges")
print(f"Written to: {out_path}")
PY
fi

echo "Done."
echo "  OpenNexus:  cd $ROOT_CS && graphify query \"PersonaPlex companion proxy\""
echo "  moeChat:    cd $ROOT_CHAT && graphify query \"session-runtime handshake\""
echo "  Cross-repo: graphify query \"...\" --graph $MERGE_OUT"
