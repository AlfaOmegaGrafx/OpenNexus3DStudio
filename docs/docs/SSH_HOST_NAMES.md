# SSH: two hosts only (DGX Spark)

One physical DGX. Two SSH nicknames in Cursor — nothing else.

| Cursor name | When to use | Route |
|-------------|-------------|--------|
| **`DGX-Local`** | Spark on same Wi‑Fi / LAN | Direct → `10.0.0.158`, user `sifr` |
| **`DGX-Remote`** | Away from LAN, NVIDIA Sync + Tailscale | Proxy → hostname `dgx-spark.local`, user `sifr` |

**`dgx-spark.local` is not a third host.** It is only the **address inside** `DGX-Remote` (like a phone number). You never pick it in Cursor.

**`Sifr-s-DGX-Spark`** was NVIDIA Sync’s label for the same remote route. Replaced by **`DGX-Remote`** so the list stays at two.

## Files (keep in sync if you rename)

1. `C:\Users\alfao\.ssh\config`
2. Cursor **Settings** → `remote.SSH.remotePlatform`
3. `OpenNexus3DStudio/.vscode/settings.json`
4. `scripts/dgx-spark.ssh.config` (template + sign-in repair)

## Rules — stop extra “devices”

- **No** `Include` of NVIDIA `ssh_config` (duplicates hosts).
- **No** `Match` blocks (Cursor cannot parse them).
- **No** extra `Host` lines (`dgx-spark`, `dgx-spark-remote`, etc.).
- **One** `Host` line per route = **one** name in Cursor.

## After changes

1. **Developer: Reload Window** in Cursor.
2. Remote SSH → **`DGX-Local`** or **`DGX-Remote`** only.
3. **Old workspace opens `dgx-spark.local`?** That’s a saved Cursor session, not a third machine. `remote.SSH.remotePlatform` marks it as Linux so you aren’t prompted. SSH maps `dgx-spark.local` → same settings as **`DGX-Remote`**. Prefer **`DGX-Remote`** for new connections.

## Verify

```powershell
ssh -G DGX-Local 2>&1 | Select-String "^user |^hostname "
ssh -G DGX-Remote 2>&1 | Select-String "^user |^hostname |^proxycommand "
```

Sign-in repair: `scripts/ensure-dgx-ssh-config.ps1` (Startup shortcut) restores this two-host file if `user sifr` breaks.
