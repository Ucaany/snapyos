import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = readFileSync(".env.local","utf8").split("\n").reduce((a,l)=>{const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)a[m[1]]=m[2].replace(/^"|"$/g,"");return a;},{});
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false}});
const businessId = "11111111-1111-4111-8111-111111111111";
const outletId = "22222222-2222-4222-8222-222222222222";
const payload = { business_id: businessId, category:"paper", amount:150000, note:"Kertas 4R 5 pack (E2E)", expense_date:"2026-10-05", outlet_id: outletId };
console.log("INSERT payload:", JSON.stringify(payload));
const { data, error } = await sb.from("expenses").insert(payload).select("id, category, amount, note, expense_date, outlet_id, created_at").single();
console.log("error:", error?.message ?? "none", error?.code ?? "", error?.details ?? "");
console.log("data:", JSON.stringify(data));
if (data) { await sb.from("expenses").delete().eq("id", data.id); console.log("cleaned up"); }
