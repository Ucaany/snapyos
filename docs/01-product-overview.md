# 1. Product Overview

## 1.1 Executive Summary

**SnapyOS** adalah platform SaaS (Software as a Service) untuk UMKM dan pemilik bisnis Photobox / Photo Booth. SnapyOS memungkinkan pemilik bisnis untuk **membuat, mengelola, dan menjalankan sistem Photobox milik mereka sendiri** tanpa harus membangun software dari nol.

SnapyOS bukan sekadar website untuk mengambil foto. SnapyOS adalah **"Photobox Business Operating System"** yang menggabungkan:

- Customer-facing Photobox application
- Photo capture
- Template dan frame management
- Branding
- Package management
- Online payment
- QRIS checkout
- Voucher
- Transaction management
- Revenue dashboard
- Finance tracking
- Customer management
- Outlet management
- Photobox management
- Staff management
- Booking
- Event mode
- Reporting
- Subscription SaaS

Pemilik bisnis tidak perlu lagi memakai banyak software terpisah (software photobooth, Google Sheets, spreadsheet finance, software booking, sistem template manual, sistem transaksi manual, dashboard analytics terpisah). SnapyOS menyatukan semuanya dalam satu platform.

## 1.2 Product Vision

Membantu UMKM Photobox memiliki software Photobox mereka sendiri yang **profesional, mudah digunakan, dapat dikustomisasi sesuai brand, dan memiliki sistem pengelolaan bisnis terintegrasi**.

SnapyOS membuat satu alur:

> _membuka bisnis Photobox → menjalankan Photobox → menerima pembayaran → mencatat transaksi → melihat pemasukan → mengelola outlet_

menjadi **satu sistem**.

## 1.3 Problem Statement

Pemilik bisnis Photobox menghadapi:

1. **Fragmentasi tool** — photobooth software, spreadsheet, catatan manual, booking, dan payment terpisah.
2. **Tidak ada branding sendiri** — kebanyakan photobooth software adalah generic app, bukan "milik brand".
3. **Pencatatan transaksi manual** — rentan error, tidak real-time, sulit rekonsiliasi.
4. **Tidak ada visibilitas revenue** — pemilik tidak tahu gross/net revenue, sesi, atau profit secara instan.
5. **Payment offline/manual** — tidak ada QRIS terintegrasi di pengalaman photo.
6. **Sulit scale multi-outlet** — tidak ada dashboard terpusat.

## 1.4 Product Goals

| #   | Goal                                                            | Ukuran                                                   |
| --- | --------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | Owner bisa meluncurkan Photobox pertamanya dengan cepat         | < 15 menit dari register → Photobox live                 |
| 2   | Customer bisa membayar via QRIS lalu mengambil foto tanpa login | alur mulus pay-first: pilih package → bayar → foto       |
| 3   | Revenue & transaksi tercatat otomatis & real-time               | setiap payment sukses → transaction otomatis             |
| 4   | Backend adalah source of truth untuk harga, voucher, & payment  | final amount dihitung server-side                        |
| 5   | Branding owner muncul di seluruh customer app                   | welcome screen, template, result memakai identitas owner |
| 6   | Arsitektur multi-tenant yang aman                               | business A tidak bisa melihat data business B            |
| 7   | Visual identity Neo-Brutalism yang kuat & konsisten             | seluruh aplikasi                                         |

## 1.5 Non-Goals

Berikut **tidak** termasuk scope SnapyOS:

- Referral system
- Loyalty program / loyalty points
- Marketing automation
- Email marketing automation
- Social media scheduler
- Template marketplace / creator marketplace

SnapyOS fokus pada: **PHOTOBOX + BUSINESS MANAGEMENT + PAYMENT + REVENUE + OPERATIONS**.

## 1.6 Target Users

1. Orang yang baru ingin membuka bisnis Photobox
2. Pemilik satu outlet Photobox
3. Pemilik beberapa Photobox
4. Pemilik beberapa outlet
5. Studio foto yang menyediakan Photobox
6. Photobox di mall
7. Photobox di café
8. Photobox di kampus
9. Photobox untuk wedding
10. Photobox untuk birthday
11. Photobox untuk graduation
12. Event organizer
13. Agency
14. Brand activation
15. Bisnis Photobox yang ingin digitalisasi operasional

## 1.7 User Personas

### Persona 1 — New Photobox Owner

- **Karakteristik:** Baru memulai bisnis, tidak terlalu paham teknologi, butuh software siap pakai, budget terbatas, ingin setup cepat.
- **Needs:** Photobox software, branding, template, package, payment, revenue tracking.
- **Pain:** Takut teknis, tidak mau maintain software, butuh harga terjangkau.

### Persona 2 — Existing UMKM

- **Karakteristik:** Sudah punya Photobox & customer, transaksi mulai banyak, masih spreadsheet/manual.
- **Needs:** Dashboard, transactions, revenue, customer data, templates, finance.
- **Pain:** Rekonsiliasi manual, data tersebar, sulit tahu profit.

### Persona 3 — Multi-Outlet Owner

- **Karakteristik:** Beberapa outlet, beberapa booth, punya staff.
- **Needs:** Multi outlet, multi booth, staff, analytics, centralized dashboard, financial reporting.
- **Pain:** Tidak ada visibilitas per outlet/booth, kontrol staff terbatas.

### Persona 4 — Event / Agency

- **Karakteristik:** Pakai Photobox untuk event, butuh branding berbeda per event.
- **Needs:** Event mode, custom branding, custom templates, QR photo delivery, event analytics.
- **Pain:** Harus re-setup branding per event, butuh hasil cepat & terukur.

## 1.8 User Stories

### Owner

- Sebagai owner, saya bisa register & membuat business saya agar punya workspace sendiri.
- Sebagai owner, saya bisa memilih subscription plan sesuai kebutuhan.
- Sebagai owner, saya bisa membuat outlet & photobox sehingga booth saya tersedia.
- Sebagai owner, saya bisa mengatur branding (logo, warna, teks welcome) sehingga customer app terasa milik brand saya.
- Sebagai owner, saya bisa membuat package & template sehingga customer punya pilihan.
- Sebagai owner, saya bisa membuat voucher dengan aturan pakai agar bisa menjalankan promo.
- Sebagai owner, saya bisa melihat dashboard revenue agar tahu performa bisnis harian/bulanan.
- Sebagai owner, saya bisa melihat daftar transaksi dan detailnya untuk rekonsiliasi.
- Sebagai owner, saya bisa mencatat expense agar tahu estimasi profit.
- Sebagai owner, saya bisa menambah staff dengan role tertentu (RBAC).
- Sebagai owner, saya bisa mengelola banyak outlet & booth dari satu dashboard.
- Sebagai owner, saya bisa melihat report & export (CSV/XLSX/PDF).

### Customer

- Sebagai customer, saya bisa membuka Photobox brand (tanpa login) dan langsung memilih package.
- Sebagai customer, saya bisa memasukkan voucher dan membayar via QRIS SEBELUM sesi foto (pay-first).
- Sebagai customer, setelah pembayaran berhasil saya bisa memilih frame/template sesuai package.
- Sebagai customer, saya bisa mengambil foto sesuai jumlah frame, dengan retake (dibatasi timer sesi).
- Sebagai customer, saya bisa mengedit foto (zoom, posisi, filter, stiker, teks).
- Sebagai customer, setelah selesai hasil foto otomatis diprint dan saya mendapat QR ke halaman result online.
- Sebagai customer, saya bisa mengunduh GIF animasi & foto berframe dari halaman result online.

### Admin Platform

- Sebagai admin SnapyOS, saya bisa melihat total business, subscriber aktif, dan MRR.
- Sebagai admin, saya bisa mengelola user, business, plan, dan subscription.
- Sebagai admin, saya bisa mengelola template & kategori platform.
- Sebagai admin, saya bisa memonitor payment volume & status.
