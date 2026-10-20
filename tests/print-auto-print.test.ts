/**
 * Guard auto-print — satu job hanya boleh auto-print sekali.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  autoPrintStorageKey,
  claimAutoPrintAttempt,
  shouldClaimAutoPrint,
  type AutoPrintStore,
} from "../src/lib/print/auto-print.ts";

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: AutoPrintStore = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
  return { store, data };
}

test("claim pertama true, claim kedua false (Strict Mode double-effect)", () => {
  const { store } = memoryStore();
  const key = autoPrintStorageKey("kiosk", "session-1");
  assert.equal(claimAutoPrintAttempt(key, store), true);
  assert.equal(claimAutoPrintAttempt(key, store), false);
});

test("key berbeda (sesi/order lain) tetap boleh auto-print", () => {
  const { store } = memoryStore();
  assert.equal(claimAutoPrintAttempt(autoPrintStorageKey("kiosk", "s1"), store), true);
  assert.equal(claimAutoPrintAttempt(autoPrintStorageKey("kiosk", "s2"), store), true);
  assert.equal(claimAutoPrintAttempt(autoPrintStorageKey("pos", "s1"), store), true);
});

test("claim tersimpan sebelum job dikirim — refresh tidak mencetak ulang", () => {
  const { store, data } = memoryStore();
  const key = autoPrintStorageKey("pos", "order-9");
  claimAutoPrintAttempt(key, store);
  assert.equal(data.get(key), "1");
  // Simulasi mount ulang setelah refresh dengan storage yang sama.
  assert.equal(claimAutoPrintAttempt(key, store), false);
});

test("storage diblokir/SSR → true (fallback ref lokal, bukan crash)", () => {
  assert.equal(claimAutoPrintAttempt(autoPrintStorageKey("pos", "x"), null), true);
});

test("storage melempar → dianggap belum diklaim (UI tetap bisa mencetak)", () => {
  const throwing: AutoPrintStore = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(claimAutoPrintAttempt(autoPrintStorageKey("pos", "x"), throwing), true);
});

test("reprint eksplisit melewati claim auto-print", () => {
  assert.equal(shouldClaimAutoPrint({ auto: true, reprint: true, jobId: "s1" }), false);
  assert.equal(shouldClaimAutoPrint({ auto: true, reprint: false, jobId: "s1" }), true);
});

test("auto_print=false atau jobId kosong tidak memakai claim storage", () => {
  assert.equal(shouldClaimAutoPrint({ auto: false, reprint: false, jobId: "s1" }), false);
  assert.equal(shouldClaimAutoPrint({ auto: true, reprint: false, jobId: "" }), false);
  assert.equal(shouldClaimAutoPrint({ auto: true, reprint: false }), false);
});
