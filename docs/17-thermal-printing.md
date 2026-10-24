# 17. Thermal Printing (80mm, ESC/POS)

Status (2026-10-19): **jalur browser Web Bluetooth sudah diimplementasi.**
Printer thermal ESC/POS 58/80mm dicetak langsung dari kiosk lewat Chrome
(`src/lib/print/` + `BluetoothPrintScreen`), dengan encoder raster/teks/QR,
chunking 20 byte, dan reconnect. Agent lokal + antrean server (§17.3–17.7)
tetap **non-goal** dan tidak dibangun.
Prasyarat: `docs/05-customer-photobox.md` §5.15, `docs/pos/01-architecture.md` A12.

---

## 17.1 Ringkasan keputusan

Tabel ini mencerminkan **implementasi aktual**, bukan usulan. Desain agent lokal
+ antrean server (§17.3–17.7) tetap non-goal dan tidak dibangun.

| Keputusan              | Pilihan (implementasi)                                                                    | Alasan                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Jalur cetak            | Tiga mode: `browser` (dialog OS), `bluetooth` (thermal), `cups` (bridge lokal)             | Kiosk desktop dapat cetak senyap; tablet/iPad tetap lewat dialog OS.            |
| Protokol printer       | **ESC/POS** (raster `GS v 0` + teks)                                                       | Standar de facto printer thermal 58/80mm.                                       |
| Lebar kertas           | **80mm = 576 dot / 48 karakter**. 58mm didukung sebagai opsi (384 dot / 32 karakter).      | Default permintaan; 58mm dipakai sebagian POS.                                  |
| Transport thermal      | Web Bluetooth (GATT) dan Web Serial (Classic SPP) dari browser kiosk                       | Tidak butuh agent; Chrome desktop/Android. iPad/Safari tetap dialog sistem.     |
| Render gambar          | **Browser** yang decode + dither (`src/lib/print/photo-bitmap.ts`)                         | VPS dibatasi `MemoryMax=768M`; raster dibuat di klien.                          |
| Printer foto (4x6)     | `cups` via bridge lokal, atau dialog OS                                                    | DNP/Selphy/inkjet apa pun yang terlihat CUPS.                                   |
| Mode cetak             | `print_settings.mode: "browser" \| "bluetooth" \| "cups"`, default `"browser"`             | Jalur printer foto (DNP/Selphy) yang sudah ada tidak boleh rusak.               |
| Antrean / status job   | **Tidak ada** — kirim sekali, tombol ulangi manual                                           | Belum dibangun; lihat §17.3 sebagai rancangan, bukan status.                    |

---

## 17.2 Kenapa tidak langsung dari browser

Permintaan "langsung dicetak" (tanpa dialog) tidak bisa dipenuhi browser di ketiga target:

| Target         | `window.print()`                            | Web Bluetooth                                          | Web Serial            |
| -------------- | ------------------------------------------- | ------------------------------------------------------ | --------------------- |
| Chrome desktop | Senyap hanya dengan flag `--kiosk-printing` | Ada, tapi butuh gesture + pilih device tiap sesi       | Ada di desktop Chrome |
| Chrome Android | Selalu dialog sistem                        | Ada, gesture wajib, tidak ada auto-reconnect           | Tidak ada             |
| Safari/iPadOS  | Selalu dialog sistem                        | **Tidak ada sama sekali** (semua browser iOS = WebKit) | Tidak ada             |

Karena iPad harus jalan, jalur browser murni gugur. Agent lokal adalah satu-satunya bentuk yang bekerja identik di ketiganya, karena dari sisi browser hanya ada `fetch()` ke origin sendiri.

> **Status §17.3–17.7: rancangan yang TIDAK dibangun.** Tidak ada tabel
> `print_jobs`/`print_agents`, tidak ada `src/server/print-jobs.ts`, tidak ada
> `/dashboard/printers`. Yang ada adalah tiga jalur di §17.1. Jangan membaca
> bagian di bawah sebagai dokumentasi fitur aktif.

---

## 17.3 Arsitektur (rancangan, belum dibangun)

```
Browser kiosk / POS
   │  POST /api/v1/public/print-jobs   (device_token)      ← kiosk
   │  server action posPrintReceipt    (session staff)     ← POS
   ▼
Next.js API  ──►  Supabase: print_jobs (pending)
   ▲
   │  GET  /api/v1/print-agents/jobs/next   (Bearer agent token, poll 1 dtk)
   │  POST /api/v1/print-agents/jobs/:id/ack
   │
Print agent (Node, LAN booth)
   ├── transport lan     : TCP ke <ip>:9100
   ├── transport serial  : /dev/cu.* atau COMx (USB-CDC / Bluetooth SPP)
   └── transport usb     : raw USB (fase 3)
         │
         ▼
   Printer thermal 80mm
```

Alur satu job:

1. Kiosk selesai finalize, atau kasir menekan "Bayar".
2. Server membuat baris `print_jobs` dengan status `pending`. Payload dibangun **di server** dari `session_id` atau `order_id`, bukan dari body browser, supaya browser tidak bisa menyuntik URL atau nominal.
3. Agent mem-poll, mengklaim satu job secara atomik (RPC `claim_print_job`), mencetak, lalu ack.
4. Browser mem-poll `GET /api/v1/public/print-jobs/:id` dan menampilkan status nyata: `pending`, `printing`, `printed`, `failed`.

Kenapa antrean di server, bukan browser langsung ke agent:

- Tidak ada mixed content. Halaman HTTPS ke `http://192.168.x.x` diblokir browser. Lewat origin sendiri, aman.
- Tidak perlu ubah CSP (`connect-src` tetap `'self' https: wss:`).
- iPad tidak perlu memasang certificate profile.
- Job tetap tercetak walau tab kiosk sempat reload.
- Status cetak jadi fakta (`printed`/`failed`), bukan tebakan `afterprint`.

Biaya: latensi poll 1 detik. Bisa diturunkan dengan long-poll 20 detik di fase 2 kalau terasa.

---

## 17.4 Skema database

Migrasi baru `db/migrations/0072_thermal_print_agents.sql` plus rollback.

```sql
create table print_agents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  photobox_id uuid references photoboxes (id) on delete cascade, -- null = semua booth bisnis
  name text,
  token_hash text not null,                    -- sha256, pola sama dengan devices
  status text not null default 'active' check (status in ('active','revoked')),
  transport text not null default 'lan' check (transport in ('lan','serial','usb')),
  printer_host text,                           -- lan
  printer_port integer not null default 9100,  -- lan
  serial_path text,                            -- serial
  paper_width_mm integer not null default 80 check (paper_width_mm in (58,80)),
  app_version text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_print_agents_business on print_agents (business_id, status);
create index idx_print_agents_token_hash on print_agents (token_hash);

create table print_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  photobox_id uuid not null references photoboxes (id) on delete cascade,
  agent_id uuid references print_agents (id) on delete set null,
  kind text not null check (kind in ('pos_receipt','photo_result','test')),
  status text not null default 'pending'
    check (status in ('pending','claimed','printed','failed','expired')),
  payload jsonb not null,                      -- bentuk per kind, lihat §17.5
  error text,
  attempts integer not null default 0,
  claimed_at timestamptz,
  printed_at timestamptz,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);
create index idx_print_jobs_claim on print_jobs (photobox_id, status, created_at);
create index idx_print_jobs_cleanup on print_jobs (created_at);
```

RPC klaim atomik, mengikuti pola `pos_complete_payment`:

```sql
create or replace function claim_print_job(p_agent_id uuid, p_business_id uuid, p_photobox_id uuid)
returns setof print_jobs
language plpgsql
as $$
begin
  return query
  update print_jobs j
     set status = 'claimed', agent_id = p_agent_id, claimed_at = now(), attempts = j.attempts + 1
   where j.id = (
     select id from print_jobs
      where business_id = p_business_id
        and status = 'pending'
        and (p_photobox_id is null or photobox_id = p_photobox_id)
        and expires_at > now()
      order by created_at
      limit 1
      for update skip locked
   )
  returning j.*;
end;
$$;
```

Reaper: job berstatus `claimed` lebih dari 60 detik dikembalikan ke `pending`; `attempts >= 3` jadi `failed`. Dijalankan di cron yang sama dengan cleanup (§17.9).

RLS: `enable row level security` + policy `service_role` saja, sama seperti `pos_orders` dan `devices`.

---

## 17.5 Bentuk payload

### 17.5.1 `pos_receipt`

Dibangun oleh `src/lib/thermal/receipt.ts` (fungsi murni, unit-testable) dari `PosOrderDetail` + `businessName`.

```json
{
  "width_mm": 80,
  "business_name": "Snapy Studio",
  "header": ["STRUK PENJUALAN", "POS-20261017-0007"],
  "meta": [
    ["Metode", "TUNAI"],
    ["Booth", "Booth 1"],
    ["Outlet", "Cabang Kemang"],
    ["Kasir", "Rina"],
    ["Waktu", "17/10/26 19.42"]
  ],
  "items": [{ "name": "Cetak Foto 4R", "qty": 2, "subtotal": 30000 }],
  "totals": [
    { "label": "Subtotal", "value": 30000 },
    { "label": "Diskon", "value": 0 },
    { "label": "TOTAL", "value": 30000, "emphasis": true }
  ],
  "footer": ["Terima kasih. SnapyOS POS"],
  "cut": true,
  "drawer": false
}
```

Agent merender ke ESC/POS. `emphasis` memakai `ESC E 1` (bold) + `GS ! 0x11` (dobel tinggi/lebar).

### 17.5.2 `photo_result`

```json
{
  "width_mm": 80,
  "business_name": "Snapy Studio",
  "title": "HASIL SESI",
  "photos": [{ "url": "<signed R2, TTL 5 menit>", "order_index": 0 }],
  "layout": "single",
  "copies": 1,
  "footer": ["Kode sesi: 8F2A91", "17/10/26 19.42"],
  "qr_url": "https://test.snapyos.biz.id/r/ab12cd34",
  "cut": true
}
```

Susunan lembar per `sheet` (mengikuti `printPlan` yang sudah ada di `src/lib/print-layout.ts`):

```
[ header 96 dot: nama bisnis (dobel tinggi) + judul ]
[ foto 576 dot lebar, tinggi proporsional, cap 1152 dot ]
[ footer: QR 200x200 dot, kode sesi, waktu ]
[ feed 3 baris + potong ]
```

`layout: "strip"` menumpuk semua foto dalam satu lembar, masing-masing di-cap 576 dot tinggi supaya satu strip tidak melebihi ~60cm kertas. `copies` dan `print_count` tetap dihitung `printPlan`, jadi tidak ada logika baru.

### 17.5.3 `test`

```json
{
  "width_mm": 80,
  "business_name": "Snapy Studio",
  "lines": ["UJI CETAK", "Agen: booth-1", "17/10/26 19.42"],
  "cut": true
}
```

---

## 17.6 Agent

Direktori baru `agent/`, terpisah dari build Next. Tidak masuk `tsconfig` app.

```
agent/
  package.json
  bin/snapyos-print-agent.mjs
  src/config.mjs        parse flag + env
  src/poller.mjs        loop klaim, ack, backoff
  src/escpos.mjs        encoder teks, raster, QR, cut, drawer
  src/dither.mjs        grayscale + Floyd-Steinberg + pack 1bpp
  src/render.mjs        payload -> byte ESC/POS
  src/transports/lan.mjs
  src/transports/serial.mjs
  README.md
```

Dependensi: `jpeg-js` (decode foto). `serialport` sebagai `optionalDependency` supaya `lan` tetap bisa jalan tanpa native build. `node:test` untuk unit test, dijalankan dari root repo.

Cara pakai:

```bash
npx snapyos-print-agent \
  --token <agent-token> \
  --base https://test.snapyos.biz.id \
  --transport lan \
  --host 192.168.1.50 \
  --width 80
```

Untuk Bluetooth: pair printer di OS (Bluetooth Settings), OS membuat port serial virtual, lalu:

```bash
npx snapyos-print-agent --token <agent-token> --transport serial --path /dev/cu.Xprinter-SPP
```

Ini menghindari `@abandonware/noble` yang tidak dirawat dan butuh rebuild native. Pairing Bluetooth jadi tanggung jawab OS, yang justru lebih stabil dan bisa auto-reconnect.

Siklus poll:

```
loop:
  job = GET /jobs/next
  if job:
     bytes = render(job.payload)          # foto diunduh dari signed URL, di-cache per URL
     transport.write(bytes)
     POST /jobs/:id/ack { status: "printed" }
  else sleep 1000
```

Error handling: transport putus → ack `failed` dengan pesan, agent tetap hidup dan mencoba lagi di job berikutnya. Jangan retry job yang sama dari sisi agent (server yang mengatur `attempts`).

---

## 17.7 Perubahan server (rancangan, belum dibangun)

### Baru

| File                                                              | Isi                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/thermal/receipt.ts`                                      | Builder payload struk, murni                                                |
| `src/lib/thermal/payload.ts`                                      | Tipe payload + builder `photo_result` dan `test`                            |
| `src/server/print-jobs.ts`                                        | `createPrintJob`, `claimNextJob`, `ackJob`, `getJobStatus`, `reapStaleJobs` |
| `src/server/print-agents.ts`                                      | `createAgent`, `listAgents`, `revokeAgent`, `resolveAgentToken`             |
| `src/server/print-agent-actions.ts`                               | Server action owner: buat/revoke agen, uji cetak                            |
| `src/app/api/v1/public/print-jobs/route.ts`                       | `POST` dengan `device_token` + `session_id`                                 |
| `src/app/api/v1/public/print-jobs/[id]/route.ts`                  | `GET` status, scope device                                                  |
| `src/app/api/v1/print-agents/jobs/next/route.ts`                  | `GET` klaim, Bearer agent                                                   |
| `src/app/api/v1/print-agents/jobs/[id]/ack/route.ts`              | `POST` ack                                                                  |
| `src/app/api/v1/business/[businessId]/print-agents/route.ts`      | Owner list + create                                                         |
| `src/app/api/v1/business/[businessId]/print-agents/[id]/route.ts` | Owner revoke                                                                |
| `src/app/api/cron/print-jobs/route.ts`                            | Reaper + hapus job lebih dari 24 jam                                        |
| `src/app/(dashboard)/dashboard/printers/page.tsx`                 | Halaman pengaturan printer                                                  |
| `src/components/dashboard/PrintAgentPanel.tsx`                    | Pairing, token, transport, uji cetak, status                                |

### Diubah

| File                                          | Perubahan                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/validators.ts`                       | `printSettingsSchema` tambah `mode`, `agent_id`, `paper_width_mm`. Skema baru `printAgentCreateSchema`, `printJobAckSchema` |
| `src/lib/kiosk-types.ts`                      | `PrintSettings` mengikuti skema                                                                                             |
| `src/server/booth-actions.ts`                 | Parse field baru saat simpan booth                                                                                          |
| `src/server/photoboxes.ts`                    | Merge `print_settings` tetap, tidak ada perubahan struktur                                                                  |
| `src/components/dashboard/PhotoboxForm.tsx`   | Pilihan mode cetak + pilih agen                                                                                             |
| `src/components/kiosk/KioskApp.tsx`           | Arahkan step cetak ke thermal bila mode thermal                                                                             |
| `src/components/kiosk/ThermalPrintScreen.tsx` | Komponen baru: enqueue, status, retry, lewati                                                                               |
| `src/components/kiosk/SetupWizard.tsx`        | Uji cetak thermal menggantikan `window.print()` bila mode thermal                                                           |
| `src/components/pos/ReceiptView.tsx`          | Tombol cetak thermal + auto-cetak saat mount                                                                                |
| `src/components/dashboard/DeviceDialog.tsx`   | Tampilkan status agen                                                                                                       |
| `vercel.json`, `deploy/cron/snapyos.cron`     | Jadwal cron baru                                                                                                            |

### Kontrak API

`POST /api/v1/public/print-jobs`

```json
{ "device_token": "<64 hex>", "session_id": "<uuid>", "kind": "photo_result" }
```

Respons `dataEnvelope({ job_id, status: "pending" })`. Rate limit 30/menit per IP dan per device.

`GET /api/v1/public/print-jobs/:id`

```json
{ "data": { "id": "...", "status": "printed", "printed_at": "..." } }
```

`GET /api/v1/print-agents/jobs/next` (Bearer)

```json
{ "data": { "id": "...", "kind": "photo_result", "payload": { ... } } }
```

`204` bila tidak ada job. Setiap request memperbarui `print_agents.last_seen_at`.

`POST /api/v1/print-agents/jobs/:id/ack`

```json
{ "status": "printed" }
{ "status": "failed", "error": "ENOTFOUND 192.168.1.50" }
```

---

## 17.8 Perubahan UI (rancangan, belum dibangun)

### Dashboard: Pengaturan printer

Halaman `/dashboard/printers`, satu panel per agen.

Isi panel:

- Nama agen dan booth terikat.
- Status: `Aktif, terakhir terlihat 3 dtk lalu` / `Belum pernah terhubung` / `Dicabut`.
- Perintah instalasi dalam blok kode, token ditampilkan sekali saat dibuat.
- Transport dan alamat printer.
- Lebar kertas: 80mm (default) atau 58mm.
- Tombol `Uji cetak` yang membuat job `test` dan menampilkan status sampai `printed` atau `failed`.

Empty state: "Belum ada agen cetak. Buat agen untuk mulai mencetak langsung." dengan tombol `Buat agen`.

### Photobox form

Tambah field:

- `Mode cetak`: `Printer foto (browser)` atau `Printer thermal (agen)`.
- Bila thermal: pilih agen, pilih lebar kertas.

Field 4x6/A6/orientasi/margin disembunyikan saat mode thermal, karena tidak relevan. `copies` dan `auto_print` tetap.

### Kiosk

Step `printing` dipecah:

```ts
const mode = currentPhotobox.print_settings.mode ?? "browser";
setStep(shouldPrint ? (mode === "thermal" ? "thermal-print" : "printing") : "result");
```

`ThermalPrintScreen` memakai bahasa visual overlay yang sama dengan `PrintLayoutRenderer`:

| State          | Teks                                                 |
| -------------- | ---------------------------------------------------- |
| `pending`      | `MENUNGGU PRINTER`                                   |
| `claimed`      | `MENCETAK...`                                        |
| `printed`      | `SELESAI DICETAK`                                    |
| `failed`       | `GAGAL MENCETAK` + tombol `Coba lagi` dan `Lanjut`   |
| timeout 20 dtk | `PRINTER TIDAK MERESPONS` + `Coba lagi` dan `Lanjut` |

`Lanjut` selalu ada supaya kiosk tidak macet.

### POS

`ReceiptView` mendapat dua aksi:

- `Cetak ke printer thermal` (utama saat mode thermal).
- `Cetak via browser` (sekunder, jalur lama tetap hidup).

Saat mode thermal dan `auto_print` aktif, job dibuat sekali saat mount. Guard `useRef` mencegah double-enqueue pada React Strict Mode.

---

## 17.9 Operasional (rancangan, belum dibangun)

Cron baru `GET /api/cron/print-jobs`, Bearer `CRON_SECRET`, pola sama dengan `device-cleanup`:

1. `claimed` lebih dari 60 dtk → `pending` (attempts sudah naik saat klaim).
2. `attempts >= 3` → `failed`.
3. `pending` melewati `expires_at` → `expired`.
4. Hapus job `printed`/`failed`/`expired` lebih dari 24 jam.

Jadwal: setiap 5 menit. Daftarkan di `vercel.json` dan `deploy/cron/snapyos.cron`.

---

## 17.10 Yang sengaja tidak dibangun

| Ditolak                                 | Alasan                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Web Bluetooth dari browser              | Tidak ada di iOS. Tidak bisa auto-reconnect. Butuh gesture tiap sesi. Gagal untuk kiosk unattended. |
| Web Serial                              | Tidak ada di Android dan iOS.                                                                       |
| Print langsung browser ke IP printer    | Mixed content diblokir. Butuh cert profile di iPad.                                                 |
| ESC/POS dari server langsung ke printer | VPS tidak berada di LAN booth.                                                                      |
| Cetak saat kiosk offline                | Butuh antrean lokal di agent. Ditunda, lihat §17.12.                                                |
| Email struk                             | Di luar cakupan.                                                                                    |

---

## 17.11 Fase implementasi

**Fase 1, fondasi dan POS (paling kecil yang berguna)**

1. Migrasi `0072` + RPC `claim_print_job`.
2. `src/lib/thermal/receipt.ts` + test.
3. `src/server/print-jobs.ts`, `src/server/print-agents.ts`.
4. Endpoint agent (`next`, `ack`) dan endpoint publik (`POST`, `GET`).
5. `agent/` dengan transport `lan` dan `serial`.
6. `PrintAgentPanel` + halaman `/dashboard/printers`.
7. `ReceiptView` tombol thermal.
8. Cron reaper.

Hasil: struk POS 80mm tercetak langsung.

**Fase 2, hasil foto photobox**

9. `payload.ts` builder `photo_result`.
10. `agent/src/dither.mjs` + `render.mjs`.
11. `ThermalPrintScreen` + routing di `KioskApp`.
12. `SetupWizard` uji cetak thermal.
13. `PhotoboxForm` mode cetak.

Hasil: foto BW 80mm tercetak langsung setelah finalize.

**Fase 3, penyempurnaan**

14. Transport `usb` raw (printer tanpa serial).
15. Long-poll 20 dtk untuk menurunkan latensi.
16. Antrean lokal agent untuk mode offline.
17. Laporan jumlah cetak per booth di dashboard.

---

## 17.12 Risiko dan mitigasi

| Risiko                     | Mitigasi                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Agent mati, job menumpuk   | `expires_at` 10 menit, reaper, status `failed` terlihat di kiosk dan dashboard.                         |
| Foto BW terlihat kasar     | Dithering Floyd-Steinberg, bukan threshold. Ekspos `dither: "floyd" \| "threshold"` di pengaturan agen. |
| Printer 58mm dianggap 80mm | `paper_width_mm` eksplisit per agen, memengaruhi 48 vs 32 karakter dan 576 vs 384 dot.                  |
| Bluetooth putus            | Pairing lewat OS, agent membuka ulang port saat write gagal. Tidak ada state BLE di agent.              |
| Token agen bocor           | Hanya hash di DB, bisa dicabut kapan saja, rate limit per token.                                        |
| Kiosk offline              | Job tidak dibuat; kiosk menampilkan `Lewati cetak`. Fase 3 menambah antrean lokal.                      |
| Server menambah beban      | Tidak ada decode gambar di server. Payload struk kecil.                                                 |

---

## 17.13 Verifikasi

Unit test (`npm test`, node test runner, tanpa DB):

- `tests/thermal-receipt.test.ts`: pemetaan `PosOrderDetail` ke payload, pembungkusan nama item panjang, 48 vs 32 karakter, total emphasis, order number, waktu WIB.
- `tests/thermal-payload.test.ts`: `photo_result` mengikuti `printPlan` untuk `single`, `strip`, `print_count` 0, dan `copies`.
- `tests/thermal-dither.test.ts`: grayscale + Floyd-Steinberg pada gambar sintetis 8x8, hasil pack 1bpp, lebar baris dibulatkan ke byte.
- `tests/print-jobs.test.ts`: validasi skema, transisi status yang diizinkan, kedaluwarsa.

Agent (tanpa printer fisik):

- `node --test agent/test/*.test.mjs`: encoder ESC/POS menghasilkan byte yang diharapkan untuk header, bold, raster, QR, cut.
- Transport `lan` diuji dengan TCP server palsu yang menerima byte dan membandingkannya.

End-to-end dengan printer sungguhan:

1. Buat agen di `/dashboard/printers`, salin token.
2. Jalankan agent dengan `--transport lan --host <ip printer>`.
3. Panel harus berubah ke `terakhir terlihat beberapa detik lalu`.
4. Tekan `Uji cetak`. Kertas keluar, status berubah `printed`.
5. POS: buat order, bayar, struk keluar tanpa dialog.
6. Kiosk: selesaikan satu sesi, foto BW keluar setelah finalize.
7. Matikan printer, ulangi. Status harus `failed` dengan pesan transport, kiosk menampilkan `Coba lagi`.

Regresi yang wajib tetap hijau:

- `npm run verify`.
- `tests/tablet-pwa-print.test.ts` (jalur browser tidak berubah).
- `tests/e2e/editor-flow.spec.mjs` dan `tests/e2e/kiosk-full.spec.mjs` dengan mode `browser`.

---

## 17.14 Dokumentasi yang perlu diperbarui

| File                                    | Perubahan                                                     |
| --------------------------------------- | ------------------------------------------------------------- |
| `docs/05-customer-photobox.md` §5.15    | Tambah §5.15.6 Thermal printing, mode `browser` vs `thermal`  |
| `docs/pos/01-architecture.md` A12       | A12 diganti: struk browser tetap ada, thermal lewat agent     |
| `docs/pos/01-architecture.md` non-goals | Hapus "printer thermal SDK" dari daftar tolak                 |
| `docs/07-database-schema.md`            | Tabel `print_agents`, `print_jobs`                            |
| `docs/08-api-spec.md`                   | Endpoint job dan agen                                         |
| `docs/12-roadmap-mvp.md`                | Pindahkan "printer thermal" dari luar cakupan ke fase selesai |
| `docs/status.md`                        | Catatan implementasi                                          |
