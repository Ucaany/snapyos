import assert from "node:assert/strict";
import { test } from "node:test";
import { printCopies, printSheets, printPlan } from "./print-layout.ts";

void test("printSheets strip menggandakan seluruh strip sesuai copies", () => {
  const plan = printPlan(2, 4, "photostrip", "strip");
  const sheets = printSheets(plan, 4, 2);
  assert.equal(sheets.length, 4);
  assert.deepEqual(sheets[0], [0, 1, 2, 3]);
  assert.deepEqual(sheets[3], [0, 1, 2, 3]);
});

void test("printSheets single mengulang foto siklik tanpa dobel per lembar", () => {
  const plan = printPlan(3, 2, "single", "single");
  const sheets = printSheets(plan, 2, 1);
  assert.deepEqual(sheets, [[0], [1], [0]]);
});

void test("copies=1 tidak menggandakan lembar", () => {
  const plan = printPlan(1, 1, "single", "single");
  assert.equal(printSheets(plan, 1, 1).length, 1);
  assert.equal(printCopies({ copies: 20 }), 20);
  assert.equal(printCopies({ copies: 99 }), 20);
  assert.equal(printCopies({}), 1);
});
