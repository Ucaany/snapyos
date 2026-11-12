import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeResetKeys } from "./branding-reset.ts";

void test("sanitizeResetKeys mengizinkan semua key top-level branding", () => {
  assert.deepEqual(
    sanitizeResetKeys([
      "primary_color",
      "secondary_color",
      "welcome_title",
      "welcome_tagline",
      "welcome_button",
      "logo_key",
      "kiosk",
    ]),
    [
      "primary_color",
      "secondary_color",
      "welcome_title",
      "welcome_tagline",
      "welcome_button",
      "logo_key",
      "kiosk",
    ]
  );
});

void test("sanitizeResetKeys mengizinkan key kiosk", () => {
  assert.deepEqual(sanitizeResetKeys(["kiosk.bg_color", "kiosk.video_key", "kiosk.pages"]), [
    "kiosk.bg_color",
    "kiosk.video_key",
    "kiosk.pages",
  ]);
});

void test("sanitizeResetKeys mengizinkan page dan field layar", () => {
  assert.deepEqual(
    sanitizeResetKeys([
      "kiosk.pages.welcome",
      "kiosk.pages.edit.padding",
      "kiosk.pages.result.video_key",
    ]),
    ["kiosk.pages.welcome", "kiosk.pages.edit.padding", "kiosk.pages.result.video_key"]
  );
});

void test("sanitizeResetKeys menolak path tidak dikenal", () => {
  assert.deepEqual(
    sanitizeResetKeys([
      "foo",
      "kiosk.unknown",
      "kiosk.pages.unknown",
      "kiosk.pages.welcome.bogus",
      "kiosk.pages.welcome.padding.extra",
      "logo_key.extra",
    ]),
    []
  );
});

void test("sanitizeResetKeys menolak traversal, segmen kosong, backslash, non-string", () => {
  assert.deepEqual(
    sanitizeResetKeys([
      "..",
      "kiosk..bg_color",
      "kiosk.pages..welcome",
      "kiosk.pages.welcome.padding\\x",
      "",
      42,
      null,
    ]),
    []
  );
});

void test("sanitizeResetKeys non-array = kosong", () => {
  assert.deepEqual(sanitizeResetKeys(undefined), []);
  assert.deepEqual(sanitizeResetKeys("kiosk.bg_color"), []);
});
