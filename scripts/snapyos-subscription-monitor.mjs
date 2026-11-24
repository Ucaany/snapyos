#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { notifySnapyTopic } from "./snapyos-telegram-notify.mjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diset");
const telegramReady = Boolean(process.env.SNAPYOS_TELEGRAM_BOT_TOKEN && process.env.SNAPYOS_TELEGRAM_CHAT_ID && process.env.SNAPYOS_TELEGRAM_TOPIC_ID);
if (!telegramReady) throw new Error("SNAPYOS_TELEGRAM_BOT_TOKEN, CHAT_ID, dan TOPIC_ID wajib diset; notifier berhenti tanpa mengirim ke topic lain");
const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const statePath = process.env.SNAPYOS_TELEGRAM_STATE_FILE ?? "/var/lib/snapyos-monitor/subscription-events.json";
let state = {};
try { state = JSON.parse(await readFile(statePath, "utf8")); } catch { /* first run */ }
const since = new Date(Date.now() - 5 * 60_000).toISOString();
const nowIso = new Date().toISOString();
const expiryWindowEnd = new Date(Date.now() + 3 * 86_400_000).toISOString();
const intervalMinutes = Math.max(1, Number(process.env.SNAPYOS_MONITOR_INTERVAL_MINUTES ?? 1));
const cutoff = Date.now() - intervalMinutes * 60_000;
const [users, businesses, invoices, subscriptions] = await Promise.all([
  client.from("users").select("id,email,name,created_at").gt("created_at", since).order("created_at"),
  client.from("businesses").select("id,name,owner_id,created_at,users(name,email)").gt("created_at", since).order("created_at"),
  client.from("invoices").select("id,business_id,amount,paid_at,status,businesses(name),subscriptions(plans(name))").eq("status", "paid").gt("paid_at", since).order("paid_at"),
  client.from("subscriptions").select("id,business_id,status,current_period_end,updated_at,businesses(name),plans(name)").or(`updated_at.gt.${since},and(status.in.(active,trial),current_period_end.gte.${nowIso},current_period_end.lt.${expiryWindowEnd})`).order("updated_at"),
]);
for (const result of [users, businesses, invoices, subscriptions]) if (result.error) throw new Error(`Supabase query gagal (${result.error.code ?? "unknown"})`);

let sent = 0;
let failed = 0;
const notify = async (key, event) => {
  if (state[key]) return;
  const result = await notifySnapyTopic(event);
  if (result.sent) { sent++; state[key] = true; }
  else failed++;
};
for (const row of users.data ?? []) {
  if (new Date(row.created_at).getTime() >= cutoff) await notify(`user:${row.id}`, { type: "user.created", ownerName: row.name ?? row.email, occurredAt: row.created_at });
}
for (const row of businesses.data ?? []) {
  if (new Date(row.created_at).getTime() >= cutoff) {
    const owner = Array.isArray(row.users) ? row.users[0] : row.users;
    await notify(`business:${row.id}`, { type: "business.created", businessName: row.name, ownerName: owner?.name ?? owner?.email, occurredAt: row.created_at });
  }
}
for (const row of invoices.data ?? []) {
  if (new Date(row.paid_at).getTime() >= cutoff) {
    const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
    const subscription = Array.isArray(row.subscriptions) ? row.subscriptions[0] : row.subscriptions;
    const plan = subscription && (Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans);
    await notify(`invoice-paid:${row.id}`, { type: "subscription.paid", businessName: business?.name, planName: plan?.name, amount: row.amount, status: "paid", occurredAt: row.paid_at });
  }
}
for (const row of subscriptions.data ?? []) {
  const updatedAt = new Date(row.updated_at).getTime();
  const statusChanged = updatedAt >= cutoff;
  if (!statusChanged && !["active", "trial"].includes(row.status)) continue;
  const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
  const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
  const eventKey = `subscription:${row.id}:${row.updated_at}:${row.status}`;
  if (statusChanged && ["expired", "cancelled"].includes(row.status)) {
    await notify(eventKey, { type: `subscription.${row.status}`, businessName: business?.name, planName: plan?.name, status: row.status, occurredAt: row.updated_at });
  } else if (statusChanged && row.status === "past_due") {
    await notify(eventKey, { type: "subscription.status", businessName: business?.name, planName: plan?.name, status: row.status, occurredAt: row.updated_at });
  }
  if (["active", "trial"].includes(row.status) && row.current_period_end) {
    const end = new Date(row.current_period_end);
    const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
    if (daysLeft >= 0 && daysLeft <= 3) {
      const bucket = Math.ceil(daysLeft);
      await notify(`ending:${row.id}:${end.toISOString().slice(0, 10)}:${bucket}`, { type: "subscription.ending_soon", businessName: business?.name, planName: plan?.name, status: row.status, daysLeft: bucket, occurredAt: row.updated_at });
    }
  }
}
await mkdir(dirname(statePath), { recursive: true });
const keys = Object.keys(state);
for (const key of keys.slice(0, Math.max(0, keys.length - 10_000))) delete state[key];
await writeFile(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ checkedSince: since, sent, failed }));
if (failed) process.exitCode = 1;
