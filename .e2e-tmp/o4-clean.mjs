import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = readFileSync(".env.local","utf8").split("\n").reduce((a,l)=>{const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)a[m[1]]=m[2].replace(/^"|"$/g,"");return a;},{});
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false}});
const businessId = "11111111-1111-4111-8111-111111111111";
const { data } = await sb.from("expenses").delete().eq("business_id", businessId).select("id");
console.log("deleted", data?.length, "rows");
