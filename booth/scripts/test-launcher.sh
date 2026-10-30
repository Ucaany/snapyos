#!/usr/bin/env bash
# Uji statis Jalankan-Booth.cmd tanpa Windows.
#
# Yang bisa dibuktikan di sini: tidak ada blok `if (...)` (penyebab
# "ECHO is off."), tidak ada delayed expansion, setiap goto punya label,
# dan launcher memakai adapter mock Fase 1.
# Yang TIDAK dibuktikan: cmd.exe benar-benar menjalankannya. Itu butuh Windows.
set -u

file="${1:-booth/scripts/Jalankan-Booth.cmd}"
fail=0

check() {
  local name="$1" ; shift
  if "$@" >/dev/null 2>&1; then
    echo "PASS  $name"
  else
    echo "FAIL  $name"
    fail=1
  fi
}

# 1. Tidak ada blok if (...): ekspansi %VAR% di dalamnya terjadi saat parse.
check "tidak ada blok 'if (' bersarang" \
  bash -c "! grep -nE '^[[:space:]]*if[[:space:]]+.*\(|%[A-Za-z_]+%[[:space:]]*\)' '$file'"

# 2. Tidak ada delayed expansion (!VAR!): semua cabang pakai goto.
check "tidak ada delayed expansion '!VAR!'" \
  bash -c "! grep -nE '[^rem].*!%?[A-Za-z_]' '$file'"

# 3. Setiap 'goto :label' punya ':label'.
missing=$(grep -oE 'goto :[A-Za-z_]+' "$file" | sed 's/goto ://' | sort -u |
  while read -r label; do
    grep -qE "^:${label}\$" "$file" || echo "$label"
  done)
if [ -z "$missing" ]; then
  echo "PASS  semua goto punya label"
else
  echo "FAIL  goto tanpa label: $missing"
  fail=1
fi

# 4. Fase 1: launcher wajib menyalakan mock untuk tiga adapter + izin mock.
for key in SNAPYOS_ALLOW_MOCK SNAPYOS_CAMERA SNAPYOS_PRINTER SNAPYOS_CAMERA_STREAM; do
  check "menyetel $key" grep -q "set \"${key}=" "$file"
done

# 5. Token yang ditulis ke berkas berasal dari variabel baris tersendiri.
check "menulis token dari %PHOTOBOOTH_BRIDGE_TOKEN%" \
  grep -qE '^>"%TOKENFILE%" echo %PHOTOBOOTH_BRIDGE_TOKEN%$' "$file"

exit "$fail"
