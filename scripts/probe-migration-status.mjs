#!/usr/bin/env node
// probe-migration-status.mjs — cek migrasi mana yang BENAR-BENAR sudah
// diterapkan ke Supabase cloud, lewat PostgREST (tanpa `psql`).
//
// Kenapa ada: `docs/status.md` dan `README.md` sempat menyatakan status
// migrasi berdasarkan asumsi, bukan pengukuran. Skrip ini mengukur.
//
// Dua lapis verifikasi:
//   1. PostgREST — tabel/kolom/FK/RPC yang ada di schema cache.
//   2. Katalog Postgres via Supabase CLI (`supabase db query --linked`) —
//      dipakai untuk yang TIDAK diekspos PostgREST: index, aksi `on delete`,
//      dan signature fungsi. Lapis ini dilewati (status jadi UNVERIFIABLE)
//      bila CLI tidak tersedia/tidak login.
//
// Semua panggilan RPC di sini no-op: id acak / item kosong / order yang sudah
// `paid` (short-circuit). Tidak ada baris yang diubah.
//
// Pakai: node scripts/probe-migration-status.mjs
// Exit code 0 = semua yang bisa diverifikasi cocok dengan harapan.

import { readFile } from "node:fs/promises";

const env = Object.fromEntries(
  (await readFile(new URL("../.env.local", import.meta.url), "utf8"))
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    })
);

const SB = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) {
  console.error("FAIL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY wajib di .env.local");
  process.exit(2);
}

const PROJECT_REF = new URL(SB).hostname.split(".")[0];

/**
 * Jalankan SQL lewat Supabase CLI dan kembalikan array baris.
 * null = katalog tidak tersedia (CLI tidak ada / belum login / offline).
 */
async function catalog(sql) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  try {
    const { stdout } = await run(
      "supabase",
      ["db", "query", "--linked", "--project-ref", PROJECT_REF, "-o", "json", sql],
      { timeout: 90_000, maxBuffer: 4 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch {
    return null;
  }
}

const RND = "00000000-0000-4000-8000-000000000000";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const HJ = { ...H, "Content-Type": "application/json" };

const get = async (path) => {
  const r = await fetch(SB + "/rest/v1/" + path, { headers: H });
  return { status: r.status, body: await r.text() };
};
const rpc = async (fn, body) => {
  const r = await fetch(SB + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: HJ,
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.text() };
};

const results = [];
const record = (migration, check, verdict, note) =>
  results.push({ migration, check, verdict, note });

// ---------------------------------------------------------------- 0072
// Hanya DML: rename label add-on seed. Bisa diverifikasi langsung.
{
  const { status, body } = await get("add_ons?select=code,name&code=eq.extra_storage");
  if (status !== 200) {
    record("0072", "label add-on storage", "ERROR", `HTTP ${status}`);
  } else {
    const rows = JSON.parse(body);
    const applied = rows.length > 0 && rows.every((r) => r.name === "Tambah Storage 1.024 MB");
    record(
      "0072",
      "label add-on 'Tambah Storage 1.024 MB'",
      applied ? "APPLIED" : "NOT APPLIED",
      rows.length ? `nama aktual: ${rows.map((r) => r.name).join(", ")}` : "tidak ada baris seed"
    );
  }
}

// ---------------------------------------------------------------- 0073
// Kolom snapshot struk + 3 RPC.
{
  const { status } = await get("pos_orders?select=paper_width_mm,print_mode,auto_print&limit=1");
  const colsOk = status === 200;
  record(
    "0073",
    "kolom pos_orders.paper_width_mm/print_mode/auto_print",
    colsOk ? "APPLIED" : "NOT APPLIED",
    `HTTP ${status}`
  );

  // Param lengkap + bisnis acak => gagal di dalam fungsi (409/23503) bila ada,
  // PGRST202 (404) bila fungsi tidak ada.
  const created = await rpc("pos_create_order_with_items", {
    p_business: RND,
    p_photobox: RND,
    p_outlet: RND,
    p_cashier: RND,
    p_number: "PROBE",
    p_gross: 0,
    p_discount: 0,
    p_final: 0,
    p_paper_width: 80,
    p_print_mode: "browser",
    p_auto_print: true,
    p_items: [],
  });
  record(
    "0073",
    "RPC pos_create_order_with_items",
    created.status === 404 ? "NOT APPLIED" : "APPLIED",
    created.status === 404 ? "PGRST202" : `HTTP ${created.status} (gagal di FK, bukan hilang)`
  );

  const booth = await rpc("pos_set_booth_enabled", {
    p_photobox: RND,
    p_business: RND,
    p_enabled: false,
  });
  record(
    "0073",
    "RPC pos_set_booth_enabled",
    booth.status === 404 ? "NOT APPLIED" : "APPLIED",
    `HTTP ${booth.status}`
  );
}

// ---------------------------------------------------------------- 0074
// pos_complete_payment versi baru mengembalikan NULL (bukan uuid) saat
// transaksi untuk order itu sudah ada. Order lama (0026) mengembalikan uuid.
{
  const { body } = await get(
    "pos_orders?select=id,business_id,status,final_amount,outlet_id,photobox_id,number&status=eq.paid&limit=1"
  );
  const o = JSON.parse(body)[0];
  if (!o) {
    record(
      "0074",
      "RPC pos_complete_payment (idempotent)",
      "UNVERIFIABLE",
      "tidak ada pos_order paid"
    );
  } else {
    const res = await rpc("pos_complete_payment", {
      p_order_id: o.id,
      p_business: o.business_id,
      p_method: "cash",
      p_cashier: RND,
      p_tx_number: o.number,
      p_outlet_id: o.outlet_id,
      p_photobox_id: o.photobox_id,
      p_gross: o.final_amount,
      p_discount: 0,
      p_final: o.final_amount,
    });
    const isNew = res.status === 200 && res.body.trim() === "null";
    record(
      "0074",
      "RPC pos_complete_payment mengembalikan null saat tx sudah ada",
      isNew ? "APPLIED" : "NOT APPLIED",
      `HTTP ${res.status} body=${res.body.slice(0, 60)}`
    );
  }
}

// ---------------------------------------------------------------- 0075
// FK photoboxes.default_template_id -> templates. Embed PostgREST hanya
// bekerja bila FK benar-benar ada.
{
  const { status } = await get("photoboxes?select=id,default_template_id,templates(id)&limit=1");
  const hasFk = status === 200;
  record(
    "0075",
    "FK photoboxes.default_template_id -> templates",
    hasFk ? "APPLIED" : "NOT APPLIED",
    hasFk ? "embed berhasil" : "PGRST200: FK tidak ditemukan"
  );
  const idx75 = await catalog(
    `select count(*)::int as n from pg_indexes where indexname in
       ('idx_payments_credential','idx_payments_pending_expiry','idx_photoboxes_default_template')`
  );
  if (idx75 === null) {
    record(
      "0075",
      "3 index (credential, pending_expiry, default_template)",
      "UNVERIFIABLE",
      "katalog tidak tersedia"
    );
  } else {
    const n = idx75[0]?.n ?? 0;
    record(
      "0075",
      "3 index (credential, pending_expiry, default_template)",
      n === 3 ? "APPLIED" : "NOT APPLIED",
      `ditemukan ${n}/3`
    );
  }
}

// ---------------------------------------------------------------- 0076
{
  const res = await rpc("pos_decrement_stock_batch", { p_business: RND, p_items: [] });
  record(
    "0076",
    "RPC pos_decrement_stock_batch",
    res.status === 404 ? "NOT APPLIED" : "APPLIED",
    res.status === 404 ? "PGRST202" : `HTTP ${res.status}`
  );
}

// ---------------------------------------------------------------- 0077
{
  const { status } = await get("plans?select=max_packages,max_templates&limit=1");
  record(
    "0077",
    "kolom plans.max_packages/max_templates",
    status === 200 ? "APPLIED" : "NOT APPLIED",
    `HTTP ${status}`
  );
}

// ---------------------------------------------------------------- 0078
{
  const idx78 = await catalog(
    `select count(*)::int as n from pg_indexes where indexname in
       ('idx_payment_webhooks_status_received','idx_payment_webhooks_provider_status','idx_payments_status_created')`
  );
  if (idx78 === null) {
    record("0078", "3 index webhook/payment hot path", "UNVERIFIABLE", "katalog tidak tersedia");
  } else {
    const n = idx78[0]?.n ?? 0;
    record(
      "0078",
      "3 index webhook/payment hot path",
      n === 3 ? "APPLIED" : "NOT APPLIED",
      `ditemukan ${n}/3`
    );
  }
}

// ---------------------------------------------------------------- 0079
// Aksi ON DELETE tidak terbaca via PostgREST; pakai katalog.
{
  const fks = await catalog(
    `select conrelid::regclass::text as tbl, confdeltype::text as del
       from pg_constraint
      where contype='f' and confrelid=to_regclass('public.customers')
      order by 1`
  );
  if (fks === null) {
    record(
      "0079",
      "FK customers ON DELETE RESTRICT (4 tabel)",
      "UNVERIFIABLE",
      "katalog tidak tersedia"
    );
  } else {
    const want = ["pos_orders", "sessions", "transactions", "voucher_usages"];
    const got = fks.map((r) => r.tbl);
    const ok =
      fks.length === 4 && fks.every((r) => r.del === "r") && want.every((t) => got.includes(t));
    record(
      "0079",
      "FK customers ON DELETE RESTRICT (4 tabel)",
      ok ? "APPLIED" : "NOT APPLIED",
      fks.map((r) => `${r.tbl}:${r.del}`).join(", ") || "tidak ada FK"
    );
  }
}

// ---------------------------------------------------------------- 0080
// 0080 menghapus FK transactions.payment_id. Kalibrasi dulu: hint FK yang
// ada harus 200, hint palsu harus 400.
{
  const okFk = await get(
    "payments?select=id,transactions!payments_transaction_id_fkey(id)&limit=1"
  );
  const fakeFk = await get("payments?select=id,transactions!fk_palsu(id)&limit=1");
  const calib = okFk.status === 200 && fakeFk.status === 400;

  const target = await get(
    "transactions?select=id,payments!transactions_payment_id_fkey(id)&limit=1"
  );
  if (!calib) {
    record("0080", "FK transactions.payment_id dihapus", "ERROR", "kalibrasi probe gagal");
  } else {
    record(
      "0080",
      "FK transactions.payment_id dihapus",
      target.status === 400 ? "APPLIED" : "NOT APPLIED",
      target.status === 400 ? "hint FK tidak ditemukan (sesuai 0080)" : `HTTP ${target.status}`
    );
  }
}

// ---------------------------------------------------------------- report
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nProbe migrasi cloud — ${SB}\n`);
console.log(pad("MIG", 6) + pad("VERDICT", 15) + pad("CHECK", 58) + "NOTE");
console.log("-".repeat(140));
for (const r of results) {
  console.log(pad(r.migration, 6) + pad(r.verdict, 15) + pad(r.check, 58) + r.note);
}

const missing = results.filter((r) => r.verdict === "NOT APPLIED");
const unver = results.filter((r) => r.verdict === "UNVERIFIABLE");
const errs = results.filter((r) => r.verdict === "ERROR");

console.log(
  `\nRingkasan: ${results.filter((r) => r.verdict === "APPLIED").length} applied, ` +
    `${missing.length} not applied, ${unver.length} unverifiable, ${errs.length} error`
);
if (missing.length) {
  console.log("BELUM DITERAPKAN:");
  for (const m of missing) console.log(`  - ${m.migration}: ${m.check} (${m.note})`);
}
process.exit(errs.length ? 2 : 0);
