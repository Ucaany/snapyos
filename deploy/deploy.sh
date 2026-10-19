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

# --- 4. Susun bundel runtime ------------------------------------------------
# `output: standalone` tidak menyalin static dan public; keduanya wajib ada di
# samping server.js atau CSS/JS/aset akan 404.
log "salin .next/static dan public ke bundel standalone"
mkdir -p "$APP_DIR/.next/standalone/.next"
rm -rf "$APP_DIR/.next/standalone/.next/static"
cp -a "$APP_DIR/.next/static" "$APP_DIR/.next/standalone/.next/static"

rm -rf "$APP_DIR/.next/standalone/public"
if [ -d "$APP_DIR/public" ]; then
  cp -a "$APP_DIR/public" "$APP_DIR/.next/standalone/public"
fi

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
