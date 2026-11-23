#!/usr/bin/env bash
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
SERVICE_DIR="/etc/systemd/system"
ENV_DIR="/etc/snapyos"

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' "Jalankan sebagai root: sudo deploy/kiosk/install.sh" >&2
  exit 2
fi

apt-get update
apt-get install -y cups curl gphoto2 nodejs
install -d -m 0750 "$ENV_DIR" /var/lib/snapyos
install -m 0644 "$ROOT/deploy/kiosk/snapyos-bridge.service" "$SERVICE_DIR/snapyos-bridge.service"

if [ ! -f "$ENV_DIR/bridge.env" ]; then
  install -m 0600 "$ROOT/deploy/kiosk/bridge.env.example" "$ENV_DIR/bridge.env"
  printf '%s\n' "Isi /etc/snapyos/bridge.env, lalu jalankan systemctl enable --now snapyos-bridge." >&2
  exit 0
fi

chmod 0600 "$ENV_DIR/bridge.env"
systemctl daemon-reload
systemctl enable --now snapyos-bridge
systemctl --no-pager --full status snapyos-bridge
