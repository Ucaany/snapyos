# E2E Kiosk — suite baru (2026-10-19)

Suite lama (K-FULL/K-LIVE/K2/K8/K9/K10) dihapus bersama artefaknya. Semua spec
di sini memakai helper bersama dan mencatat PASS/FAIL per assertion.

## Struktur

```
tests/e2e/
  run.mjs                          # runner: all | kiosk | bluetooth | standalone
  helpers/env.mjs                  # .env.local + URL dasar
  helpers/booth.mjs                # mint kode, reset booth, aktivasi, print settings
  helpers/browser.mjs              # Chromium temp profile + kamera palsu
  helpers/bluetooth-mock.mjs       # navigator.bluetooth palsu + rekam byte
  helpers/flows.mjs                # langkah UI bersama
  helpers/report.mjs               # pencatat PASS/FAIL
  kiosk-smoke.spec.mjs
  kiosk-lock.spec.mjs
  kiosk-frames.spec.mjs
  kiosk-responsive.spec.mjs
  kiosk-print-browser.spec.mjs
  kiosk-print-bluetooth.spec.mjs
```

## Prasyarat

- `npm run dev` (dev server di `http://localhost:3000`, atau set `E2E_BASE`).
- `.env.local` berisi `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` (dipakai
  untuk mint kode aktivasi sekali pakai dan menutup sesi menggantung).
- Booth uji: `E2E_BUSINESS_SLUG` (default `klik-foto-dev`) dan
  `E2E_PHOTOBOX_SLUG` (default `booth-02`).
- Untuk alur yang melewati pembayaran, jalankan dev server dengan
  `DEV_SKIP_PAYMENT=true`.

## Menjalankan

```bash
npm run test:e2e:print                # pipeline cetak browser (tanpa server, tanpa DB)
npm run test:e2e:kiosk                # smoke, lock, frames, responsive
npm run test:e2e:bluetooth            # mock ESC/POS (otomatis, tanpa hardware)
npm run test:e2e:bluetooth:real       # PRINTER ASLI — Chrome berjendela, Anda pilih printer
npm run test:e2e                      # semua suite otomatis
```

## Bluetooth fisik (`test:e2e:bluetooth:real`)

Spec ini membuka Chrome berjendela dan menelusuri UI produksi: aktivasi →
Setup Wizard → tahap uji cetak → tombol "Cetak halaman uji". Dialog pemilih
perangkat Chrome muncul; pilih printer thermal Anda. Spec lalu memeriksa:

- mode wizard benar-benar Bluetooth thermal (bukan dialog sistem),
- job ESC/POS terkirim (`Perintah cetak terkirim`),
- jumlah byte yang ditulis ke karakteristik GATT (> 0, dan > 5 KB untuk job 80mm),
- hasil uji tersimpan lewat tombol "Ya, berhasil".

Setelah selesai, periksa fisik: halaman uji tercetak utuh dan kertas terpotong.
Itu satu-satunya bagian yang tidak bisa dibuktikan browser.

Variabel opsional:

- `E2E_CHROME_PATH` — path Chrome/Chromium tertentu.
- `E2E_BT_PICK_TIMEOUT_MS` — batas tunggu memilih printer (default 180000).

## Kamera

Harness memakai `--use-fake-device-for-media-stream` (frame sintetis
deterministik). Kamera fisik membuat renderer Chromium crash pada mesin ini, dan
profil Chrome pengguna diblokir macOS. Verifikasi kamera nyata dilakukan manual
oleh operator.

## Checklist fisik (manual, wajib untuk rilis booth)

1. Nyalakan printer foto dan printer thermal Bluetooth, pasangkan keduanya di OS.
2. Chrome → `/dashboard/photoboxes/<id>/camera` → uji kamera: pilih kamera booth,
   ambil foto, retake, cek hasil tidak terbalik/terputar.
3. Panel "Test printer": cetak lewat dialog sistem dengan kertas 4x6, konfirmasi.
4. Ubah jalur cetak booth ke Bluetooth thermal 80mm, simpan, buka kiosk, uji
   cetak dari Setup Wizard, konfirmasi hasil fisik (termasuk potong kertas).
5. Selesaikan satu sesi foto penuh di kiosk dan pastikan lembar thermal tercetak
   penuh, bukan terpotong.
6. Tahan `Ctrl+Alt+X` 2 detik → dialog PIN muncul. Masukkan PIN salah 5 kali →
   booth terkunci 5 menit dengan hitung mundur.
