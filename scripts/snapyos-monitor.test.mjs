import test from "node:test";
import assert from "node:assert/strict";
import { formatReport, formatAlert, formatBytes, shouldSendReport, DEFAULT_WEBSITE_URL, DEFAULT_API_HEALTH_URL } from "./snapyos-monitor.mjs";

test("uses snapyos.site as website and API monitoring domain", () => {
  assert.equal(DEFAULT_WEBSITE_URL, "https://snapyos.site");
  assert.equal(DEFAULT_API_HEALTH_URL, "https://snapyos.site/api/health");
});

test("formats monitoring report with isolated endpoint warnings and VPS resources", () => {
  const report = {
    timestamp: "2026-11-20T08:12:00.000Z", timezone: "Asia/Shanghai", host: "VM-0-4-ubuntu",
    website: { ok: true, status: 200, latencyMs: 920 },
    apiHealth: { ok: false, status: 503, latencyMs: 1370, label: "endpoint ini saja; bukan gambaran seluruh API" },
    uptimeSeconds: 5340, load: [1.2, 0.78, 0.42],
    memory: { total: 3865470566, available: 1181116006 }, swap: { total: 2147483648, free: 1939865600 },
    disk: { used: 11, total: 59, percent: 19 },
    services: [{ name: "nginx", ok: true, port: 80 }, { name: "OpenClaw", ok: true, port: 18789 }],
    deploymentNote: "Website belum terbukti di-host di VPS ini.",
  };
  const text = formatReport(report);
  assert.match(text, /🌐 Website: ✅ HTTP 200 • respons 0,92 dtk/);
  assert.match(text, /🔌 API health: ⚠️ HTTP 503 • respons 1,37 dtk/);
  assert.match(text, /endpoint ini saja; bukan gambaran seluruh API/);
  assert.match(text, /RAM 2,5\/3,6 GiB/);
  assert.match(text, /Website belum terbukti di-host di VPS ini\./);
});

test("formats alert with emoji and endpoint label", () => {
  const text = formatAlert({ title: "API health", url: "https://snapyos.site/api/health", result: { ok: false, status: 503, latencyMs: 1370 } });
  assert.match(text, /🔴/); assert.match(text, /HTTP 503/); assert.match(text, /https:\/\/snapyos\.site\/api\/health/);
});

test("formats bytes in human-readable GiB", () => assert.equal(formatBytes(3865470566), "3,6 GiB"));

test("sends routine reports every six hours, including first run", () => {
  assert.equal(shouldSendReport(null, 1_000_000), true);
  assert.equal(shouldSendReport(0, 21_600_000), true);
  assert.equal(shouldSendReport(1, 21_599_999), false);
});
