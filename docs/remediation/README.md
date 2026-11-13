# Remediation SNAPY OS

Direktori ini adalah pusat koordinasi remediasi temuan audit Owner, Admin, Staff,
Kiosk, dan Authentication/Routing.

## Urutan baca

1. `AUDIT_FINDINGS_MASTER.md` — seluruh temuan, sudah dideduplikasi per akar
   masalah, dengan source ID asli dipertahankan.
2. `AGENT_OWNERSHIP.md` — batas kepemilikan file per workstream.
3. `DEPENDENCY_MAP.md` — ketergantungan modul yang menentukan urutan kerja.
4. `AVAILABLE_TOOLS_AND_SKILLS.md` — skill, MCP, dan tool yang benar-benar
   tersedia di environment ini.
5. `REMEDIATION_PROGRESS.md` — status per finding.
6. `TEST_RESULTS.md` — gate yang dijalankan beserta bukti.
7. `SECURITY_REVIEW.md`, `HARDWARE_VALIDATION.md`, `REGRESSION_REPORT.md`,
   `FINAL_PRODUCTION_READINESS.md` — hasil fase akhir.
8. `BLOCKER_CLOSURE_REPORT.md` — status setiap blocker sprint terakhir.
9. `DATABASE_MIGRATION_VALIDATION.md` — validasi baseline, migrasi 0091, rollback.
10. `DEPENDENCY_SECURITY_REPORT.md` — hasil `npm audit` + keputusan.
11. `E2E_EXECUTION_REPORT.md` — hasil Playwright dan yang belum dijalankan.
12. `agents/` — laporan per agent (A–H).

## Prinsip

- Kode berjalan adalah kenyataan; audit report bisa lebih tua dari kode.
  Setiap finding diverifikasi ulang sebelum diperbaiki.
- Satu akar masalah boleh menutup beberapa finding ID, tetapi semua ID asli
  tetap tercatat.
- Tidak ada klaim PASS tanpa gate yang benar-benar dijalankan.
- Perangkat fisik yang tidak tersedia ditandai `NOT VERIFIED`, bukan PASS.
