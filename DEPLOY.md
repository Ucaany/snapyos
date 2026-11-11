# Deploy SnapyOS ke VPS

Target: Ubuntu 22.04/24.04, 2 vCPU, 3.6 GB RAM, tanpa Docker. Nginx di depan,
Node dijalankan systemd.

## Prasyarat

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git curl

node -v          # v22.x atau lebih baru
```

```bash
# User service (www-data sudah ada di Ubuntu; perintah ini aman diulang)
id www-data

# Folder aplikasi
sudo mkdir -p /var/www/snapyos
sudo chown www-data:www-data /var/www/snapyos

# Clone repo
sudo -u www-data git clone <URL_REPO> /var/www/snapyos
```

## Isi environment di server

Rahasia tidak pernah masuk Git. Buat file terpisah yang hanya dibaca systemd:

```bash
sudo cp /var/www/snapyos/.env.example /var/www/snapyos/.env.production
sudo chown root:www-data /var/www/snapyos/.env.production
sudo chmod 0640 /var/www/snapyos/.env.production
sudo nano /var/www/snapyos/.env.production
```

Nilai yang wajib benar di production:

| Variabel                                              | Catatan                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`           | kunci server, jangan sampai ke klien            |
| `AUTH_SECRET`                                         | `openssl rand -base64 32`                       |
| `AUTH_URL`, `SnapyOS_PUBLIC_BASE_URL`                 | `https://test.snapyos.biz.id`                   |
| `CRON_SECRET`                                         | `openssl rand -hex 32`                          |
| `PAYMENT_ENCRYPTION_KEY`                              | `openssl rand -hex 32`, beda dari `AUTH_SECRET` |
| `TURNSTILE_SECRET_KEY`, `TURNSTILE_ALLOWED_HOSTNAMES` | wajib; tanpa ini login ditolak                  |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                      | public, aman di bundle                          |
| `DEV_SKIP_PAYMENT=false`                              | wajib false                                     |
| `*_CRON_OPEN`                                         | kosongkan semua                                 |

`EnvironmentFile` systemd tidak mendukung tanda kutip berlapis dengan andal.
Tulis nilai apa adanya, satu variabel per baris. Simpan juga `CRON_SECRET` di
`/var/www/snapyos/.cron-secret` (mode 0600) untuk dipakai cron (lihat bagian
Cron).

## Pasang service dan Nginx

```bash
sudo cp /var/www/snapyos/deploy/snapyos.service /etc/systemd/system/snapyos.service
sudo systemctl daemon-reload
sudo systemctl enable snapyos
```

```bash
sudo cp /var/www/snapyos/deploy/nginx-snapyos.conf /etc/nginx/sites-available/snapyos
sudo ln -sf /etc/nginx/sites-available/snapyos /etc/nginx/sites-enabled/snapyos
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Nginx membatasi body request ke `25M`. Finalize upload di aplikasi menerima
sampai 50 MB, jadi kiriman 25-50 MB ditolak Nginx dengan 413. Naikkan
`client_max_body_size` bila ukuran itu memang perlu didukung.

TLS wajib untuk produksi. Certbot mengubah blok di atas menjadi `listen 443`
dan menambah redirect dari port 80:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d test.snapyos.biz.id
```

## Cron

VPS tidak punya Vercel Cron. Pasang jadwal pengganti:

```bash
sudo sh -c 'printf "export CRON_SECRET=%s\n" "$(grep -E "^CRON_SECRET=" /var/www/snapyos/.env.production | cut -d= -f2-)" > /var/www/snapyos/.cron-secret'
sudo chmod 0600 /var/www/snapyos/.cron-secret
```

```bash
sudo cp /var/www/snapyos/deploy/cron/snapyos.cron /etc/cron.d/snapyos
sudo chmod 0644 /etc/cron.d/snapyos && sudo chown root:root /etc/cron.d/snapyos
```

Jadwal mengikuti `vercel.json` dan berjalan dalam UTC. Set zona sistem VPS ke UTC:

```bash
sudo timedatectl set-timezone UTC
```

## Lifecycle R2 (retensi & hemat biaya)

Cloudflare R2 menyimpan objek sampai ada yang menghapusnya. Cron aplikasi
(`retention`, `orphan-sweep`) adalah jalur utama; lifecycle rule adalah jaring
pengaman bila cron mati atau backlog.

Pasang sekali per bucket (idempotent — aman diulang setelah deploy):

```bash
node scripts/r2-lifecycle.mjs --dry-run   # lihat rencana
node scripts/r2-lifecycle.mjs             # pasang + verifikasi
```

Aturan yang dipasang:

| Bucket                                            | Aturan                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `generated-photos` (`R2_BUCKET_GENERATED_PHOTOS`) | `Expiration.Days = 3`, `AbortIncompleteMultipartUpload.DaysAfterInitiation = 1`                            |
| `business-assets` (`R2_BUCKET_BUSINESS_ASSETS`)   | TANPA expire (logo/template aset jangka panjang), `AbortIncompleteMultipartUpload.DaysAfterInitiation = 1` |

Script membaca ulang konfigurasi setelah PUT dan gagal (exit 1) bila aturan
tidak sesuai. Pada deploy legacy satu bucket (`R2_BUCKET` saja untuk kedua
area), expire 3 hari **tidak** dipasang karena akan menghapus aset bisnis.

`node scripts/r2-lifecycle.mjs --delete` menghapus konfigurasi lifecycle.

Env terkait cron sweep: `ORPHAN_SWEEP_DRY_RUN=1` (mode lapor-saja) dan
`ORPHAN_SWEEP_CRON_OPEN=1` (dev tanpa `CRON_SECRET`). Di production keduanya
harus kosong. Sweep juga menerima `?dry_run=1` untuk satu kali jalan.

## Deploy

```bash
cd /var/www/snapyos
sudo deploy/deploy.sh
```

Skrip menjalankan `git pull --ff-only`, `npm ci`, `npm run build`, menyalin
`.next/static` dan `public` ke bundel standalone, restart service, lalu menunggu
`/api/health` hijau.

Deploy manual dengan langkah yang sama:

```bash
cd /var/www/snapyos && git pull --ff-only && npm ci && npm run build
```

```bash
cd /var/www/snapyos && cp -a .next/static .next/standalone/.next/static && cp -a public .next/standalone/public && sudo systemctl restart snapyos
```

## Lihat log

```bash
journalctl -u snapyos -f
```

```bash
journalctl -u snapyos --since "30 min ago"
```

```bash
journalctl -u snapyos -p err -n 100
```

Log Nginx ada di `/var/log/nginx/access.log` dan `/var/log/nginx/error.log`.

## Rollback

Rollback ke commit sebelumnya, lalu jalankan deploy ulang:

```bash
cd /var/www/snapyos && git log --oneline -10
```

```bash
cd /var/www/snapyos && sudo git checkout <commit-sebelumnya> && sudo deploy/deploy.sh
```

`git pull --ff-only` di deploy berikutnya gagal bila HEAD dalam keadaan detached.
Kembali ke branch sebelum deploy rutin berikutnya:

```bash
cd /var/www/snapyos && sudo git checkout main && sudo git pull --ff-only
```

Rollback hanya mengembalikan kode. Migrasi database di `db/migrations/`
dijalankan manual dan tidak ikut dibatalkan.
