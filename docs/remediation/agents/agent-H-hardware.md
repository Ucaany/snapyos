# Remediation Report — Agent H (Hardware, Camera, Printer & Runtime)

## 1. Scope
Camera bridge, printer bridge, CUPS job status, retry, device config.

## 2. Findings Verified
- CUPS submit mengembalikan `job_id`; retry lewat endpoint antrean; polling
  status; konfirmasi operator (K-006 sudah tertutup kode).
- Camera list/classify punya unit test.
- Resolusi kamera aktual belum diverifikasi.

## 3. Root Cause
Tidak ada perangkat fisik di environment ini.

## 4. Changes Implemented
Tidak ada perubahan runtime hardware. Perubahan terkait: status booth
maintenance diekspos ke kiosk (Agent A).

## 5. Files Changed
Tidak ada file runtime hardware.

## 6. Tests Executed
`npm test` (runtime print/camera), `npm run build`.

## 7. Test Results
PASS (unit); hardware NOT VERIFIED.

## 8. Before & After
Tidak ada perubahan perilaku hardware.

## 9. Remaining Issues
- Validasi kamera/printer fisik.
- Resolusi aktual, reconnect, paper-out.
- Bridge produksi non-localhost.

## 10. Risks
Tanpa validasi fisik, klaim hardware tidak dapat dibuat.

## 11. Finding Status
K-006 FIXED (already in code); K-012 NOT VERIFIED; hardware NOT VERIFIED.

## 12. Handover
Jalankan `HARDWARE_VALIDATION.md` di booth fisik sebelum production.
