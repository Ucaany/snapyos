import { test } from "node:test";
import assert from "node:assert/strict";

import {
  invalidTemplateIds,
  isFreeTemplate,
  isTemplateAssignable,
  type AssignableTemplateRow,
} from "../src/lib/template-assignment.ts";
import { PUBLIC_CONFIG_GLOBAL_TAG, publicConfigCacheTags } from "../src/lib/template-cache.ts";

const BIZ = "biz-1";

function row(overrides: Partial<AssignableTemplateRow> = {}): AssignableTemplateRow {
  return {
    id: "tpl-1",
    business_id: null,
    is_active: true,
    is_premium: false,
    price: null,
    ...overrides,
  };
}

const none = new Set<string>();

test("isFreeTemplate: bukan premium / price null / price 0 = gratis", () => {
  assert.equal(isFreeTemplate({ is_premium: false, price: 5000 }), true);
  assert.equal(isFreeTemplate({ is_premium: true, price: null }), true);
  assert.equal(isFreeTemplate({ is_premium: true, price: 0 }), true);
  assert.equal(isFreeTemplate({ is_premium: true, price: 5000 }), false);
});

test("global gratis & aktif bisa di-assign", () => {
  assert.equal(isTemplateAssignable(row(), BIZ, none), true);
  assert.equal(isTemplateAssignable(row({ price: 0 }), BIZ, none), true);
});

test("global premium yang belum dibeli tidak bisa di-assign", () => {
  assert.equal(isTemplateAssignable(row({ is_premium: true, price: 5000 }), BIZ, none), false);
});

test("global premium yang sudah dibeli bisa di-assign", () => {
  const premium = row({ id: "tpl-premium", is_premium: true, price: 5000 });
  assert.equal(isTemplateAssignable(premium, BIZ, new Set(["tpl-premium"])), true);
});

test("global nonaktif tidak bisa di-assign walau sudah dibeli", () => {
  const inactive = row({ id: "tpl-off", is_active: false, is_premium: true, price: 5000 });
  assert.equal(isTemplateAssignable(inactive, BIZ, new Set(["tpl-off"])), false);
});

test("template milik business sendiri selalu bisa di-assign", () => {
  assert.equal(
    isTemplateAssignable(
      row({ business_id: BIZ, is_active: false, is_premium: true, price: 9000 }),
      BIZ,
      none
    ),
    true
  );
});

test("template milik business lain tidak bisa di-assign", () => {
  assert.equal(
    isTemplateAssignable(row({ business_id: "biz-2", is_premium: false }), BIZ, none),
    false
  );
});

test("invalidTemplateIds: hanya id buruk yang dikembalikan", () => {
  const rows: AssignableTemplateRow[] = [
    row({ id: "free", business_id: null, is_premium: false }),
    row({ id: "premium", business_id: null, is_premium: true, price: 5000 }),
    row({ id: "owned", business_id: BIZ }),
    row({ id: "off", business_id: null, is_active: false }),
  ];
  const purchased = new Set(["premium"]);
  const invalid = invalidTemplateIds(rows, BIZ, purchased, [
    "free",
    "premium",
    "owned",
    "off",
    "missing",
  ]);
  assert.deepEqual(invalid, ["off", "missing"]);
});

test("publicConfigCacheTags: kontrak invalidasi cache", () => {
  const tags = publicConfigCacheTags("biz");
  assert.ok(tags.includes("business:biz:public-config"));
  assert.ok(tags.includes("public-config:global"));
});

test("PUBLIC_CONFIG_GLOBAL_TAG dipakai literal (tanpa drift)", () => {
  assert.equal(PUBLIC_CONFIG_GLOBAL_TAG, "public-config:global");
  assert.ok(publicConfigCacheTags("apa-saja").includes(PUBLIC_CONFIG_GLOBAL_TAG));
});
