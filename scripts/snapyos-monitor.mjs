#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_WEBSITE_URL = "https://snapyos.site";
export const DEFAULT_API_HEALTH_URL = "https://snapyos.site/api/health";
const HOUR_MS = 60 * 60 * 1000;
const REPORT_INTERVAL_MS = 6 * HOUR_MS;
const number = (value, digits = 2) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
export function formatBytes(bytes) {
  return `${number(bytes / (1024 ** 3), 1)} GiB`;
}
export function shouldSendReport(lastSentAt, now = Date.now()) {
  return lastSentAt == null || now - lastSentAt >= REPORT_INTERVAL_MS;
}
function probeLabel(result) {
  const icon = result.ok ? "✅" : "⚠️";
  return `${icon} HTTP ${result.status ?? "gagal"} • respons ${number(result.latencyMs / 1000)} dtk`;
}
function duration(seconds) {
  const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}j ${m}m` : `${m}m`;
}
export function formatReport(r) {
  const now = new Date(r.timestamp);
  const stamp = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: r.timezone, timeZoneName: "short" }).format(now);
  const ramUsed = r.memory.total - r.memory.available;
  const swapUsed = r.swap.total - r.swap.free;
  const services = r.services.map((s) => `${s.ok ? "✅" : "🔴"} ${s.name}${s.port ? ` port ${s.port}` : ""}`).join(" dan ");
  return [
    `📊 SnapyOS — ${stamp} (${r.timezone})`,
    `🌐 Website: ${probeLabel(r.website)}`,
    `🔌 API health: ${probeLabel(r.apiHealth)} • ${r.apiHealth.label}`,
    `🖥️ VPS ${r.host}: uptime ${duration(r.uptimeSeconds)} • load ${r.load.map((n) => number(n)).join(" / ")} • RAM ${number(ramUsed / (1024 ** 3))}/${formatBytes(r.memory.total)} (tersedia ${formatBytes(r.memory.available)}) • swap ${number(swapUsed / 1048576, 0)} MiB/${r.swap.total >= 1024 ** 3 ? `${number(r.swap.total / (1024 ** 3))} GiB` : `${number(r.swap.total / 1048576, 0)} MiB`} • disk / ${r.disk.percent}% terpakai (${r.disk.used}/${r.disk.total} GiB).`,
    `Layanan terpantau: ${services}.`,
    r.deploymentNote ? `⚠️ Catatan: ${r.deploymentNote}` : "",
  ].filter(Boolean).join("\n");
}
export function formatAlert({ title, url, result }) {
  return `${result.ok ? "✅" : "🔴"} SnapyOS monitor — ${title}: ${probeLabel(result)}\n🔗 ${url}`;
}

async function timedFetch(url, timeoutMs = 10000) {
  const start = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow", cache: "no-store" });
    return { ok: response.ok, status: response.status, latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    return { ok: false, status: null, latencyMs: Math.round(performance.now() - start), error: error.message };
  }
}
function readNumber(file) { try { return Number(readFileSync(file, "utf8").trim()); } catch { return 0; } }
import { readFileSync } from "node:fs";
function procMem() {
  const values = Object.fromEntries(readFileSync("/proc/meminfo", "utf8").split("\n").map((line) => {
    const m = line.match(/^([^:]+):\s+(\d+) kB/); return m ? [m[1], Number(m[2]) * 1024] : null;
  }).filter(Boolean));
  return { total: values.MemTotal ?? os.totalmem(), available: values.MemAvailable ?? os.freemem() };
}
function swapMem() {
  const values = Object.fromEntries(readFileSync("/proc/meminfo", "utf8").split("\n").map((line) => {
    const m = line.match(/^(SwapTotal|SwapFree):\s+(\d+) kB/); return m ? [m[1], Number(m[2]) * 1024] : null;
  }).filter(Boolean));
  return { total: values.SwapTotal ?? 0, free: values.SwapFree ?? 0 };
}
function diskInfo() {
  try {
    const line = execFileSync("df", ["-BG", "--output=size,used,pcent", "/"], { encoding: "utf8" }).trim().split("\n").at(-1).trim().split(/\s+/);
    return { total: Number(line[0].replace("G", "")), used: Number(line[1].replace("G", "")), percent: Number(line[2].replace("%", "")) };
  } catch { return { total: 0, used: 0, percent: 0 }; }
}
function service(name, port) {
  let ok = false;
  try { execFileSync("systemctl", ["is-active", "--quiet", name], { stdio: "ignore" }); ok = true; } catch { /* inactive */ }
  if (!ok && port) {
    try { execFileSync("bash", ["-lc", `ss -ltnH | awk '{print $4}' | grep -Eq '(^|:)${port}$'`], { stdio: "ignore" }); ok = true; } catch { /* port closed */ }
  }
  return { name, port, ok };
}
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID harus diset");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Telegram API HTTP ${response.status}`);
}
function readState(file) { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return {}; } }

export async function runOnce({ now = Date.now(), send = sendTelegram, statePath = process.env.MONITOR_STATE_FILE ?? "/var/lib/snapyos-monitor/state.json" } = {}) {
  const websiteUrl = process.env.MONITOR_WEBSITE_URL?.trim() || DEFAULT_WEBSITE_URL;
  const apiUrl = process.env.MONITOR_API_HEALTH_URL?.trim() || DEFAULT_API_HEALTH_URL;
  const timezone = process.env.MONITOR_TIMEZONE || "Asia/Shanghai";
  const [website, apiHealth] = await Promise.all([timedFetch(websiteUrl), timedFetch(apiUrl)]);
  const checks = { website, apiHealth };
  const state = readState(statePath);
  for (const [key, result] of Object.entries(checks)) {
    const previous = state.checks?.[key];
    if (previous !== result.ok) {
      if (!result.ok || previous === false) {
        await send(formatAlert({ title: key === "website" ? "Website" : `API health (${process.env.MONITOR_API_LABEL || "endpoint ini saja; bukan gambaran seluruh API"})`, url: key === "website" ? websiteUrl : apiUrl, result }));
      }
    }
  }
  const nowIso = new Date(now).toISOString();
  const report = {
    timestamp: nowIso, timezone, host: os.hostname(), website, apiHealth: { ...apiHealth, label: process.env.MONITOR_API_LABEL || "endpoint ini saja; bukan gambaran seluruh API" },
    uptimeSeconds: Math.floor(os.uptime()), load: os.loadavg(), memory: procMem(), swap: swapMem(), disk: diskInfo(),
    services: (process.env.MONITOR_SERVICES || "nginx:80,OpenClaw:18789").split(",").filter(Boolean).map((item) => { const [name, port] = item.split(":"); return service(name, Number(port) || undefined); }),
    deploymentNote: process.env.MONITOR_DEPLOYMENT_NOTE || "Website dan VPS dipantau terpisah; metrik ini hanya untuk host tempat monitor berjalan.",
  };
  const sendReport = shouldSendReport(state.lastReportAt, now);
  if (sendReport) await send(formatReport(report));
  const nextState = { checks: Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, value.ok])), lastReportAt: sendReport ? now : state.lastReportAt ?? null };
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`, { mode: 0o600 });
  return { report, sentRoutineReport: sendReport };
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  try {
    const result = await runOnce();
    console.log(JSON.stringify({ ok: true, sentRoutineReport: result.sentRoutineReport, timestamp: result.report.timestamp }));
  } catch (error) {
    console.error(`[snapyos-monitor] ${error.message}`);
    process.exitCode = 1;
  }
}
