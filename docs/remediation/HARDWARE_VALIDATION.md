# HARDWARE VALIDATION

Status: **NOT VERIFIED** — tidak ada kamera, printer, atau bridge fisik di environment
ini. Tidak ada klaim PASS berdasarkan mock atau inspeksi statis.

## Yang diverifikasi lewat kode/unit test

| Area | Temuan | Status |
|---|---|---|
| CUPS submit | `submit()` mengembalikan `job_id`; retry lewat endpoint antrean | PASS (kode) |
| CUPS status | `parseCupsJobs` membedakan queued/processing/completed | PASS (unit test) |
| Print retry | `manualRetryRef` + `retryCupsJob` mencegah kirim ulang buta | PASS (kode) |
| Camera list | `parseCameraListHtml` + `classifyCamera` | PASS (unit test) |
| Camera resolution | Resolusi aktual dilaporkan ke `device_status` | NOT VERIFIED |
| Bridge origin | Loopback-only untuk bridge lokal | PASS (kode) |

## Prosedur manual yang harus dijalankan operator

### Kamera

1. Buka kiosk di mesin booth via HTTPS/localhost.
2. Pairing device, izinkan permission kamera.
3. Masuk setup wizard, pilih kamera, jalankan test capture.
4. Catat resolusi aktual di `device_status.camera`; pastikan >= 720p.
5. Cabut kamera saat kiosk berjalan; pastikan layar error muncul, bukan frame hitam.
6. Colok ulang; pastikan kiosk pulih tanpa reload.

### Printer CUPS

1. `lpstat -p` dan `lpoptions -d` di mesin booth.
2. Cetak test dari setup wizard.
3. Pastikan job muncul di `lpstat -o` dan kertas keluar.
4. Matikan printer saat job dikirim; pastikan status error, bukan sukses palsu.
5. Nyalakan printer, retry; pastikan tidak ada cetak ganda.
6. Cabut kabel USB; pastikan kiosk menampilkan panduan, bukan spinner abadi.

### Alur penuh

Payment → Capture → Editing → Print → Result. Ulangi retry print minimal sekali dan
pastikan `print_count`/entitlement tidak berubah ganda.

## Kesimpulan

Validasi hardware **belum selesai**. Status production readiness tidak boleh READY
sampai prosedur di atas dijalankan di minimal satu booth fisik.
