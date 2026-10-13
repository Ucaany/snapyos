# K2 — Setup Wizard (Kamera & Printer): E2E test

Pengujian E2E untuk K2 Setup Wizard. Dua test yang selalu jalan + satu test
skip-default yang butuh booth Supabase live.

## Yang sudah terbukti otomatis (CI-friendly)

### 1. Print pipeline tidak-blank
```bash
npm run test:e2e:print
```
Render halaman yang memakai `@page` + `.print-sheet` SAMA dengan `globals.css`
+ `PrintLayoutRenderer` ke PDF 4×6 (102×152 mm) via Chromium headless, lalu
verifikasi:
- 2 halaman termuat (bukan 1 blank)
- PDF > 5 KB
- 2 `<img>.print-photo` loaded dengan `naturalWidth > 0`
- 0 console error aplikasi

Bukti: `tests/e2e/print-pipeline-evidence.pdf` (169 486 bytes, 2 hal).

### 2. Unit test Setup Wizard validator
- 650/650 `node:test` lewat termasuk `tests/device-report.test.ts` baru
  (4 test untuk schema payload kamera/error/printer/token).

## Yang butuh booth live (skip default)

```bash
E2E_K2=1 \
E2E_BASE=http://localhost:3000 \
E2E_BUSINESS_SLUG=<slug> \
E2E_PHOTOBOX_SLUG=<slug> \
E2E_ACTIVATION_CODE=<6 digit> \
npm run test:e2e:k2
```

Akan jalan di Chromium **headed** dengan:
- `--use-fake-ui-for-media-stream` + `--use-fake-device-for-media-stream`
  (permission kamera auto-approve, stream live; frame YUV kosong di macOS
  tanpa file sumber — `track.readyState==='live'` sudah cukup untuk gate
  "Lanjut" di SetupWizard)
- Stub `window.print()` agar tidak membuka dialog OS
- Verifikasi: kamera live → "Lanjut ke uji cetak" → "Lewati uji cetak" →
  `localStorage['snapyos_device_setup_done:<photoboxSlug>'] === "1"` →
  no console error

## Verifikasi FISIK di booth (manual, butuh manusia + perangkat)

### Kamera asli
1. Sambungkan webcam/USB camera ke booth (atau pakai Continuity Camera iPhone).
2. Di macOS: System Settings → Privacy & Security → Camera → izinkan **Chrome**
   (dan **Chromium** bila pakai Playwright).
3. Buka booth `https://<host>/p/<business>/<booth>` → aktivasi → SetupWizard.
4. Tolak / izinkan permission di dialog OS, konfirmasi stream `live`.

### Printer foto
1. Sambungkan printer foto (DNP/Citizen/Sony/Canon Selphy) via USB atau
   network. Install driver manufacturer.
2. Di Chrome buka `chrome://print` untuk konfigurasi default printer.
3. Kiosk mode: jalankan Chrome dengan flag `--kiosk-printing` agar
   `window.print()` langsung cetak tanpa dialog (lihat SetupWizard copy
   "Cetak senyap tanpa dialog hanya di Chrome desktop flag --kiosk-printing").
4. Uji lewat flow: kamera → "Lanjut ke uji cetak" → "Cetak halaman uji"
   → kertas 4×6 (atau A6) keluar dengan foto, bukan blank.
5. Bila kertas keluar blank: cek driver (PCL/PostScript), `printBackground: true`
   di `PrintLayoutRenderer`, dan ukuran kertas di dashboard owner
   (`printPageSize(settings)` di `src/lib/print-layout.ts:30`).
