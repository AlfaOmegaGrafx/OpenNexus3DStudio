#!/usr/bin/env bash
# Raise Linux inotify watch limit (fixes Vite "Unable to watch for file changes" on DGX).
set -euo pipefail
CONF="/etc/sysctl.d/99-inotify-watches.conf"
echo "Setting fs.inotify.max_user_watches=524288 in ${CONF}"
echo 'fs.inotify.max_user_watches=524288' | sudo tee "$CONF" >/dev/null
sudo sysctl -p "$CONF"
echo "Current limit: $(cat /proc/sys/fs/inotify/max_user_watches)"
