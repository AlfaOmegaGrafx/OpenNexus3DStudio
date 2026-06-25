# DGX Spark — two devices

## What is what

| You see in NVIDIA Sync | SSH name (Cursor) | Address underneath | When |
|------------------------|-------------------|--------------------|------|
| **DGX Sparks local** | `DGX-Local` | `dgx-spark.local` | At home |
| **DGX Sparks remote** | `DGX-Remote` | `100.93.124.59` | Away |

**DGX-Local in SSH config is correct.** Prefer **Remote SSH → DGX-Local** or **DGX-Remote**.

**Old Cursor session still says `dgx-spark.local`?** That hostname is not a third machine — it is the address under DGX-Local. Cursor uses `~/.ssh/config-cursor` (includes main config + maps `dgx-spark.local` → user `sifr`). NVIDIA Sync still uses `~/.ssh/config` (two hosts only).

NVIDIA Sync uses `~/.ssh/config` + `nvsync.key`. If Sync fails but Cursor worked before, the key on the Spark needs reinstalling — not deleting `DGX-Local`.

## Auto-guard (keeps this layout after updates)

Golden templates live in `scripts/` (`dgx-spark.ssh.config`, `cursor-ssh-extras.config`, etc.). The guard restores them when NVIDIA Sync or Cursor drifts.

**One-time install** (Windows sign-in + before every `npm run dev`):

```powershell
cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio
.\scripts\install-dgx-ssh-guard.ps1
```

Manual check: `npm run dgx:guard`

The guard **does not** re-pair NVIDIA Sync or delete hosts — it only restores config files, strips bad `Include` lines, fixes BOMs, and resets Cursor SSH settings. Use the repair scripts below if auth or remote pairing breaks.

## Fix auth (from repo root)

```powershell
cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio
.\scripts\repair-dgx-auth.ps1
```

This script:
- **Keeps** `DGX-Local` and `DGX-Remote` in `~/.ssh/config`
- **Installs** the NVIDIA Sync public key on the Spark (password once)
- **Re-registers** with NVIDIA Sync without wiping SSH config

## Fix DGX Sparks remote only (`knownhost: remote host not known`)

Local already works — use this script. It does **not** change DGX-Local.

```powershell
cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio
.\scripts\repair-dgx-remote.ps1
```

## Cursor terminal stuck reconnecting (cmd.exe spam)

Stale `cursor-server` on the Spark causes multiplex **401** and an endless reconnect loop.

```powershell
cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio
.\scripts\fix-cursor-remote-loop.ps1
```

Quit Cursor fully, run the script, reopen, connect via **DGX-Local** (not `dgx-spark.local`).

## Other scripts

```powershell
cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio
.\scripts\repair-nvidia-sync-devices.ps1   # remove old junk names only
.\scripts\restart-nvidia-sync.ps1          # app won't open
```

## DGX → Surface (reverse SSH)

Let the Spark SSH **into** the Surface (`alfao@10.0.0.32`) for sync scripts, file pulls, etc.

**One-time (Administrator PowerShell on Surface):**

```powershell
cd C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio
.\scripts\install-surface-openssh-server.ps1
```

**Then (normal PowerShell):**

```powershell
.\scripts\allow-dgx-ssh-to-surface.ps1
```

This fetches (or creates) `~/.ssh/id_ed25519` on the Spark, adds it to `~/.ssh/authorized_keys` on the Surface, fixes key ACLs, and appends `Host Surface-PC` to the Spark `~/.ssh/config`.

**Test from DGX:**

```bash
ssh Surface-PC hostname
# or: ssh alfao@10.0.0.32
```

Surface LAN IP is auto-detected (Wi-Fi first). Tailscale (`100.94.x.x`) is not used for LAN SSH unless you add a separate host block.
