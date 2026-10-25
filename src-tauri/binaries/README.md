# Sidecar Node

Tauri menyalin berkas di sini menjadi `node-<target-triple>.exe` di sebelah EXE.
Untuk Windows x64 namanya **wajib**:

```
binaries/node-x86_64-pc-windows-msvc.exe
```

Isi dengan `node.exe` resmi (Node 22 LTS atau lebih baru; runtime memakai
`node:sqlite`). Ambil dari <https://nodejs.org/dist/> lalu:

```powershell
Copy-Item node.exe binaries\node-x86_64-pc-windows-msvc.exe
```

Berkas ini tidak masuk Git (lihat `.gitignore`), dan tidak bisa disiapkan dari
macOS. Tanpa berkas ini build EXE gagal di langkah bundling, bukan saat runtime.

Runtime yang dijalankan sidecar adalah `runtime-dist/` hasil
`node scripts/build-kiosk-runtime.mjs` (dijalankan otomatis oleh
`beforeBuildCommand`).
