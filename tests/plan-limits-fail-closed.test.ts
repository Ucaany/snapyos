/**
 * Limit plan fail-closed (audit lintas-potong).
 * Static check: mutasi resource memakai requirePlanLimits (bukan default
 * Starter diam-diam) dan memanggil RPC kuota atomik.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

async function read(rel: string): Promise<string> {
  return readFile(new URL(rel, root), "utf8");
}

test("requirePlanLimits menolak subscription tidak efektif", async () => {
  const src = await read("src/server/plan-limits.ts");
  assert.match(src, /export async function requirePlanLimits/);
  assert.match(src, /SUBSCRIPTION_EXPIRED/);
  assert.match(src, /isSubscriptionEffective/);
  // Tidak boleh mengembalikan DEFAULT_PLAN_LIMITS saat expired/error.
  const body = src.slice(src.indexOf("export async function requirePlanLimits"));
  const scoped = body.slice(0, body.indexOf("export async function getPlanLimits"));
  assert.doesNotMatch(scoped, /return DEFAULT_PLAN_LIMITS/);
});

test("create service memakai kuota atomik + limit fail-closed", async () => {
  const cases: [string, string][] = [
    ["src/server/outlets.ts", "create_outlet_with_quota"],
    ["src/server/photoboxes.ts", "create_photobox_with_quota"],
    ["src/server/staff.ts", "add_business_member_with_quota"],
  ];
  for (const [file, rpc] of cases) {
    const src = await read(file);
    assert.match(src, /requirePlanLimits\(/, `${file} harus memakai requirePlanLimits`);
    assert.match(src, new RegExp(`rpc\\("${rpc}"`), `${file} harus memanggil ${rpc}`);
    assert.match(src, /isPlanLimitError/, `${file} harus memetakan PLAN_LIMIT_REACHED`);
  }
});
