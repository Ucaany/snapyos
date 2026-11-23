#!/usr/bin/env bash
set -eu

BASE="${SNAPYOS_BRIDGE_URL:-http://127.0.0.1:17777}"
TOKEN="${PHOTOBOOTH_BRIDGE_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  printf '%s\n' "PHOTOBOOTH_BRIDGE_TOKEN wajib diisi sebelum doctor berjalan." >&2
  exit 2
fi

curl --fail --silent "$BASE/health" | node -e '
let raw=""; process.stdin.on("data", c => raw += c).on("end", () => {
  const body = JSON.parse(raw);
  if (body.ok !== true) process.exit(1);
  console.log(`[OK] health camera=${body.camera === true}`);
});'

curl --fail --silent -H "X-Bridge-Token: $TOKEN" "$BASE/v1/camera/status" | node -e '
let raw=""; process.stdin.on("data", c => raw += c).on("end", () => {
  const body = JSON.parse(raw);
  if (body.connected !== true) process.exit(1);
  console.log(`[OK] camera ${body.model || "connected"}`);
});'

curl --fail --silent -H "X-Bridge-Token: $TOKEN" "$BASE/v1/printer/status" | node -e '
let raw=""; process.stdin.on("data", c => raw += c).on("end", () => {
  const body = JSON.parse(raw);
  if (body.ok !== true || ["offline", "unknown"].includes(body.state)) process.exit(1);
  console.log(`[OK] printer ${body.printer || "default"} state=${body.state}`);
});'

if command -v gphoto2 >/dev/null 2>&1; then
  gphoto2 --auto-detect
else
  printf '%s\n' "[WARN] gphoto2 tidak terpasang; gunakan kamera browser atau pasang adapter DSLR." >&2
fi

if command -v lpstat >/dev/null 2>&1; then
  lpstat -p -d
else
  printf '%s\n' "[WARN] lpstat tidak terpasang; mode CUPS tidak siap." >&2
fi
