#!/usr/bin/env bash
set -eu

URL="${SNAPYOS_KIOSK_URL:?SNAPYOS_KIOSK_URL wajib diisi}"
PROFILE="${SNAPYOS_CHROME_PROFILE:-/var/lib/snapyos/chrome-profile}"
CHROME="${CHROME_BIN:-google-chrome}"

mkdir -p "$PROFILE"
exec "$CHROME" \
  --user-data-dir="$PROFILE" \
  --kiosk \
  --kiosk-printing \
  --autoplay-policy=no-user-gesture-required \
  --no-first-run \
  --disable-session-crashed-bubble \
  "$URL"
