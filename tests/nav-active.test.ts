import assert from "node:assert/strict";
import test from "node:test";

import { isNavActive } from "../src/lib/nav-active.ts";

test("root href hanya aktif pada pathname yang sama persis", () => {
  assert.equal(isNavActive("/dashboard", "/dashboard", "/dashboard"), true);
  assert.equal(isNavActive("/dashboard/settings", "/dashboard", "/dashboard"), false);
});

test("item non-root aktif pada route persis dan child segment", () => {
  assert.equal(isNavActive("/dashboard/settings", "/dashboard/settings", "/dashboard"), true);
  assert.equal(
    isNavActive("/dashboard/settings/branding", "/dashboard/settings", "/dashboard"),
    true
  );
});

test("prefix sibling tidak dianggap child route", () => {
  assert.equal(isNavActive("/dashboard/settings-old", "/dashboard/settings", "/dashboard"), false);
  assert.equal(isNavActive("/admin/users-archive", "/admin/users", "/admin"), false);
  assert.equal(isNavActive("/staff/packages-preview", "/staff/packages", "/staff"), false);
});
