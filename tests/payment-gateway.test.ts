/**
 * Payment Gateway Phase 1 — unit tests.
 * node:test + node:assert/strict. Mock HTTP via globalThis.fetch stub.
 * Covers: encrypt/decrypt, Midtrans status + signature, Tripay HMAC,
 * Pakasir delegate, registry dispatch, amount validation.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { encrypt, decrypt, requireEncryptionKey } from "../src/server/payment/providers/encrypt.ts";
import {
  mapMidtransStatus,
  computeMidtransSignature,
  createMidtransGateway,
} from "../src/server/payment/providers/midtrans.ts";
import {
  mapTripayStatus,
  computeTripaySignature,
  createTripayGateway,
} from "../src/server/payment/providers/tripay.ts";
import { createPakasirGateway } from "../src/server/payment/providers/pakasir.ts";
import { mapProviderStatus } from "../src/server/payment/pakasir-utils.ts";
import { PAYMENT_PROVIDER_CODES, PAYMENT_ENVIRONMENTS } from "../src/lib/validators.ts";
import { resolveGatewayFromCredential } from "../src/server/payment/providers/gateway-factory.ts";
import type { GatewayCredential } from "../src/server/payment/providers/types.ts";

/** Pure settlement guard (inlined from removed src/lib/payment-settlement.ts). */
function assertMutationSucceeded(error: { message?: string } | null, action: string): void {
  if (!error) return;
  throw new Error(`${action}: ${error.message ?? "database error"}`);
}

const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const WRONG_KEY = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

// ---------------------------------------------------------------------------
// ENCRYPT / DECRYPT
// ---------------------------------------------------------------------------

test("encrypt/decrypt round-trip with valid key", () => {
  const plaintext = "sk-live-super-secret-key-12345";
  const encrypted = encrypt(plaintext, TEST_KEY);
  assert.equal(decrypt(encrypted, TEST_KEY), plaintext);
});

test("encrypt output has v1 prefix, key id, and 5 parts", () => {
  const parts = encrypt("test", TEST_KEY).split(":");
  // v1:<keyId>:<iv>:<tag>:<cipher> — key id membedakan kunci, bukan slot versi.
  assert.equal(parts.length, 5);
  assert.equal(parts[0], "v1");
  assert.match(parts[1]!, /^[0-9a-f]{8}$/);
});

test("decrypt with wrong key throws", () => {
  const encrypted = encrypt("secret", TEST_KEY);
  assert.throws(() => decrypt(encrypted, WRONG_KEY), /Dekripsi gagal/);
});

test("decrypt corrupt payload throws", () => {
  assert.throws(() => decrypt("v1:deadbeef:cafe:0000", TEST_KEY), /tidak valid|Dekripsi gagal/);
});

test("decrypt unknown version prefix throws", () => {
  assert.throws(() => decrypt("v99:aabb:ccdd:eeff", TEST_KEY), /tidak dikenal/);
});

test("requireEncryptionKey: key too short throws", () => {
  assert.throws(() => requireEncryptionKey("abcd"), /64 hex char/);
});

test("requireEncryptionKey: empty throws", () => {
  assert.throws(() => requireEncryptionKey(""), /wajib diset/);
});

test("requireEncryptionKey: valid returns 64-char hex string", () => {
  assert.equal(requireEncryptionKey(TEST_KEY), TEST_KEY);
});

test("requireEncryptionKey: valid key is 32 bytes when encoded", () => {
  assert.equal(Buffer.from(requireEncryptionKey(TEST_KEY), "hex").length, 32);
});

// ---------------------------------------------------------------------------
// MIDTRANS STATUS MAPPING
// ---------------------------------------------------------------------------

test("Midtrans: capture + accept = paid", () => {
  assert.equal(mapMidtransStatus("capture", "accept"), "paid");
});

test("Midtrans: settlement + accept = paid", () => {
  assert.equal(mapMidtransStatus("settlement", "accept"), "paid");
});

test("Midtrans: settlement tanpa fraud_status tetap paid (docs: settlement = dana masuk)", () => {
  // QRIS/e-wallet/VA tidak mengirim fraud_status. settlement adalah status final
  // "dana sudah dikreditkan" menurut reference/transaction-status Midtrans.
  assert.equal(mapMidtransStatus("settlement", null), "paid");
  assert.equal(mapMidtransStatus("settlement"), "paid");
});

test("Midtrans: fraud_status deny ditolak walau status settlement/capture", () => {
  assert.equal(mapMidtransStatus("settlement", "deny"), "failed");
  assert.equal(mapMidtransStatus("capture", "deny"), "failed");
});

test("Midtrans: capture + challenge = NOT paid (failed)", () => {
  assert.equal(mapMidtransStatus("capture", "challenge"), "failed");
});

test("Midtrans: pending = pending", () => {
  assert.equal(mapMidtransStatus("pending"), "pending");
});

test("Midtrans: deny = failed", () => {
  assert.equal(mapMidtransStatus("deny"), "failed");
});

test("Midtrans: cancel = failed", () => {
  assert.equal(mapMidtransStatus("cancel"), "failed");
});

test("Midtrans: expire = expired", () => {
  assert.equal(mapMidtransStatus("expire"), "expired");
});

// ---------------------------------------------------------------------------
// MIDTRANS WEBHOOK SIGNATURE
// ---------------------------------------------------------------------------

test("Midtrans: verifyWebhook SHA512 correct = true", () => {
  const cred: GatewayCredential = {
    id: "cred-1",
    provider: "midtrans",
    merchantId: "M001",
    serverKey: "SB-Mid-server-test123",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  };
  const gw = createMidtransGateway(cred);
  const sig = computeMidtransSignature("SnapyOS-ABC", "200", "50000.00", cred.serverKey);
  assert.equal(
    gw.verifyWebhook(
      { order_id: "SnapyOS-ABC", status_code: "200", gross_amount: "50000.00" },
      sig
    ),
    true
  );
});

test("Midtrans: verifyWebhook wrong signature = false", () => {
  const cred: GatewayCredential = {
    id: "cred-1",
    provider: "midtrans",
    merchantId: "M001",
    serverKey: "SB-Mid-server-test123",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  };
  const gw = createMidtransGateway(cred);
  assert.equal(
    gw.verifyWebhook(
      { order_id: "SnapyOS-ABC", status_code: "200", gross_amount: "50000.00" },
      "bad".repeat(32)
    ),
    false
  );
});

test("Midtrans: verifyWebhook null/empty payload = false", () => {
  const cred: GatewayCredential = {
    id: "cred-1",
    provider: "midtrans",
    merchantId: "M001",
    serverKey: "SB-Mid-server-test123",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  };
  const gw = createMidtransGateway(cred);
  assert.equal(gw.verifyWebhook(null, "abc"), false);
  assert.equal(gw.verifyWebhook({}, "abc"), false);
});

test("encrypt produces different ciphertext each time (random IV)", () => {
  assert.notEqual(encrypt("same", TEST_KEY), encrypt("same", TEST_KEY));
});

// ---------------------------------------------------------------------------
// TRIPAY STATUS MAPPING + WEBHOOK SIGNATURE
// ---------------------------------------------------------------------------

test("Tripay: PAID = paid", () => assert.equal(mapTripayStatus("PAID"), "paid"));
test("Tripay: UNPAID = pending", () => assert.equal(mapTripayStatus("UNPAID"), "pending"));
test("Tripay: EXPIRED = expired", () => assert.equal(mapTripayStatus("EXPIRED"), "expired"));
test("Tripay: FAILED = failed", () => assert.equal(mapTripayStatus("FAILED"), "failed"));
test("Tripay: REFUND = failed", () => assert.equal(mapTripayStatus("REFUND"), "failed"));

test("Tripay: HMAC-SHA256 correct rawBody = true", () => {
  const pk = "tripay-private-key-test";
  const cred: GatewayCredential = {
    id: "c2",
    provider: "tripay",
    merchantId: "T001",
    serverKey: "tripay-api-key",
    clientKey: null,
    environment: "sandbox",
    metadata: { private_key: pk },
  };
  const raw = '{"merchant_ref":"SnapyOS-XYZ","status":"PAID","amount":25000}';
  const sig = computeTripaySignature(raw, pk);
  assert.equal(createTripayGateway(cred).verifyWebhook(raw, sig), true);
});

test("Tripay: wrong signature = false", () => {
  const cred: GatewayCredential = {
    id: "c2",
    provider: "tripay",
    merchantId: "T001",
    serverKey: "api-key",
    clientKey: null,
    environment: "sandbox",
    metadata: { private_key: "pk" },
  };
  assert.equal(createTripayGateway(cred).verifyWebhook('{"t":1}', "invalid"), false);
});

test("Tripay: altered rawBody = false", () => {
  const pk = "tripay-private-key-test";
  const cred: GatewayCredential = {
    id: "c2",
    provider: "tripay",
    merchantId: "T001",
    serverKey: "api-key",
    clientKey: null,
    environment: "sandbox",
    metadata: { private_key: pk },
  };
  const raw = '{"amount":25000}';
  const sig = computeTripaySignature(raw, pk);
  assert.equal(createTripayGateway(cred).verifyWebhook('{"amount":99999}', sig), false);
});

test("Tripay: rejects non-string payload", () => {
  const cred: GatewayCredential = {
    id: "c2",
    provider: "tripay",
    merchantId: "T001",
    serverKey: "api-key",
    clientKey: null,
    environment: "sandbox",
    metadata: { private_key: "pk" },
  };
  assert.equal(createTripayGateway(cred).verifyWebhook({ x: 1 }, "abc"), false);
});

// ---------------------------------------------------------------------------
// PAKASIR STATUS DELEGATE
// ---------------------------------------------------------------------------

test("Pakasir: SUCCESS = paid", () => assert.equal(mapProviderStatus("SUCCESS"), "paid"));
test("Pakasir: PAID = paid", () => assert.equal(mapProviderStatus("PAID"), "paid"));
test("Pakasir: COMPLETED = paid", () => assert.equal(mapProviderStatus("COMPLETED"), "paid"));
test("Pakasir: PENDING = pending", () => assert.equal(mapProviderStatus("PENDING"), "pending"));
test("Pakasir: UNPAID = pending", () => assert.equal(mapProviderStatus("UNPAID"), "pending"));
test("Pakasir: EXPIRED = expired", () => assert.equal(mapProviderStatus("EXPIRED"), "expired"));
test("Pakasir: CANCELLED = expired", () => assert.equal(mapProviderStatus("CANCELLED"), "expired"));

test("registry seam: no credential falls back to Pakasir aggregator", () => {
  assert.equal(resolveGatewayFromCredential(null).provider, "pakasir");
});

test("registry seam: credential dispatches provider", () => {
  const credential: GatewayCredential = {
    id: "c-reg",
    provider: "midtrans",
    merchantId: "M",
    serverKey: "s",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  };
  assert.equal(resolveGatewayFromCredential(credential).provider, "midtrans");
});

test("settlement guard: persistence error throws", () => {
  assert.throws(
    () =>
      assertMutationSucceeded({ message: "insert denied" }, "Gagal mencatat piutang platform fee"),
    /insert denied/
  );
});

test("settlement guard: no error succeeds", () => {
  assert.doesNotThrow(() => assertMutationSucceeded(null, "unused"));
});
test("Pakasir: unknown = null", () => assert.equal(mapProviderStatus("RANDOM"), null));

test("Pakasir: no DB credential uses aggregator factory", () => {
  const gateway = createPakasirGateway(null);
  assert.equal(gateway.provider, "pakasir");
  assert.equal(gateway.verifyWebhook({}, ""), true);
});

// ---------------------------------------------------------------------------
// REGISTRY: adapter factory dispatch (inline — registry.ts has server-only)
// ---------------------------------------------------------------------------

function buildGatewayInline(cred: GatewayCredential) {
  switch (cred.provider) {
    case "midtrans":
      return createMidtransGateway(cred);
    case "tripay":
      return createTripayGateway(cred);
    case "pakasir":
      return createPakasirGateway(cred);
    default:
      throw new Error(`Provider tidak dikenal: ${cred.provider as string}`);
  }
}

test("buildGateway: midtrans", () => {
  assert.equal(
    buildGatewayInline({
      id: "c1",
      provider: "midtrans",
      merchantId: "M",
      serverKey: "s",
      clientKey: null,
      environment: "sandbox",
      metadata: {},
    }).provider,
    "midtrans"
  );
});

test("buildGateway: tripay", () => {
  assert.equal(
    buildGatewayInline({
      id: "c2",
      provider: "tripay",
      merchantId: "T",
      serverKey: "a",
      clientKey: null,
      environment: "sandbox",
      metadata: { private_key: "p" },
    }).provider,
    "tripay"
  );
});

test("buildGateway: pakasir", () => {
  assert.equal(
    buildGatewayInline({
      id: "c3",
      provider: "pakasir",
      merchantId: "s",
      serverKey: "a",
      clientKey: null,
      environment: "sandbox",
      metadata: {},
    }).provider,
    "pakasir"
  );
});

test("buildGateway: unknown throws", () => {
  assert.throws(
    () =>
      buildGatewayInline({
        id: "c4",
        provider: "x" as "midtrans",
        merchantId: "X",
        serverKey: "X",
        clientKey: null,
        environment: "sandbox",
        metadata: {},
      }),
    /tidak dikenal/
  );
});

// ---------------------------------------------------------------------------
// AMOUNT VALIDATION
// ---------------------------------------------------------------------------

test("Midtrans: rejects non-integer amount", async () => {
  const gw = createMidtransGateway({
    id: "c1",
    provider: "midtrans",
    merchantId: "M",
    serverKey: "s",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  });
  await assert.rejects(
    () => gw.createTransaction({ orderId: "X", amount: 100.5, description: "t", callbackUrl: "u" }),
    /integer IDR positif/
  );
});

test("Midtrans: rejects negative amount", async () => {
  const gw = createMidtransGateway({
    id: "c1",
    provider: "midtrans",
    merchantId: "M",
    serverKey: "s",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  });
  await assert.rejects(
    () => gw.createTransaction({ orderId: "X", amount: -1, description: "t", callbackUrl: "u" }),
    /integer IDR positif/
  );
});

test("Tripay: rejects non-integer amount", async () => {
  const gw = createTripayGateway({
    id: "c2",
    provider: "tripay",
    merchantId: "T",
    serverKey: "a",
    clientKey: null,
    environment: "sandbox",
    metadata: { private_key: "p" },
  });
  await assert.rejects(
    () => gw.createTransaction({ orderId: "X", amount: 99.9, description: "t", callbackUrl: "u" }),
    /integer IDR positif/
  );
});

test("Pakasir: rejects zero amount", async () => {
  await assert.rejects(
    () =>
      createPakasirGateway(null).createTransaction({
        orderId: "X",
        amount: 0,
        description: "t",
        callbackUrl: "u",
      }),
    /integer IDR positif/
  );
});

test("Midtrans: createTransaction rejects mismatched provider order ID", async () => {
  const gw = createMidtransGateway({
    id: "c1",
    provider: "midtrans",
    merchantId: "M",
    serverKey: "s",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  });
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          order_id: "SnapyOS-OTHER",
          gross_amount: 50000,
        }),
        { status: 201 }
      )) as typeof fetch;
    await assert.rejects(
      () =>
        gw.createTransaction({
          orderId: "SnapyOS-M1",
          amount: 50000,
          description: "Test",
          callbackUrl: "https://t.co",
        }),
      /tidak cocok/
    );
  } finally {
    globalThis.fetch = orig;
  }
});

test("Midtrans: createTransaction rejects mismatched provider amount", async () => {
  const gw = createMidtransGateway({
    id: "c1",
    provider: "midtrans",
    merchantId: "M",
    serverKey: "s",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  });
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          order_id: "SnapyOS-M1",
          gross_amount: 99999,
        }),
        { status: 201 }
      )) as typeof fetch;
    await assert.rejects(
      () =>
        gw.createTransaction({
          orderId: "SnapyOS-M1",
          amount: 50000,
          description: "Test",
          callbackUrl: "https://t.co",
        }),
      /tidak cocok/
    );
  } finally {
    globalThis.fetch = orig;
  }
});

// ---------------------------------------------------------------------------
// MOCK FETCH: Midtrans + Tripay
// ---------------------------------------------------------------------------

test("Midtrans: createTransaction mock fetch", async () => {
  const gw = createMidtransGateway({
    id: "c1",
    provider: "midtrans",
    merchantId: "M",
    serverKey: "s",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  });
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          order_id: "SnapyOS-M1",
          gross_amount: 50000,
          transaction_id: "txn-001",
          qr_string: "00020101...",
          actions: [{ name: "generate-qr-code", url: "https://qr.test/abc" }],
        }),
        { status: 201 }
      )) as typeof fetch;
    const r = await gw.createTransaction({
      orderId: "SnapyOS-M1",
      amount: 50000,
      description: "Test",
      callbackUrl: "https://t.co",
    });
    assert.equal(r.orderId, "SnapyOS-M1");
    assert.equal(Number.isInteger(r.amount), true);
    assert.equal(Number.isInteger(r.totalAmount), true);
    assert.equal(r.qrImageUrl, "https://qr.test/abc");
  } finally {
    globalThis.fetch = orig;
  }
});

test("Midtrans: e-wallet charge preserves requested method and redirect action", async () => {
  const gw = createMidtransGateway({
    id: "c1",
    provider: "midtrans",
    merchantId: "M",
    serverKey: "s",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  });
  const orig = globalThis.fetch;
  try {
    const captured: { body: Record<string, unknown> | null } = { body: null };
    globalThis.fetch = (async (_url, init) => {
      captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          order_id: "SnapyOS-GOPAY",
          gross_amount: 50000,
          transaction_id: "txn-gopay",
          actions: [{ name: "deeplink-redirect", url: "gojek://gopay/pay" }],
        }),
        { status: 201 }
      );
    }) as typeof fetch;
    const result = await gw.createTransaction({
      orderId: "SnapyOS-GOPAY",
      amount: 50000,
      description: "Test",
      callbackUrl: "https://snapyos.example/webhook",
      returnUrl: "https://snapyos.example/p/kiosk/box",
      paymentMethods: ["gopay"],
    });
    assert.equal(captured.body?.payment_type, "gopay");
    assert.deepEqual(captured.body?.gopay, {
      enable_callback: true,
      callback_url: "https://snapyos.example/p/kiosk/box",
    });
    assert.equal(result.paymentUrl, "gojek://gopay/pay");
  } finally {
    globalThis.fetch = orig;
  }
});

test("Midtrans: getStatus mock → paid", async () => {
  const gw = createMidtransGateway({
    id: "c1",
    provider: "midtrans",
    merchantId: "M",
    serverKey: "s",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  });
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          transaction_status: "settlement",
          fraud_status: "accept",
        })
      )) as typeof fetch;
    assert.equal(await gw.getStatus("SnapyOS-M1"), "paid");
  } finally {
    globalThis.fetch = orig;
  }
});

test("Tripay: createTransaction rejects mismatched merchant_ref", async () => {
  const gw = createTripayGateway({
    id: "c2",
    provider: "tripay",
    merchantId: "T",
    serverKey: "a",
    clientKey: null,
    environment: "sandbox",
    metadata: { private_key: "p" },
  });
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: { merchant_ref: "SnapyOS-OTHER", reference: "T1", amount: 30000 },
        })
      )) as typeof fetch;
    await assert.rejects(
      () =>
        gw.createTransaction({
          orderId: "SnapyOS-TRI1",
          amount: 30000,
          description: "Test",
          callbackUrl: "https://t.co",
        }),
      /tidak cocok/
    );
  } finally {
    globalThis.fetch = orig;
  }
});

test("Tripay: createTransaction sends callback URL", async () => {
  const gw = createTripayGateway({
    id: "c2",
    provider: "tripay",
    merchantId: "T001",
    serverKey: "ak",
    clientKey: null,
    environment: "sandbox",
    metadata: { private_key: "pk" },
  });
  const orig = globalThis.fetch;
  try {
    const captured: { body: Record<string, unknown> | null } = { body: null };
    globalThis.fetch = (async (_url, init) => {
      captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          data: { merchant_ref: "SnapyOS-CALLBACK", reference: "T0000", amount: 30000 },
        })
      );
    }) as typeof fetch;
    await gw.createTransaction({
      orderId: "SnapyOS-CALLBACK",
      amount: 30000,
      description: "Test",
      callbackUrl: "https://snapyos.example/api/webhooks/payment/tripay",
      returnUrl: "https://snapyos.example/p/kiosk/box",
    });
    assert.equal(
      captured.body?.callback_url,
      "https://snapyos.example/api/webhooks/payment/tripay"
    );
    assert.equal(captured.body?.return_url, "https://snapyos.example/p/kiosk/box");
  } finally {
    globalThis.fetch = orig;
  }
});

test("Tripay: createTransaction mock fetch", async () => {
  const gw = createTripayGateway({
    id: "c2",
    provider: "tripay",
    merchantId: "T001",
    serverKey: "ak",
    clientKey: null,
    environment: "sandbox",
    metadata: { private_key: "pk" },
  });
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: {
            merchant_ref: "SnapyOS-TRI1",
            reference: "T0001",
            amount: 30000,
            expired_time: 1726000000,
          },
        })
      )) as typeof fetch;
    const r = await gw.createTransaction({
      orderId: "SnapyOS-TRI1",
      amount: 30000,
      description: "Test",
      callbackUrl: "https://t.co",
    });
    assert.equal(r.orderId, "SnapyOS-TRI1");
    assert.equal(Number.isInteger(r.amount), true);
    assert.equal(r.providerRef, "T0001");
  } finally {
    globalThis.fetch = orig;
  }
});

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

test("PAYMENT_PROVIDER_CODES", () => {
  assert.deepEqual([...PAYMENT_PROVIDER_CODES], ["midtrans", "tripay", "pakasir"]);
});

test("PAYMENT_ENVIRONMENTS", () => {
  assert.deepEqual([...PAYMENT_ENVIRONMENTS], ["sandbox", "production"]);
});

test("Pakasir: probeCredential throws when the API key is rejected (401/403)", async () => {
  const gw = createPakasirGateway({
    id: "c3",
    provider: "pakasir",
    merchantId: "owner-project",
    serverKey: "wrong-key",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  });
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })) as typeof fetch;
    await assert.rejects(() => gw.probeCredential!(), /401\/403/);

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })) as typeof fetch;
    await assert.rejects(() => gw.probeCredential!(), /401\/403/);

    // 404 = key valid, txn dummy tidak ada — probe sukses (bukan error).
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "not found" }), { status: 404 })) as typeof fetch;
    await gw.probeCredential!();

    // 200 = ada transaksi / apa pun: auth lolos.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ transaction: null }), { status: 200 })) as typeof fetch;
    await gw.probeCredential!();
  } finally {
    globalThis.fetch = orig;
  }
});

test("Pakasir: getStatus still swallows non-OK responses as pending (settlement fail-closed)", async () => {
  const gw = createPakasirGateway({
    id: "c3",
    provider: "pakasir",
    merchantId: "owner-project",
    serverKey: "wrong-key",
    clientKey: null,
    environment: "sandbox",
    metadata: {},
  });
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })) as typeof fetch;
    assert.equal(await gw.getStatus("SnapyOS-X1", 1000), "pending");
  } finally {
    globalThis.fetch = orig;
  }
});

test("Tripay: probeCredential throws on 401/403 but accepts a 200 success:false body", async () => {
  const gw = createTripayGateway({
    id: "c4",
    provider: "tripay",
    merchantId: "T001",
    serverKey: "wrong-key",
    clientKey: null,
    environment: "sandbox",
    metadata: { private_key: "p" },
  });
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: false, message: "Unauthorized" }), {
        status: 401,
      })) as typeof fetch;
    await assert.rejects(() => gw.probeCredential!(), /401\/403/);

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: false, message: "Transaction not found" }), {
        status: 200,
      })) as typeof fetch;
    await gw.probeCredential!();

    // Body bukan JSON → tidak bisa membuktikan auth, harus gagal.
    globalThis.fetch = (async () =>
      new Response("<html>gateway</html>", { status: 502 })) as typeof fetch;
    await assert.rejects(() => gw.probeCredential!(), /gagal/);
  } finally {
    globalThis.fetch = orig;
  }
});
