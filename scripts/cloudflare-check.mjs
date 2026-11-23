// Verifikasi konfigurasi Cloudflare untuk card "Cloudflare Edge" di /admin.
// Usage:
//   node scripts/cloudflare-check.mjs
//   CLOUDFLARE_ZONE_NAME=snapyos.site node scripts/cloudflare-check.mjs
//
// Membaca .env.local (bila ada) + process.env. Tidak pernah mencetak token.
import { readFile } from "node:fs/promises";

const env = { ...process.env };
try {
  const raw = await readFile(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^"|"$/g, "").trim();
  }
} catch {
  // .env.local opsional; env proses tetap dipakai.
}

const token = env.CLOUDFLARE_API_TOKEN;
const zoneId = env.CLOUDFLARE_ZONE_ID;
const zoneName = env.CLOUDFLARE_ZONE_NAME;

function fail(message, hints = []) {
  console.error(`FAIL: ${message}`);
  for (const hint of hints) console.error(`  - ${hint}`);
  process.exit(1);
}

if (!token) {
  fail("CLOUDFLARE_API_TOKEN belum diisi.", [
    "Buat token: Cloudflare Dashboard > My Profile > API Tokens > Create Token.",
    "Permission: Zone > Analytics > Read, Zone Resources: zone domain SnapyOS.",
    "Tambahkan ke .env.local (dev) atau /var/www/snapyos/.env.production (VPS).",
  ]);
}

const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const verify = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", { headers });
const verifyBody = await verify.json().catch(() => ({}));
if (!verify.ok || verifyBody?.result?.status !== "active") {
  fail(`token tidak valid atau tidak aktif (HTTP ${verify.status}).`, [
    "Cek token belum di-revoke dan masih punya izin Zone > Analytics > Read.",
  ]);
}
console.log("OK: token aktif.");

let resolvedZoneId = zoneId;
if (!resolvedZoneId) {
  if (!zoneName) {
    fail("CLOUDFLARE_ZONE_ID belum diisi.", [
      "Isi Zone ID dari dashboard domain, atau jalankan:",
      "  CLOUDFLARE_ZONE_NAME=domain-anda node scripts/cloudflare-check.mjs",
    ]);
  }
  const zones = await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}`,
    { headers }
  );
  const zoneBody = await zones.json().catch(() => ({}));
  resolvedZoneId = zoneBody?.result?.[0]?.id;
  if (!resolvedZoneId) {
    fail(`zone "${zoneName}" tidak ditemukan untuk token ini.`, [
      "Pastikan zone ada di akun yang sama dengan token.",
      "Atau isi CLOUDFLARE_ZONE_ID manual.",
    ]);
  }
  console.log("OK: zone ditemukan. Tambahkan ke env:");
  console.log(`  CLOUDFLARE_ZONE_ID=${resolvedZoneId}`);
}

const today = new Date().toISOString().slice(0, 10);
const query = `query ZoneOverview($zoneTag: String!, $since: Date!, $until: Date!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1dGroups(limit: 1, filter: { date_geq: $since, date_leq: $until }) {
        sum { requests cachedRequests bytes threats pageViews }
        uniq { uniques }
      }
    }
  }
}`;

const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers,
  body: JSON.stringify({ query, variables: { zoneTag: resolvedZoneId, since: today, until: today } }),
});
const payload = await res.json().catch(() => ({}));
if (!res.ok || payload?.errors?.length) {
  fail(`query analytics gagal (HTTP ${res.status}): ${payload?.errors?.[0]?.message ?? "tanpa pesan"}`, [
    "Izin token kurang: butuh Zone > Analytics > Read.",
    "Dataset httpRequests1dGroups butuh zone aktif di Cloudflare.",
  ]);
}

const group = payload?.data?.viewer?.zones?.[0]?.httpRequests1dGroups?.[0];
if (!group) {
  console.log("OK: query berhasil, tetapi belum ada data harian untuk hari ini (UTC).");
  console.log("Card akan tampil begitu ada traffic.");
  process.exit(0);
}

const sum = group.sum ?? {};
console.log("OK: data Cloudflare terbaca.");
console.log(`  requests     : ${sum.requests ?? 0}`);
console.log(`  cached       : ${sum.cachedRequests ?? 0}`);
console.log(`  threats      : ${sum.threats ?? 0}`);
console.log(`  page views   : ${sum.pageViews ?? 0}`);
console.log(`  bandwidth    : ${sum.bytes ?? 0} bytes`);
console.log(`  uniques      : ${group.uniq?.uniques ?? 0}`);
