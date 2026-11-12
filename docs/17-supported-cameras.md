# 17 — Kamera yang Didukung (gphoto2)

Snapshot publik katalog libgphoto2/gphoto2. Halaman web: `/kamera`.

- Sumber: print-camera-list
- Versi libgphoto2: 2.5.34
- Tanggal snapshot: 2026-11-11T14:58:08.604Z
- Jumlah model: 2778

## Jumlah per tipe

- dslr: 124
- mirrorless: 106
- compact: 505
- action: 18
- other: 2025

## Label kemampuan booth

- `full` — Siap booth (capture/trigger + liveview): 433
- `capture` — Capture saja (tanpa liveview): 149
- `transfer` — Transfer file saja: 697
- `unknown` — Belum terverifikasi: 1499

## Brand teratas

| Brand | Model |
|---|---|
| Lainnya | 1509 |
| Canon | 360 |
| Nikon | 207 |
| Sony | 187 |
| Kodak | 90 |
| Fujifilm | 83 |
| Olympus | 79 |
| Samsung | 51 |
| HP | 44 |
| Ricoh | 26 |

## Cara membaca label

`booth_support` diturunkan dari abilities resmi gphoto2, bukan uji perangkat.
Kamera PTP generik dapat tetap bekerja meski tidak tercantum; sebaliknya model
`transfer` hanya menjamin unduh file, bukan capture dari kiosk.

Atribusi: daftar berdasarkan libgphoto2/gphoto2 (LGPL). Snapshot dibuat oleh
`npm run sync:cameras`; periksa kesegaran dengan `npm run sync:cameras -- --check`.
