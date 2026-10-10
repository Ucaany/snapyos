// Bootstrap admin platform via service_role.
// Usage: node scripts/bootstrap-admin.mjs "<email-user-yang-jadi-admin>"
// Membaca SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dari .env.local.
import { readFile } from "node:fs/promises";

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/bootstrap-admin.mjs <email>");
  process.exit(1);
}

const env = {};
for (const line of (await readFile(".env.local", "utf8")).split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SB = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY wajib di .env.local");
  process.exit(1);
}

const h = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};
const r = await fetch(`${SB}/rest/v1/rpc/bootstrap_admin`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ p_email: email }),
});
const body = await r.text();
if (!r.ok) {
  console.error(`${r.status} ${body.slice(0, 400)}`);
  process.exit(1);
}
console.log(`admin OK: ${email}`);
