import assert from "node:assert/strict";
import test from "node:test";
import { rateLimit, rateLimitByDevice, resetLimit } from "./rate-limit.ts";

void test("rateLimit enforces sliding window without boundary burst", async () => {
  const key = `test:sliding:${Date.now()}:${Math.random()}`;
  assert.equal((await rateLimit(key, 2, 60_000)).ok, true);
  assert.equal((await rateLimit(key, 2, 60_000)).ok, true);
  const blocked = await rateLimit(key, 2, 60_000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 1);
  await resetLimit(key);
});

void test("device limit keys use full token identity", async () => {
  const prefix = "device-prefix-1234";
  const first = `${prefix}-a`;
  const second = `${prefix}-b`;
  const firstResult = await rateLimitByDevice("test-device", first, 1, 60_000);
  const secondResult = await rateLimitByDevice("test-device", second, 1, 60_000);
  assert.equal(firstResult?.ok, true);
  assert.equal(secondResult?.ok, true);
  await resetLimit("test-device:device:unused");
});
