#!/usr/bin/env python3
"""Migrate SessionMem team folder from legacy CharacterStudio project ID to OpenNexus3DStudio."""

from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

OLD_ID = "CharacterStudio"
NEW_ID = "OpenNexus3DStudio"
CONTENT_REPLACEMENTS = {
    "Surface disk folder may still be CharacterStudio until renamed. ": "",
    "Character Studio dev split": "OpenNexus3DStudio dev split",
    "character studio dev split": "opennexus3dstudio dev split",
}


def migrate_memories(items: list[dict]) -> list[dict]:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    migrated: list[dict] = []
    for item in items:
        entry = dict(item)
        if entry.get("projectId") == OLD_ID:
            if not entry.get("originProjectId"):
                entry["originProjectId"] = OLD_ID
            entry["projectId"] = NEW_ID
        for field in ("content", "normalizedContent"):
            value = entry.get(field)
            if isinstance(value, str):
                for old, new in CONTENT_REPLACEMENTS.items():
                    value = value.replace(old, new)
                entry[field] = value
        entry["updatedAt"] = now
        migrated.append(entry)
    return migrated


def migrate_team_dir(team_dir: Path) -> None:
    old_dir = team_dir / OLD_ID
    new_dir = team_dir / NEW_ID

    if not old_dir.is_dir():
        if new_dir.is_dir() and any(new_dir.glob("*.json")):
            print(f"Already migrated: {team_dir}")
            return
        raise SystemExit(f"No legacy folder to migrate: {old_dir}")

    new_dir.mkdir(parents=True, exist_ok=True)

    old_names = {p.name for p in old_dir.glob("*.json")}

    for old_file in sorted(old_dir.glob("*.json")):
        raw = json.loads(old_file.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            raise SystemExit(f"Unexpected JSON shape in {old_file}")

        migrated = migrate_memories(raw)
        target = new_dir / old_file.name

        if target.exists():
            existing = json.loads(target.read_text(encoding="utf-8"))
            if not isinstance(existing, list):
                raise SystemExit(f"Unexpected JSON shape in {target}")
            by_id = {item["id"]: item for item in existing if isinstance(item, dict) and "id" in item}
            for item in migrated:
                by_id[item["id"]] = item
            migrated = list(by_id.values())

        target.write_text(json.dumps(migrated, indent=2) + "\n", encoding="utf-8")
        print(f"Migrated {old_file.name}: {len(migrated)} memories -> {target}")

    shutil.rmtree(old_dir)
    print(f"Removed legacy folder: {old_dir}")

    empty_new_files = [p for p in new_dir.glob("*.json") if p.read_text(encoding="utf-8").strip() in ("", "[]")]
    for path in empty_new_files:
        if path.name not in old_names:
            path.unlink()
            print(f"Removed empty placeholder: {path}")


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    team_dir = repo_root / ".sessionmem-team"
    if not team_dir.is_dir():
        raise SystemExit(f"Team folder not found: {team_dir}")
    migrate_team_dir(team_dir)
    print("SessionMem project ID migration complete.")


if __name__ == "__main__":
    main()
