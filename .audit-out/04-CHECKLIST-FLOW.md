# Checklist Verifikasi Flow — SNAPY OS

Gunakan ini untuk memverifikasi ulang hasil audit, baik di mesin pengembang maupun di booth
setelah installer terpasang.

---

## A. Otomatis (bisa dijalankan sekarang)

```bash
npm test            # harus 1153 lulus, 0 gagal
npx tsc --noEmit    # harus 0 error
npm run lint        # harus 0 error (warning no-img-element sudah ada sebelumnya)
npm run build       # harus sukses
cd src-tauri && cargo clippy   # harus 0 warning
```

Hasil yang diharapkan: lihat `evidence/`.

---

## B. Kontrak kepemilikan setelan (tanpa server)

```bash
node --experimental-strip-types --test tests/settings-ownership.test.ts
```

Harus lulus 33 tes. Yang dijaga:

- [ ] `appearance_settings` terdaftar sebagai grup milik booth
- [ ] `appearance_settings` **tidak** ada di `CLOUD_SYNCED_DEVICE_GROUPS`
- [ ] `copies` dan `layout` tetap di `CLOUD_OWNED_SETTING_FIELDS.print_settings`
- [ ] payload panel tidak pernah membawa `copies`, `layout`, harga, paket, gateway
- [ ] booth menang atas cloud untuk tampilan
- [ ] logo, warna brand, video tetap milik cloud
- [ ] `pickAppearance` membuang `video_key` dan field asing
- [ ] dokumentasi menyebut modul yang benar-benar ada

---

## C. Probe runtime nyata (loopback)

```bash
D=$(mktemp -d)
PHOTOBOOTH_BRIDGE_TOKEN=test-token-0123456789abcdef \
PHOTOBOOTH_BRIDGE_PORT=17898 SNAPYOS_DATA_DIR="$D" \
SNAPYOS_CAMERA=mock SNAPYOS_PRINTER=mock SNAPYOS_ALLOW_MOCK=1 \
node src-tauri/runtime-dist/main.mjs &

T="X-Bridge-Token: test-token-0123456789abcdef"

# 1. simpan setelan booth (kamera + tampilan) → 200
curl -s -X PUT http://127.0.0.1:17898/v1/settings -H "$T" \
  -H "Content-Type: application/json" \
  -d '{"appearance_settings":{"bg_color":"#101820","padding":40},"camera_settings":{"countdown_seconds":4}}'

# 2. baca kembali → appearance_settings muncul
curl -s http://127.0.0.1:17898/v1/settings -H "$T"

# 3. tulis field uang → HARUS 403 FIELD_NOT_DEVICE_OWNED
curl -s -w "\nHTTP %{http_code}\n" -X PUT http://127.0.0.1:17898/v1/settings -H "$T" \
  -H "Content-Type: application/json" -d '{"print_settings":{"copies":5}}'

# 4. nilai di luar kontrak → HARUS 400
curl -s -w "\nHTTP %{http_code}\n" -X PUT http://127.0.0.1:17898/v1/settings -H "$T" \
  -H "Content-Type: application/json" -d '{"appearance_settings":{"font_scale":3}}'

# 5. tanpa token → HARUS 401
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:17898/v1/settings

# 6. export tidak membawa PIN
curl -s http://127.0.0.1:17898/v1/settings/export -H "$T"
```

Hasil yang diharapkan: lihat `evidence/runtime-probe.txt`.

- [ ] `PUT` setelan booth → `200`
- [ ] `GET` mengembalikan `appearance_settings`
- [ ] `copies` → `403 FIELD_NOT_DEVICE_OWNED`
- [ ] `font_scale: 3` → `400 INVALID_SETTINGS`
- [ ] tanpa token → `401`
- [ ] export tanpa `exit_pin`

---

## D. Uji di booth (setelah installer terpasang)

### D.1 Aktivasi & setup
- [ ] Buka aplikasi booth → layar aktivasi muncul
- [ ] Masukkan kode 6 karakter dari dashboard → terpasang
- [ ] Setup wizard: izin kamera diberikan, kamera terdeteksi
- [ ] Uji cetak berhasil
- [ ] Kiosk masuk ke layar sambutan (welcome)

### D.2 Panel setelan booth
- [ ] Ikon ⚙ kecil terlihat di kiri-bawah
- [ ] Klik ⚙ → dialog PIN muncul dengan judul **"Setelan booth"**
- [ ] PIN salah → ditolak, ada pesan
- [ ] PIN benar → panel terbuka, **fullscreen TIDAK lepas**
- [ ] Ubah `countdown_seconds` → Simpan → status "Setelan tersimpan di booth ini."
- [ ] Tutup panel → layar sambutan memakai nilai baru (tanpa reload)
- [ ] Buka lagi ⚙ → nilai tersimpan masih ada (bertahan setelah restart aplikasi)

### D.3 Pemisahan cloud vs booth
- [ ] Di panel, **tidak ada** input jumlah salinan (`copies`) maupun layout
- [ ] Di panel, **tidak ada** input harga, paket, atau payment gateway
- [ ] Di dashboard `/dashboard/photoboxes`, field kamera/printer/sesi **tidak ada**
- [ ] Di dashboard `/dashboard/branding`, logo & warna brand masih bisa diubah
- [ ] Ubah warna latar di panel booth → hanya booth itu yang berubah
- [ ] Buka booth lain di business yang sama → tampilannya **tidak** ikut berubah

### D.4 Kustomisasi tampilan
- [ ] Ubah `bg_color` di panel → layar sambutan berganti warna
- [ ] Ubah `welcome_title` → judul sambutan berganti
- [ ] Kosongkan `welcome_title` → kembali memakai judul dari website
- [ ] Logo dari website **tetap tampil** setelah booth dikustomisasi
- [ ] Video promosi dari website **tetap diputar**

### D.5 Offline
- [ ] Cabut kabel jaringan → booth tetap bisa memulai sesi (bila runtime hidup)
- [ ] Sesi selesai saat offline → tersimpan lokal, layar hasil menyebut "menunggu sinkronisasi"
- [ ] Sambungkan jaringan → sesi terkirim, layar hasil menampilkan QR
- [ ] PIN darurat lokal berfungsi saat jaringan mati
- [ ] PIN salah 5× → terkunci 5 menit

### D.6 Keluar kiosk (regresi)
- [ ] Tahan tombol 🔒 3 detik → dialog PIN **"Keluar mode kiosk"**
- [ ] PIN benar → fullscreen lepas, sesi tidak terputus
- [ ] Buka kembali → sesi berjalan di-resume

---

## E. Yang tidak bisa diverifikasi dari mesin pengembang

| Butir | Alasan | Cara verifikasi |
|---|---|---|
| Build `.exe`/`.msi` | WiX/NSIS + sidecar Windows | `.\scripts\build-booth.ps1` di Windows x64 |
| Kamera DSLR (digiCamControl/gphoto2) | Butuh kamera fisik | Uji di booth |
| Printer spooler / thermal | Butuh printer fisik | Uji di booth |
| Sesi offline berhari-hari | Butuh waktu nyata | Uji lapangan |
| Updater | `SNAPYOS_UPDATE_ENDPOINT` kosong | Isi endpoint → cek log |

---

## F. Tanda PASS

Semua kotak di B, C, dan D.2–D.4 tercentang, ditambah:

- [ ] `npm test` → 1153 lulus
- [ ] `npx tsc --noEmit` → bersih
- [ ] `npm run lint` → 0 error
- [ ] `npm run build` → sukses
- [ ] `cargo clippy` → 0 warning
