#!/usr/bin/env bash
# SnapyOS: deploy dari checkout Git di VPS.
#
# Pemakaian (di VPS):
#   sudo deploy/deploy.sh
#   sudo APP_DIR=/var/www/snapyos deploy/deploy.sh
#
# Prasyarat: Node >= 22, npm, git, curl, systemd unit snapyos.service, dan
# /var/www/snapyos/.env.production sudah terisi (lihat DEPLOY.md).

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/snapyos}"
SERVICE="${SERVICE:-snapyos}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
APP_USER="${APP_USER:-www-data}"

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "[deploy] $*"; }

[ -d "$APP_DIR/.git" ] || die "$APP_DIR bukan checkout Git"
[ -f "$APP_DIR/.env.production" ] || die "$APP_DIR/.env.production belum ada. Salin dari .env.example lalu isi nilainya"

for c in git npm node curl; do
  command -v "$c" >/dev/null || die "$c tidak ada di PATH"
done

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "butuh Node >= 22, terdeteksi $(node -v)"

cd "$APP_DIR"

# --- 1. Kode terbaru --------------------------------------------------------
log "git pull"
git pull --ff-only

# --- 2. Dependensi ----------------------------------------------------------
# Gagal-closed sebelum install: lockfile tanpa integrity = npm ci memasang apa
# pun yang registry sajikan (substitusi = eksekusi kode saat build sebagai root).
log "check lockfile integrity"
node scripts/check-lockfile-integrity.mjs
log "npm ci"
npm ci --no-audit --no-fund

# Script ops di scripts/*.mjs membaca `.env.local`. Di server nilainya sama
# dengan EnvironmentFile systemd, jadi cukup symlink (di-ignore Git).
ln -sfn "$APP_DIR/.env.production" "$APP_DIR/.env.local"

# --- 3. Build ---------------------------------------------------------------
log "npm run build"
npm run build

[ -f "$APP_DIR/.next/standalone/server.js" ] \
  || die ".next/standalone/server.js tidak ada. Pastikan next.config.ts memakai output: 'standalone'"

# --- 4. Siapkan runtime -----------------------------------------------------
# `npm run build` menjalankan postbuild dan menyalin asset ke bundel standalone.
[ -d "$APP_DIR/.next/standalone/.next/static" ] \
  || die ".next/standalone/.next/static tidak ada setelah postbuild"
[ ! -d "$APP_DIR/public" ] || [ -d "$APP_DIR/.next/standalone/public" ] \
  || die ".next/standalone/public tidak ada setelah postbuild"

# Cache ISR ditulis runtime; pastikan bisa ditulis user service.
mkdir -p "$APP_DIR/.next/standalone/.next/cache"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/.next/standalone/.next/cache"

# Service berjalan sebagai www-data; pastikan bundel terbaca walau umask root
# ketat. `X` hanya menambah execute pada direktori.
chmod -R a+rX "$APP_DIR/.next/standalone"

# --- 5. Restart + health check ---------------------------------------------
log "systemctl restart $SERVICE"
systemctl restart "$SERVICE"

log "menunggu $HEALTH_URL"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS -m 5 "$HEALTH_URL" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done

if [ "$ok" -eq 1 ]; then
  log "PASS: $(curl -sS -m 5 "$HEALTH_URL")"
  exit 0
fi

echo "GAGAL: health check tidak hijau. 40 baris terakhir journal:" >&2
journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
exit 1
