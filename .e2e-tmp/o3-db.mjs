import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^"|"$/g, "");
  return a;
}, {});
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// find owner business
const { data: bizs } = await sb.from("businesses").select("id,name,timezone").ilike("name", "%KLIK FOTO%");
console.log("BIZ:", JSON.stringify(bizs));
const biz = bizs[0];
const fromIso = new Date("2026-01-01T00:00:00+07:00").toISOString();
const toIso = new Date("2027-01-01T00:00:00+07:00").toISOString();

const calls = [
  ["dashboard_tx_summary", { p_business: biz.id, p_start: fromIso, p_end: toIso }],
  ["metrics_tx_status", { p_business: biz.id, p_start: fromIso, p_end: toIso }],
  ["metrics_returning_customers", { p_business: biz.id, p_start: fromIso, p_end: toIso }],
  ["metrics_revenue_per_booth", { p_business: biz.id, p_start: fromIso, p_end: toIso }],
  ["metrics_sessions_per_booth", { p_business: biz.id, p_start: fromIso, p_end: toIso }],
  ["metrics_session_summary", { p_business: biz.id, p_start: fromIso, p_end: toIso }],
  ["metrics_popular_package", { p_business: biz.id, p_start: fromIso, p_end: toIso }],
  ["metrics_popular_template", { p_business: biz.id, p_start: fromIso, p_end: toIso }],
];
for (const [name, args] of calls) {
  const { data, error } = await sb.rpc(name, args);
  console.log(`\n${name}: error=${error?.message ?? "none"}`);
  console.log("  ", JSON.stringify(data));
}

const { count: custTotal } = await sb.from("customers").select("id", { count: "exact", head: true }).eq("business_id", biz.id);
const { count: custNew } = await sb.from("customers").select("id", { count: "exact", head: true }).eq("business_id", biz.id).gte("created_at", fromIso).lt("created_at", toIso);
console.log("\ncustomers total:", custTotal, "new(in range):", custNew);

const { data: booths } = await sb.from("photoboxes").select("id,name,created_at").eq("business_id", biz.id).order("created_at");
console.log("photoboxes:", JSON.stringify(booths));
