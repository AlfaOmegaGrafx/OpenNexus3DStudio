# SSH: two hosts only (DGX Spark)

One physical DGX. Two SSH nicknames in Cursor — nothing else.

Real hostnames, LAN/Tailscale IPs, and Windows account paths belong in **local** `~/.ssh/config` only (repo SSH templates are gitignored).

| Cursor name | When to use | Route |
|-------------|-------------|--------|
| **`DGX-Local`** | Spark on same Wi‑Fi / LAN | Direct → LAN host from your SSH config |
| **`DGX-Remote`** | Away from LAN, NVIDIA Sync + Tailscale | Proxy / Tailscale host from your SSH config |

**`dgx-spark.local` is not a third host.** It is only an **address inside** a host block (like a phone number). Prefer picking **`DGX-Local`** / **`DGX-Remote`** in Cursor.

**`Sifr-s-DGX-Spark`** was NVIDIA Sync’s label for the same remote route. Replaced by **`DGX-Remote`** so the list stays at two.

## Files (keep in sync if you rename)

1. Your user `~/.ssh/config` (Windows: under your profile `.ssh\config`)
2. Cursor **Settings** → `remote.SSH.remotePlatform`
3. `OpenNexus3DStudio/.vscode/settings.json`
4. `scripts/dgx-spark.ssh.config` (local template + sign-in repair; gitignored)

## Rules — stop extra “devices”

- **No** `Include` of NVIDIA `ssh_config` (duplicates hosts).
- **No** `Match` blocks (Cursor cannot parse them).
- **No** extra `Host` lines (`dgx-spark`, `dgx-spark-remote`, etc.).
- **One** `Host` line per route = **one** name in Cursor.

## After changes

1. **Developer: Reload Window** in Cursor.
2. Remote SSH → **`DGX-Local`** or **`DGX-Remote`** only.
3. **Old workspace opens `dgx-spark.local`?** That’s a saved Cursor session, not a third machine. Prefer **`DGX-Remote`** for new connections.

## Verify

```powershell
ssh -G DGX-Local 2>&1 | Select-String "^user |^hostname "
ssh -G DGX-Remote 2>&1 | Select-String "^user |^hostname |^proxycommand "
```

Sign-in repair: `scripts/ensure-dgx-ssh-config.ps1` (Startup shortcut) restores the two-host file if the DGX Linux user mapping breaks.
