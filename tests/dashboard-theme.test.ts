import assert from "node:assert/strict";
import test from "node:test";

import { parseDashboardTheme } from "../src/lib/dashboard-theme.ts";

test("cookie modern memilih tema modern", () => {
  assert.equal(parseDashboardTheme("modern"), "modern");
});

test("cookie brutalist eksplisit", () => {
  assert.equal(parseDashboardTheme("brutalist"), "brutalist");
});

test("tanpa cookie jatuh ke brutalist", () => {
  assert.equal(parseDashboardTheme(undefined), "brutalist");
  assert.equal(parseDashboardTheme(null), "brutalist");
  assert.equal(parseDashboardTheme(""), "brutalist");
});

test("nilai tak dikenal tidak pernah jadi modern", () => {
  assert.equal(parseDashboardTheme("MODERN"), "brutalist");
  assert.equal(parseDashboardTheme("shadcn"), "brutalist");
  assert.equal(parseDashboardTheme(" modern"), "brutalist");
});
