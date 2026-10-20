/**
 * Consult WhatsApp unit checks — node:test bawaan.
 * Run: npm test (normalisasi nomor + link wa.me untuk halaman /register).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { waNormalize, waLink, waDisplay, CONSULT_WHATSAPP_DEFAULT } from "../src/lib/consult.ts";

test("waNormalize: 08… → 62…", () => {
  assert.equal(waNormalize("08983704013"), "628983704013");
});

test("waNormalize: sudah 62 / +62 tetap benar", () => {
  assert.equal(waNormalize("628983704013"), "628983704013");
  assert.equal(waNormalize("+62 898-3704-013"), "628983704013");
});

test("waLink: pakai default message & nomor ter-normalisasi", () => {
  const url = waLink(CONSULT_WHATSAPP_DEFAULT);
  assert.ok(url.startsWith("https://wa.me/628983704013?text="));
});

test("waDisplay: kelompokkan 0898-3704-013", () => {
  assert.equal(waDisplay("08983704013"), "0898-3704-013");
  // Panjang tak terduga → dikembalikan apa adanya.
  assert.equal(waDisplay("12345"), "12345");
});
