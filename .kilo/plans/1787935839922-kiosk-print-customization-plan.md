# Plan: Fix Print Kiosk (kosong/ukuran) + Kustomisasi Semua Screen + Setting Video Branding

## Context — temuan audit kode (bukan spekulasi)

Gejala "hasil foto & frame tidak muncul, cetak kertas kosong, ukuran tidak sesuai" punya akar penyebab konkret:

1. **Compositing gagal senyap** — `Editor.tsx` frame PNG dimuat dari signed URL Supabase (origin beda). Fix `crossOrigin="anonymous"` + `try/catch` di `finish()` SUDAH ada di working tree (belum commit). Sisa bug: `finish()` tidak menunggu frame selesai load (race → composite tanpa frame), `img.onerror` senyap (frame hilang tanpa pesan), foto slot gagal load → diagnostic grey-X ikut tercetak (`compose-frame.ts:80-91`).
2. **`print_settings` mati** — `PrintSettings` (`kiosk-types.ts:71-79`: `paper_size`, `orientation`, `auto_print`, `copies`, `margins_mm`) TIDAK pernah dikonsumsi dan TIDAK ada UI editornya. `@page` hard-coded `margin: 8mm` tanpa `size:` → Chrome pakai default A4/letter → letterbox/ukuran tidak sesuai printer foto.
3. **Auto-print** — `window.print()` sudah dipanggil otomatis (`PrintLayoutRenderer.tsx:92`), silent print bergantung flag Chrome `--kiosk-printing`.
4. **Mirror mismatch** — preview mirror CSS-only (`CameraCapture.tsx:157`), capture raw → hasil tidak seperti preview.
5. **Branding** — hanya welcome yang punya layout customization; payment/editor/result hanya teks + align (`KioskBrandingEditor.tsx`). Editor stiker/emoji/teks SUDAH berfungsi penuh (`StickerPicker.tsx`, `photo-render.ts drawOverlay`), fallback glyph bila `EMOJI_API_KEY` kosong.
6. **Result `/r/[token]`** — hanya GIF + grid foto; tidak ada tombol print; `download` attribute cross-origin diabaikan browser.
7. **Video branding** — selalu `object-cover` opacity hard-coded (`WelcomeScreen.tsx:114-126`); tidak ada setting zoom/rasio.

Working tree punya fix yang belum di-commit (globals.css print flow, CameraCapture fallback, Editor crossOrigin/catch, TemplatePicker empty state). **Commit fix ini dulu sebagai baseline.**

Keputusan user:
- Ukuran kertas: **customizable, default mengikuti ukuran/aspek frame** (bukan preset printer tetap).
- Result page: **foto + GIF saja** (tanpa rekam video — out of scope).
- Setting zoom/rasio video: **video branding (welcome kiosk) saja**.

---

## Phase 1 — Fix compositing (foto + frame muncul)

1. `src/components/kiosk/Editor.tsx`:
   - Simpan promise load frame di ref; `finish()` meng-`await` frame load (dengan timeout ~5s) sebelum `composeFrame` → composite tidak pernah lagi tanpa frame karena race.
   - `frameUrl` ada tapi `img.onerror` → set error state di UI ("Frame gagal dimuat — coba lagi"), jangan render senyap tanpa frame.
   - Foto slot gagal decode → tampilkan error & blokir `finish()` (jangan biarkan grey diagnostic-X masuk hasil final/print).
2. `src/components/kiosk/photo-render.ts:77` — clamp `panX/panY` seperti `slotPlacement` (`template-layout.ts:147-150`) → foto tidak bisa pan keluar view (blank canvas).
3. `src/lib/camera-capture.ts` — saat `mirror_preview: true`, flip horizontal saat `drawImage` (translate+scale) → hasil = preview.
4. Pertahankan `crossOrigin` + `try/catch finish()` yang sudah ada.

## Phase 2 — Print presisi ukuran + otomatis (ikut frame)

1. Extend `src/lib/print-layout.ts` (atau file baru `src/lib/print-sheet.ts`):
   - `paperSize(printSettings, photoAspect)` → `{ wMm, hMm }`:
     - `paper_size: "auto"` (default) → aspek = aspek komposit/frame; sisi panjang = 152.4mm (6").
     - Preset `"4x6"`, `"2x6"`, `"a6"`, `"letter"` + custom `{w,h} mm`.
   - `orientation` menentukan swap w/h.
2. `src/components/kiosk/PrintLayoutRenderer.tsx`:
   - Terima `printSettings` + hitung aspek foto dari `naturalWidth/Height` img.
   - Sebelum `window.print()`: inject `<style id="snapyos-print-css">` berisi `@page { size: Wmm Hmm; margin: {margins_mm}mm }` + `.print-sheet { width/height mm }`; hapus di `afterprint`/cleanup. Ini menggantikan `@page` hard-coded di globals.css (hapus margin statisnya).
   - `.print-photo`: `width:100%; height:100%; object-fit:contain` (fit satu halaman presisi).
   - `copies` → duplikasi sheet N kali.
   - Strip tanpa template: tetap stack vertikal dalam SATU sheet 2x6 (bukan N halaman).
   - `auto_print !== false` → langsung print otomatis (perilaku sekarang); false → tunggu tombol.
   - Pertahankan retry/skip + afterprint + timeout.
3. Server/validator: extend zod `print_settings` di validator photobox (`src/lib/validators.ts`) — `paper_size`, `orientation`, `auto_print`, `copies` (1–10), `margins_mm` (0–10).
4. **UI owner**: tambah `PrintSettingsEditor` di page `/dashboard/photoboxes/[id]/camera` (ubah heading jadi "Kamera & Cetak") — reuse action update photobox yang sudah ada, tambah persist `print_settings`. Include tombol "Tes cetak" (window.print dengan sheet dummy ber-aspek sama).
5. SetupWizard (`SetupWizard.tsx:192`): teks setupChrome `--kiosk-printing` untuk silent auto-print (panduan singkat + link docs).

## Phase 3 — Kustomisasi layout semua screen (branding)

Extend `kioskBrandingSchema` (`src/lib/validators.ts:100-127`) + `KioskBrandingEditor.tsx` + terapkan di tiap screen. Pattern sama seperti `welcome_layout` yang sudah ada:

1. **Payment** (`CheckoutScreen.tsx`): `payment_layout: "split" | "stacked" | "centered"` (posisi panel QRIS vs ringkasan), warna panel QRIS, `payment_align` sudah ada.
2. **Editor** (`Editor.tsx`): `editor_layout: "tools-bottom" | "tools-side" | "tools-top"` (posisi panel filter/stiker/teks), warna panel tools.
3. **Result kiosk** (`ResultScreen.tsx`): `result_layout` sudah ada (qr-right/left/below) — tambah `result_qr_size` (S/M/L) + `result_photo_size` (fit/fill).
4. Semua nilai punya default = perilaku sekarang (backward compatible, data lama aman).
5. Update live-preview tabs di `KioskBrandingEditor` (preview 5 screen sudah ada) agar render varian layout baru.
6. **Verifikasi editor emote/stiker/teks**: pastikan `EMOJI_API_KEY` ter-set di env produksi (fallback 8 glyph sudah ada); manual test overlay teks + emoji ter-render di composite final & print (sudah lewat `drawOverlay` — hanya verifikasi, bukan rebuild).

## Phase 4 — Result page `/r/[token]`

1. Tambah tombol **Cetak** + print CSS: reuse pola sheet Phase 2 (inject `@page size` sesuai aspek foto saat klik print) — hanya foto (bukan GIF) yang dicetak.
2. Tampilan: foto framed grid (ada) + GIF (ada) — pastikan foto tampil besar/utama; video out of scope.
3. Fix `download` cross-origin (`r/[token]/page.tsx:67-73,90-96`): client-side fetch signed URL → blob → object URL → anchor download (atau proxy `/api/v1/public/.../download`).

## Phase 5 — Setting video branding (zoom + rasio)

1. `kioskBrandingSchema.kiosk`: tambah `video_zoom` (1–3, default 1), `video_fit` (`"cover"|"contain"`, default cover), `video_position` (`center/top/bottom/left/right`, default center), `video_opacity` (0.1–1, default 0.5).
2. `KioskBrandingEditor.tsx` section video (baris 419-447): slider zoom + select fit/position + slider opacity, live preview video.
3. `WelcomeScreen.tsx:114-126`: ganti `opacity-50` hard-coded → inline style `{objectFit, objectPosition, transform: scale(zoom), opacity}`. (Transform scale pada video full-bleed: pastikan wrapper `overflow:hidden`.)

---

## Validation

1. `npm run lint` + `npx tsc --noEmit` (atau script typecheck yang ada).
2. Jalankan test suite yang ada (`tests/`, `npm test` bila terdaftar).
3. Manual matrix kiosk (`/p/...`):
   - Template dengan layout → composite frame+foto muncul di result, print otomatis, `@page size` = aspek frame (cek print preview).
   - Tanpa template (per-foto) → print N lembar ukuran benar.
   - Strip mode → 1 lembar 2x6, bukan N halaman.
   - Offline path (devtools offline) → queue IndexedDB, result pendingSync.
   - Frame load gagal (URL disabit) → error UI, bukan composite kosong.
   - Mirror on → hasil tercetak = preview.
   - Editor: stiker emoji + teks muncul di composite final.
4. Dashboard: branding preview semua layout baru tersimpan & ter-render di kiosk; print settings tersimpan & dipakai kiosk.
5. `/r/[token]`: tombol print keluar ukuran benar; download menghasilkan file (bukan navigasi).

## Risks / catatan

- Print CSS Chrome sensitif terhadap timing preview — `waitForImg` + settle delay sudah ada; inject style harus sebelum `window.print()` dan dihapus setelah `afterprint`.
- `@page size` diabaikan sebagian printer driver (selalu scaling "fit to page") — dokumentasikan setting driver printer "Actual size / 100%".
- Data branding lama tanpa field baru → semua default = perilaku lama; tidak perlu migrasi DB (jsonb).
- Rekam video sesi & video di result page = OUT OF SCOPE (keputusan user).
