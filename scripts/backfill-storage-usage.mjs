// Backfill akuntansi storage (migrasi 0062) — SEKALI setelah migrasi.
// Usage: node scripts/backfill-storage-usage.mjs [--business <uuid>] [--reset --yes]
//
// Hot-path upload TIDAK memakai recursive listing; script ini boleh memakai
// listing bucket karena dijalankan sekali (bukan per-upload). Menulis ledger
// storage_objects + counter storage_usage lewat RPC storage_account_add
// (idempotent per object_key), jadi aman dijalankan ulang.
//
// --reset  : kosongkan ledger + counter dulu (recompute penuh). Pakai bila
//            curiga drift; tanpa ini, re-run hanya menambah objek yang belum
//            tercatat (idempotent) dan counter konsisten.
// --yes    : WAJIB menyertai --reset. Setujui bahwa reset berisiko drift.
//
// PERINGATAN --reset (drift risk):
//   --reset menghapus storage_objects + storage_usage lewat DELETE REST yang
//   independen, lalu membangun ulang counter objek-per-objek. PostgREST TIDAK
//   menyediakan transaksi lintas-statement, jadi atomicitas di sini hanya
//   didekati: bila proses terputus di tengah, re-run DENGAN re-run yang sama.
//   Jika run `--reset --yes` terputus (abort/Ctrl-C), JANGAN re-run tanpa
//   `--reset`: counter akan parsial dan re-run tanpa reset tidak bisa
//   memperbaikinya. Selalu selesaikan dengan `--reset --yes` sampai baris
//   "RESET COMPLETE" tercetak. Pause semua write (upload/finalize) selama run
//   agar ledger tidak balapan dengan rebuild.
//
// Membaca SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dari .env.local.
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const yes = args.includes("--yes");
const bizIdx = args.indexOf("--business");
const onlyBusiness = bizIdx >= 0 ? args[bizIdx + 1] : null;

// Guard --reset: butuh --yes eksplisit (drift risk bila tak sengaja).
if (reset && !yes) {
  console.error(
    "PERINGATAN: --reset mengosongkan storage_objects + storage_usage lalu rebuild.\n" +
      "PostgREST tidak punya transaksi lintas-statement: bila run terputus, counter\n" +
      "bisa parsial dan re-run TANPA --reset tidak dapat memperbaikinya.\n" +
      "Pause semua write (upload/finalize) selama run, lalu jalankan ulang\n" +
      "`--reset --yes` sampai selesai. Tambahkan --yes bila Anda setuju:\n" +
      "  node scripts/backfill-storage-usage.mjs --reset --yes"
  );
  process.exit(1);
}

const env = {};
try {
  for (const line of (await readFile(".env.local", "utf8")).split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  console.error("Tidak bisa baca .env.local");
  process.exit(1);
}
const SB = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY wajib di .env.local");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const BUCKETS = ["business-assets", "generated-photos"];

async function rpc(fn, body) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${fn} ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers, ...init });
  if (!r.ok) throw new Error(`${path} ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function storageList(bucket, prefix, offset) {
  const r = await fetch(`${SB}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
  });
  if (!r.ok)
    throw new Error(`list ${bucket}/${prefix} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Rekursif: kumpulkan semua objek (id non-null) dengan ukuran.
async function walk(bucket, prefix, out) {
  let offset = 0;
  for (;;) {
    const items = await storageList(bucket, prefix, offset);
    for (const it of items) {
      if (it.id) {
        out.push({ key: prefix ? `${prefix}/${it.name}` : it.name, size: it.metadata?.size ?? 0 });
      } else {
        await walk(bucket, prefix ? `${prefix}/${it.name}` : it.name, out);
      }
    }
    offset += items.length;
    if (items.length < 1000) break;
  }
}

// Business id = segmen pertama object key `${businessId}/...`, HANYA bila UUID
// valid. Objek platform-level (mis. `global/templates/...`) dan prefix lain
// bukan business → dilewati (bukan dikirim ke RPC ber-param uuid → crash).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function businessOf(key) {
  const slash = key.indexOf("/");
  const head = slash > 0 ? key.slice(0, slash) : null;
  return head && UUID_RE.test(head) ? head : null;
}

async function main() {
  if (reset) {
    console.log("--reset: mengosongkan storage_objects + storage_usage…");
    for (const b of BUCKETS) {
      await rest(`storage_objects?bucket=eq.${encodeURIComponent(b)}`, { method: "DELETE" });
    }
    await rest("storage_usage?business_id=neq.00000000-0000-0000-0000-000000000000", {
      method: "DELETE",
    });
  }

  // Business id valid yang masih ada — objek orphan (business terhapus) punya
  // FK ke businesses; insert ledger tanpa id valid akan gagal & membatalkan run.
  const businessRows = await rest("businesses?select=id");
  const validBusinesses = new Set(businessRows.map((b) => b.id));

  const objects = [];
  for (const bucket of BUCKETS) {
    const found = [];
    await walk(bucket, "", found);
    for (const o of found) objects.push({ ...o, bucket });
    console.log(`${bucket}: ${found.length} objek`);
  }

  let applied = 0;
  let skipped = 0;
  let orphaned = 0;
  let missingSize = 0;
  const missingSizeSamples = [];
  for (const o of objects) {
    const business = businessOf(o.key);
    if (!business) {
      skipped++;
      continue;
    }
    if (onlyBusiness && business !== onlyBusiness) continue;
    if (!validBusinesses.has(business)) {
      orphaned++;
      continue;
    }
    // Objek tanpa metadata.size dihitung 0 → under-count. Catat agar terlihat.
    if (!o.size) {
      missingSize++;
      if (missingSizeSamples.length < 10) missingSizeSamples.push(`${o.bucket}/${o.key}`);
    }
    await rpc("storage_account_add", {
      p_business: business,
      p_key: o.key,
      p_bucket: o.bucket,
      p_bytes: o.size,
    });
    applied++;
  }

  const usage = await rest("storage_usage?select=business_id,used_bytes");
  const total = usage.reduce((s, u) => s + Number(u.used_bytes ?? 0), 0);
  console.log(
    `Selesai. objek tercatat=${applied} dilewati(bukan business)=${skipped} orphan(business terhapus)=${orphaned}`
  );
  console.log(
    `objek tanpa size (dihitung 0, under-count)=${missingSize}` +
      (missingSizeSamples.length ? ` contoh: ${missingSizeSamples.join(", ")}` : "")
  );
  console.log(`business counter=${usage.length} total_bytes=${total}`);
  if (reset) {
    console.log("RESET COMPLETE");
    console.log(
      "Bila run ini terputus sebelum baris ini, jalankan ulang `--reset --yes` sampai selesai."
    );
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
