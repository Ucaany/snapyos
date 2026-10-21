#!/usr/bin/env bash
set -euo pipefail

if command -v apt-get >/dev/null 2>&1; then
  if [ "$(id -u)" -eq 0 ]; then
    apt-get update
    apt-get install -y gphoto2 cups
  else
    sudo apt-get update
    sudo apt-get install -y gphoto2 cups
  fi
elif command -v brew >/dev/null 2>&1; then
  brew install gphoto2
else
  printf '%s\n' "Tidak menemukan apt-get atau Homebrew. Pasang gphoto2 dan CUPS sesuai OS kiosk." >&2
  exit 1
fi

gphoto2 --version
lpstat -d || true
printf '%s\n' "Bridge siap. Jalankan: npm run bridge:gphoto2"
