#!/usr/bin/env bash
# Guard Companion bottom-bar soft chips + VRM-stable Navbar mount (2026-08-22).
# Fails if a filled plate or Suspense remount regression sneaks back in.
set -euo pipefail

CHAT_SRC="${COMPANION_ROOT:-${MOECHAT_ROOT:-/home/sifr/chat}}"
STAGE="${CHAT_SRC}/app/src/components/stage.tsx"
NAVBAR="${CHAT_SRC}/app/src/components/ui/navbar.tsx"
FROST="${CHAT_SRC}/app/src/components/ui/companion-navbar-frost.tsx"
fail=0

die() {
  echo "FAIL: $*" >&2
  fail=1
}

ok() {
  echo "OK  $*"
}

[[ -f "$STAGE" ]] || { echo "Companion stage missing: $STAGE" >&2; exit 1; }
[[ -f "$NAVBAR" ]] || { echo "Companion navbar missing: $NAVBAR" >&2; exit 1; }
[[ -f "$FROST" ]] || { echo "Companion frost stub missing: $FROST" >&2; exit 1; }

# Stage must Suspense only children; Navbar must remain a sibling outside that block.
if ! grep -qE '<Suspense[[:space:]]+fallback=\{null\}>' "$STAGE"; then
  die "stage.tsx must wrap children in <Suspense fallback={null}>"
else
  ok "stage.tsx has Suspense around children"
fi

# Navbar appears after the children Suspense closes (sibling), not inside it.
python3 - <<'PY' "$STAGE" || fail=1
import re, sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
# Strip comments so structure is clearer
stripped = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
stripped = re.sub(r"//.*?$", "", stripped, flags=re.M)
# Find Suspense that wraps {children} and ensure <Navbar is not between open and matching close
m = re.search(
    r"<Suspense\s+fallback=\{null\}>\s*\{children\}\s*</Suspense>",
    stripped,
)
if not m:
    print("FAIL: stage.tsx must have Suspense wrapping only {children}", file=sys.stderr)
    sys.exit(1)
after = stripped[m.end():]
if "<Navbar" not in after:
    print("FAIL: <Navbar /> must appear after children Suspense (sibling outside)", file=sys.stderr)
    sys.exit(1)
# Navbar must not also appear inside the children Suspense region
inside = m.group(0)
if "<Navbar" in inside:
    print("FAIL: <Navbar /> must not be inside children Suspense", file=sys.stderr)
    sys.exit(1)
print("OK  Navbar is sibling outside children Suspense")
PY

# Outer layout Container must not get a filled plate (backgroundOpacity / backgroundColor).
# Chips may still use NAV_CHIP backgroundOpacity on Buttons only.
python3 - <<'PY' "$NAVBAR" || fail=1
import re, sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
# Remove Button / NavbarChat / NavbarSettings / Toggle blocks so we only inspect layout Containers
# Heuristic: after DialogAnchor, first Container(s) that are layout wrappers
if re.search(r"CompanionNavbarFrost", text):
    print("FAIL: navbar must not mount CompanionNavbarFrost (slab risk)", file=sys.stderr)
    sys.exit(1)
# Disallow backgroundOpacity/Color on the layout Container that wraps NavbarChat (not on Button)
# Find Container that contains NavbarChat and check its opening tag props
for m in re.finditer(r"<Container\b([^>]*)>", text):
    props = m.group(1)
    # Skip if this opening tag is immediately a chip-only gap row — still forbid plate props on ANY Container in navbar.tsx
    # Buttons use {...NAV_CHIP}; Containers must stay plate-free.
    if "backgroundOpacity" in props or "backgroundColor" in props:
        print(f"FAIL: navbar Container must not set plate props:{props[:80]}", file=sys.stderr)
        sys.exit(1)
if "NAV_CHIP" not in text:
    print("FAIL: navbar should keep NAV_CHIP for floating buttons", file=sys.stderr)
    sys.exit(1)
print("OK  navbar Containers have no filled-plate props; NAV_CHIP present")
PY

# Frost must remain a no-op
if ! grep -qE 'export const CompanionNavbarFrost = \(\) => null' "$FROST"; then
  die "companion-navbar-frost.tsx must stay () => null"
else
  ok "CompanionNavbarFrost is no-op stub"
fi

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "Companion navbar invariants broken. See OpenNexus3DStudio/.cursor/rules/companion-navbar-floating-chips.mdc"
  exit 1
fi

echo "RESULT: Companion navbar invariants PASS"
