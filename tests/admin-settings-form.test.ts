/**
 * Regresi A13 — form /admin/settings punya DUA form terpisah (global + gateway).
 * Submit satu form tidak boleh menimpa toggle form lain. Bug asli: server action
 * selalu mengirim SEMUA field, sehingga toggle yang tidak hadir dibaca "false".
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSettingsPayload } from "../src/lib/form-state.ts";
import { adminSettingsUpdateSchema } from "../src/lib/validators.ts";

/** Bikin FormData ala form global (tanpa field gateway). */
function globalFormData(overrides: Record<string, string | boolean> = {}) {
  const fd = new FormData();
  fd.set("platform_fee_percent", "2.5");
  fd.set("platform_fee_flat", "1000");
  fd.set("default_retention_days", "3");
  fd.set("trial_days", "14");
  fd.set("maintenance_message", "Halo");
  fd.set("maintenance_mode", "false");
  fd.set("maintenance_mode", "true");
  fd.set("chroma_key_default_enabled", "false");
  fd.set("chroma_key_default_enabled", "true");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, String(v));
  return fd;
}

/** Bikin FormData ala form gateway (tanpa field global). */
function gatewayFormData(pakasir = true, midtrans = true, tripay = false) {
  const fd = new FormData();
  fd.set("gateway_pakasir_enabled", "false");
  if (pakasir) fd.set("gateway_pakasir_enabled", "true");
  fd.set("gateway_midtrans_enabled", "false");
  if (midtrans) fd.set("gateway_midtrans_enabled", "true");
  fd.set("gateway_tripay_enabled", "false");
  if (tripay) fd.set("gateway_tripay_enabled", "true");
  return fd;
}

test("buildSettingsPayload: form global TIDAK menyertakan gateway (anti-clobber)", () => {
  const payload = buildSettingsPayload(globalFormData());
  assert.equal("gateway_pakasir_enabled" in payload, false);
  assert.equal("gateway_midtrans_enabled" in payload, false);
  assert.equal("gateway_tripay_enabled" in payload, false);
  assert.equal(payload.trial_days, 14);
  assert.equal(payload.maintenance_mode, true);
  assert.equal(payload.chroma_key_default_enabled, true);
});

test("buildSettingsPayload: form gateway TIDAK menyertakan field global (anti-clobber)", () => {
  const payload = buildSettingsPayload(gatewayFormData(true, true, false));
  assert.equal("chroma_key_default_enabled" in payload, false);
  assert.equal("maintenance_mode" in payload, false);
  assert.equal("maintenance_message" in payload, false);
  assert.equal("trial_days" in payload, false);
  assert.equal(payload.gateway_tripay_enabled, false);
});

test("buildSettingsPayload: payload form global valid menurut schema (partial)", () => {
  const parsed = adminSettingsUpdateSchema.safeParse(buildSettingsPayload(globalFormData()));
  assert.equal(parsed.success, true);
});

test("buildSettingsPayload: payload form gateway valid menurut schema (partial)", () => {
  const parsed = adminSettingsUpdateSchema.safeParse(buildSettingsPayload(gatewayFormData()));
  assert.equal(parsed.success, true);
});

test("buildSettingsPayload: field kosong jadi undefined (tidak menimpa) tapi key tetap ada", () => {
  const fd = new FormData();
  fd.set("platform_fee_percent", "");
  fd.set("trial_days", "14");
  const payload = buildSettingsPayload(fd);
  assert.equal(payload.platform_fee_percent, undefined);
  assert.equal("gateway_pakasir_enabled" in payload, false);
  // undefined di-skip updatePlatformSettings, jadi hanya trial_days yang disimpan.
  const defined = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
  assert.deepEqual(defined, { trial_days: 14 });
});

test("buildSettingsPayload: maintenance_message kosong jadi undefined (bukan string kosong)", () => {
  const fd = new FormData();
  fd.set("maintenance_message", "   ");
  const payload = buildSettingsPayload(fd);
  assert.equal(payload.maintenance_message, undefined);
});
