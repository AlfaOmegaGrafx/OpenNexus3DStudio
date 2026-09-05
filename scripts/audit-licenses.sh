#!/usr/bin/env bash
# License hygiene: regenerate THIRD_PARTY_NOTICES + print copyleft flags.
# Usage:
#   bash scripts/audit-licenses.sh           # OpenNexus production npm
#   bash scripts/audit-licenses.sh --chat    # chat/app production
#   bash scripts/audit-licenses.sh --flags   # flags only (OpenNexus)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHAT_APP="${CHAT_APP:-/home/sifr/chat/app}"
MODE="${1:-}"

flag_copyleft() {
  local json="$1"
  node -e '
const fs=require("fs");
const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const bad=/GPL|AGPL|LGPL|SSPL|Commons Clause|UNKNOWN|Custom/i;
const rows=[];
for (const [name,info] of Object.entries(j)) {
  const L=String(info.licenses||"UNKNOWN");
  if (bad.test(L)) rows.push([L,name]);
}
rows.sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
if (!rows.length) { console.log("No copyleft/custom/UNKNOWN flags."); process.exit(0); }
console.log("FLAGGED licenses:");
for (const [L,n] of rows) console.log(" ", L, "\t", n);
' "$json"
}

write_notices() {
  local json="$1"
  local out="$2"
  local title="$3"
  node -e '
const fs=require("fs");
const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const out=process.argv[2];
const title=process.argv[3];
const lines=[title,"","Generated for compliance hygiene. Not legal advice.","",
  "See also: docs/LICENSE_COMPLIANCE.md",""];
const byLic={};
for (const [name, info] of Object.entries(j)) {
  const lic=String(info.licenses||"UNKNOWN");
  (byLic[lic]=byLic[lic]||[]).push(name);
}
for (const lic of Object.keys(byLic).sort()) {
  lines.push("## "+lic);
  byLic[lic].sort().forEach(n=>lines.push("- "+n));
  lines.push("");
}
fs.mkdirSync(require("path").dirname(out),{recursive:true});
fs.writeFileSync(out, lines.join("\n"));
console.log("Wrote", out, "("+Object.keys(j).length+" packages)");
' "$json" "$out" "$title"
}

if [[ "$MODE" == "--chat" ]]; then
  cd "$CHAT_APP"
  TMP="$(mktemp)"
  npx --yes license-checker-rseidelsohn --production --excludePrivatePackages --json >"$TMP"
  write_notices "$TMP" "$CHAT_APP/../docs/THIRD_PARTY_NOTICES.md" "# Third-party notices (chat/app production)"
  flag_copyleft "$TMP"
  rm -f "$TMP"
  exit 0
fi

cd "$ROOT"
TMP="$(mktemp)"
npx --yes license-checker-rseidelsohn --production --excludePrivatePackages --json >"$TMP"

if [[ "$MODE" != "--flags" ]]; then
  write_notices "$TMP" "$ROOT/docs/THIRD_PARTY_NOTICES.md" "# Third-party notices (OpenNexus production npm)"
fi
flag_copyleft "$TMP"
rm -f "$TMP"
