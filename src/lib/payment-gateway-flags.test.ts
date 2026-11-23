import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GATEWAY_ENABLED_KEY,
  gatewayEnabledFromSettings,
} from "./payment-gateway-flags.ts";

void test("key toggle per provider", () => {
  assert.equal(GATEWAY_ENABLED_KEY.midtrans, "gateway_midtrans_enabled");
  assert.equal(GATEWAY_ENABLED_KEY.tripay, "gateway_tripay_enabled");
});

void test("missing key → enabled (backward compatible)", () => {
  assert.equal(gatewayEnabledFromSettings([], "tripay"), true);
  assert.equal(gatewayEnabledFromSettings([], "midtrans"), true);
});

void test("provider nonaktif → false; aktif → true", () => {
  const settings = [
    { key: "gateway_tripay_enabled", value: false },
    { key: "gateway_midtrans_enabled", value: true },
  ];
  assert.equal(gatewayEnabledFromSettings(settings, "tripay"), false);
  assert.equal(gatewayEnabledFromSettings(settings, "midtrans"), true);
});

void test("provider tak dikenal → enabled", () => {
  assert.equal(gatewayEnabledFromSettings([], "unknown"), true);
});
