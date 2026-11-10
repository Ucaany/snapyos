import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKioskPaymentMethods,
  decodeKioskPaymentPayload,
  ensureFreeSettlementMethod,
  encodeKioskPaymentPayload,
  filterKioskPaymentMethods,
  normalizePaymentMethod,
  paymentDisplay,
} from "../src/server/payment/kiosk-payment.ts";

test("direct methods override Pakasir fallback", () => {
  const methods = buildKioskPaymentMethods([
    { provider: "midtrans", enabledMethods: ["qris", "bca"] },
  ]);
  assert.deepEqual(
    methods.slice(0, 2).map((method) => method.id),
    ["midtrans:qris", "midtrans:bca"]
  );
  assert.equal(
    methods.some((method) => method.id === "pakasir:qris"),
    false
  );
  assert.equal(methods.at(-2)?.id, "voucher");
  assert.equal(methods.at(-1)?.id, "cash");
});

test("no aggregator fallback: empty credentials → voucher + cash only", () => {
  const methods = buildKioskPaymentMethods([]);
  assert.deepEqual(
    methods.map((method) => method.id),
    ["voucher", "cash"]
  );
  assert.equal(
    methods.some((method) => method.provider === "pakasir"),
    false
  );
});

test("pakasir direct credential produces pakasir:qris from owner credential", () => {
  const methods = buildKioskPaymentMethods([{ provider: "pakasir", enabledMethods: ["qris"] }]);
  assert.equal(methods[0]?.id, "pakasir:qris");
  assert.equal(methods[0]?.provider, "pakasir");
  assert.equal(methods[0]?.display, "qris");
  assert.equal(methods[0]?.label, "QRIS PAKASIR");
  assert.notEqual(methods[0]?.hint, "Dana cair H+1");
});

test("gateway displays map to QRIS, VA, and redirect", () => {
  assert.equal(paymentDisplay("midtrans", "qris"), "qris");
  assert.equal(paymentDisplay("midtrans", "bca"), "va");
  assert.equal(paymentDisplay("midtrans", "gopay"), "redirect");
  assert.equal(paymentDisplay("midtrans", "shopeepay"), "redirect");
  assert.equal(paymentDisplay("tripay", "BCAVA"), "va");
  assert.equal(paymentDisplay("tripay", "ALFAMART"), "redirect");
});

test("display payload round-trips without provider secrets", () => {
  const encoded = encodeKioskPaymentPayload({
    display: "va",
    method: "bca",
    qrString: null,
    qrImageUrl: null,
    paymentUrl: null,
    vaNumber: "12345",
  });
  assert.deepEqual(decodeKioskPaymentPayload(encoded), {
    display: "va",
    method: "bca",
    qrString: null,
    qrImageUrl: null,
    paymentUrl: null,
    vaNumber: "12345",
  });
  assert.equal(decodeKioskPaymentPayload("not-json"), null);
});

test("per-booth channel filter hides the opposite channel", () => {
  const methods = buildKioskPaymentMethods([
    { provider: "midtrans", enabledMethods: ["qris", "bca"] },
  ]);
  const ids = methods.map((m) => m.id);

  const gatewayOnly = filterKioskPaymentMethods(methods, "gateway");
  assert.equal(
    gatewayOnly.some((m) => m.id === "voucher"),
    false
  );
  assert.equal(
    gatewayOnly.some((m) => m.id === "cash"),
    true
  );
  assert.equal(
    gatewayOnly.some((m) => m.kind === "gateway"),
    true
  );

  const voucherOnly = filterKioskPaymentMethods(methods, "voucher");
  assert.equal(
    voucherOnly.some((m) => m.kind === "gateway"),
    false
  );
  assert.equal(
    voucherOnly.some((m) => m.id === "voucher"),
    true
  );
  assert.equal(
    voucherOnly.some((m) => m.id === "cash"),
    true
  );

  const both = filterKioskPaymentMethods(methods, null);
  assert.deepEqual(
    both.map((m) => m.id),
    ids
  );
});

test("checkout bersisa nol tetap menawarkan voucher di booth hanya-gateway", () => {
  const all = buildKioskPaymentMethods([{ provider: "midtrans", enabledMethods: ["qris"] }]);
  const gatewayOnly = filterKioskPaymentMethods(all, "gateway");
  assert.equal(
    gatewayOnly.some((m) => m.kind === "voucher"),
    false
  );
  // finalAmount > 0 → filter booth dihormati
  assert.equal(
    ensureFreeSettlementMethod(gatewayOnly, all, 25000).some((m) => m.kind === "voucher"),
    false
  );
  // finalAmount 0 → voucher (pelunasan gratis) wajib tersedia
  const free = ensureFreeSettlementMethod(gatewayOnly, all, 0);
  assert.equal(
    free.some((m) => m.kind === "voucher"),
    true
  );
  // idempoten: tidak menambah voucher dua kali
  assert.equal(free.filter((m) => m.kind === "voucher").length, 1);
});

test("normalizePaymentMethod returns canonical spelling per provider", () => {
  assert.equal(normalizePaymentMethod("midtrans", "QRIS"), "qris");
  assert.equal(normalizePaymentMethod("midtrans", " bca "), "bca");
  assert.equal(normalizePaymentMethod("tripay", "bcava"), "BCAVA");
  assert.equal(normalizePaymentMethod("tripay", " Alfamart "), "ALFAMART");
  assert.equal(normalizePaymentMethod("pakasir", "Qris"), "qris");
});

test("normalizePaymentMethod rejects unknown methods instead of falling back to qris", () => {
  assert.throws(() => normalizePaymentMethod("midtrans", "dana"), /tidak dikenal/);
  assert.throws(() => normalizePaymentMethod("midtrans", "alfamart"), /tidak dikenal/);
  assert.throws(() => normalizePaymentMethod("tripay", "bca"), /tidak dikenal/);
  assert.throws(() => normalizePaymentMethod("tripay", "OVO"), /tidak dikenal/);
  assert.throws(() => normalizePaymentMethod("pakasir", "gopay"), /tidak dikenal/);
  assert.throws(() => normalizePaymentMethod("midtrans", ""), /tidak dikenal/);
  // Rejected messages list the valid choices so owner can fix the credential.
  assert.throws(() => normalizePaymentMethod("pakasir", "va"), /qris/);
});

test("buildKioskPaymentMethods rejects credentials carrying unknown methods", () => {
  assert.throws(
    () => buildKioskPaymentMethods([{ provider: "midtrans", enabledMethods: ["bogus"] }]),
    /tidak dikenal/
  );
});
