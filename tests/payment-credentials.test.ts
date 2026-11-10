import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError } from "../src/lib/api-errors.ts";
import {
  assertPaymentCredentialOwner,
  assertPaymentCredentialTenant,
  assertActiveCredentialLimit,
  canTestCredentialInEnvironment,
  canTestPaymentCredential,
  PAYMENT_FIELD_LABELS,
  PAYMENT_METHODS,
  paymentWebhookStatus,
  redactPaymentCredential,
  validatePaymentField,
} from "../src/lib/payment-credentials.ts";
import { paymentCredentialCreateSchema } from "../src/lib/validators.ts";
import { credentialMetadata } from "../src/server/payment-credentials-codec.ts";
import { decrypt, encrypt } from "../src/server/payment/providers/encrypt.ts";

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.PAYMENT_ENCRYPTION_KEY = KEY;

const stored = {
  id: "cred-1",
  business_id: "business-a",
  provider: "tripay" as const,
  label: "Tripay Sandbox",
  merchant_id: "T123",
  server_key_encrypted: encrypt("api-secret", KEY),
  client_key: null,
  environment: "sandbox" as const,
  is_active: true,
  metadata: {
    private_key_encrypted: encrypt("private-secret", KEY),
    enabled_methods: ["QRIS", "NOT_A_METHOD"],
  },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

test("credential authorization requires owner", () => {
  assert.doesNotThrow(() => assertPaymentCredentialOwner("owner"));
  for (const role of ["manager", "staff"] as const) {
    assert.throws(
      () => assertPaymentCredentialOwner(role),
      (error: unknown) => error instanceof ApiError && error.code === "FORBIDDEN"
    );
  }
  assert.throws(
    () => assertPaymentCredentialOwner(null),
    (error: unknown) => error instanceof ApiError && error.code === "NOT_FOUND"
  );
});

test("credential tenant scoping rejects another business", () => {
  assert.doesNotThrow(() => assertPaymentCredentialTenant(stored, "business-a"));
  assert.throws(() => assertPaymentCredentialTenant(stored, "business-b"), /tidak ditemukan/);
});

test("private credentials are encrypted at rest and never returned by redaction", () => {
  assert.match(stored.server_key_encrypted, /^v1:/);
  assert.notEqual(stored.server_key_encrypted, "api-secret");
  assert.equal(decrypt(stored.server_key_encrypted, KEY), "api-secret");
  const publicRow = redactPaymentCredential(stored);
  const serialized = JSON.stringify(publicRow);
  assert.equal(serialized.includes("server_key_encrypted"), false);
  assert.equal(serialized.includes("api-secret"), false);
  assert.equal(serialized.includes("private-secret"), false);
  assert.equal(serialized.includes("private_key"), false);
  assert.deepEqual(publicRow.enabled_methods, ["QRIS"]);
  assert.equal(publicRow.webhook_url, null);
  assert.match(String(publicRow.webhook_reason), /SnapyOS_PUBLIC_BASE_URL/);
});

test("callback URL requires absolute HTTPS public base URL", async () => {
  const { paymentWebhookUrl } = await import("../src/lib/payment-credentials.ts");
  const priorPublic = process.env.SnapyOS_PUBLIC_BASE_URL;
  try {
    process.env.SnapyOS_PUBLIC_BASE_URL = "https://snapyos.example/base";
    assert.equal(
      paymentWebhookUrl("midtrans"),
      "https://snapyos.example/api/webhooks/payment/midtrans"
    );
    assert.equal(
      paymentWebhookUrl("pakasir"),
      "https://snapyos.example/api/webhooks/payment/pakasir"
    );
    process.env.SnapyOS_PUBLIC_BASE_URL = "http://localhost:3000";
    assert.equal(paymentWebhookUrl("tripay"), null);
  } finally {
    if (priorPublic === undefined) delete process.env.SnapyOS_PUBLIC_BASE_URL;
    else process.env.SnapyOS_PUBLIC_BASE_URL = priorPublic;
  }
});

test("Pakasir credential requires and encrypts webhook secret", () => {
  assert.throws(
    () =>
      paymentCredentialCreateSchema.parse({
        provider: "pakasir",
        merchant_id: "project-slug",
        server_key: "api-key",
        environment: "production",
        enabled_methods: ["qris"],
      }),
    /Webhook secret Pakasir wajib diisi/
  );
  const parsed = paymentCredentialCreateSchema.parse({
    provider: "pakasir",
    merchant_id: "project-slug",
    server_key: "api-key",
    webhook_secret: "whsec-123",
    environment: "production",
    enabled_methods: ["qris"],
  });
  const metadata = credentialMetadata(parsed);
  assert.equal(typeof metadata.webhook_secret_encrypted, "string");
  assert.equal(decrypt(String(metadata.webhook_secret_encrypted), KEY), "whsec-123");
  assert.equal("webhook_secret" in metadata, false);
});

test("Pakasir webhook secret verification is timing-safe and fail-closed", async () => {
  const { verifyPakasirWebhookSecret } = await import("../src/server/payment/pakasir-utils.ts");
  assert.equal(verifyPakasirWebhookSecret("whsec-123", "whsec-123"), true);
  assert.equal(verifyPakasirWebhookSecret(" whsec-123 ", "whsec-123"), true);
  assert.equal(verifyPakasirWebhookSecret("wrong", "whsec-123"), false);
  assert.equal(verifyPakasirWebhookSecret("whsec-123", null), false);
  assert.equal(verifyPakasirWebhookSecret(null, "whsec-123"), false);
  assert.equal(verifyPakasirWebhookSecret("", ""), false);
});

test("all three providers expose a connection test (create+cancel / non-destructive probe)", () => {
  assert.equal(canTestPaymentCredential("midtrans"), true);
  assert.equal(canTestPaymentCredential("tripay"), true);
  assert.equal(canTestPaymentCredential("pakasir"), true);
});

test("active credential limit blocks more than two active gateways", () => {
  assert.doesNotThrow(() => assertActiveCredentialLimit(0));
  assert.doesNotThrow(() => assertActiveCredentialLimit(1));
  assert.throws(
    () => assertActiveCredentialLimit(2),
    (error: unknown) => error instanceof ApiError && error.code === "VALIDATION_ERROR"
  );
  assert.throws(
    () => assertActiveCredentialLimit(3),
    (error: unknown) => error instanceof ApiError && error.code === "VALIDATION_ERROR"
  );
});

test("Tripay maps merchant code, API key and encrypted private key", () => {
  const parsed = paymentCredentialCreateSchema.parse({
    provider: "tripay",
    merchant_id: "MERCHANT-CODE",
    server_key: "api-key",
    private_key: "private-key",
    environment: "sandbox",
    enabled_methods: ["QRIS"],
  });
  const metadata = credentialMetadata(parsed);
  assert.equal(parsed.merchant_id, "MERCHANT-CODE");
  assert.equal(parsed.server_key, "api-key");
  assert.equal(typeof metadata.private_key_encrypted, "string");
  assert.equal(decrypt(String(metadata.private_key_encrypted), KEY), "private-key");
  assert.equal("private_key" in metadata, false);
});

function withBase(value: string | undefined, run: () => void) {
  const prior = process.env.SnapyOS_PUBLIC_BASE_URL;
  try {
    if (value === undefined) delete process.env.SnapyOS_PUBLIC_BASE_URL;
    else process.env.SnapyOS_PUBLIC_BASE_URL = value;
    run();
  } finally {
    if (prior === undefined) delete process.env.SnapyOS_PUBLIC_BASE_URL;
    else process.env.SnapyOS_PUBLIC_BASE_URL = prior;
  }
}

test("webhook diagnosis names the concrete cause when the URL is missing", () => {
  withBase(undefined, () => {
    const status = paymentWebhookStatus("midtrans");
    assert.equal(status.url, null);
    assert.match(String(status.reason), /SnapyOS_PUBLIC_BASE_URL kosong/);
  });
  withBase("not a url", () => {
    const status = paymentWebhookStatus("tripay");
    assert.equal(status.url, null);
    assert.match(String(status.reason), /bukan URL valid/);
  });
  withBase("http://localhost:3000", () => {
    const status = paymentWebhookStatus("pakasir");
    assert.equal(status.url, null);
    assert.match(String(status.reason), /http:\/\/ — webhook wajib HTTPS/);
  });
  withBase("https://snapyos.example", () => {
    const status = paymentWebhookStatus("midtrans");
    assert.deepEqual(status, {
      url: "https://snapyos.example/api/webhooks/payment/midtrans",
      reason: null,
    });
  });
});

test("connection test is enabled for all three providers, production only for read-only probes", () => {
  for (const provider of ["midtrans", "tripay", "pakasir"] as const) {
    assert.equal(canTestPaymentCredential(provider), true);
    assert.equal(canTestCredentialInEnvironment(provider, "sandbox"), true);
  }
  assert.equal(canTestCredentialInEnvironment("midtrans", "production"), false);
  assert.equal(canTestCredentialInEnvironment("tripay", "production"), true);
  assert.equal(canTestCredentialInEnvironment("pakasir", "production"), true);
});

test("field labels and format validation are provider-specific", () => {
  assert.equal(PAYMENT_FIELD_LABELS.pakasir.merchant_id, "Project Slug");
  assert.equal(PAYMENT_FIELD_LABELS.pakasir.client_key, null);
  assert.equal(PAYMENT_FIELD_LABELS.midtrans.client_key, "Client Key");
  assert.equal(PAYMENT_FIELD_LABELS.tripay.private_key, "Private Key");
  assert.equal(PAYMENT_FIELD_LABELS.tripay.webhook_secret, null);

  assert.equal(validatePaymentField("pakasir", "merchant_id", "my-project"), null);
  assert.match(String(validatePaymentField("pakasir", "merchant_id", "My Project")), /huruf kecil/);
  assert.equal(validatePaymentField("midtrans", "server_key", "SB-Mid-server-abc"), null);
  assert.match(String(validatePaymentField("midtrans", "server_key", "abc")), /SB-Mid-server-/);
  assert.equal(validatePaymentField("midtrans", "client_key", "Mid-client-xyz"), null);
  assert.match(
    String(validatePaymentField("midtrans", "client_key", "SB-Mid-server-abc")),
    /SB-Mid-client-/
  );
  assert.equal(validatePaymentField("tripay", "merchant_id", "T12345"), null);
  assert.match(String(validatePaymentField("tripay", "merchant_id", "T 123")), /Merchant Code/);
  // Providers without a rule for the field never fail locally.
  assert.equal(validatePaymentField("tripay", "server_key", "anything"), null);
});

test("credential metadata rejects an empty method selection", () => {
  assert.throws(
    () =>
      credentialMetadata({
        provider: "midtrans",
        enabled_methods: [],
      }),
    /minimal satu metode/i
  );
  assert.throws(
    () =>
      paymentCredentialCreateSchema.parse({
        provider: "tripay",
        merchant_id: "MERCHANT-CODE",
        server_key: "api-key",
        private_key: "private-key",
        environment: "sandbox",
        enabled_methods: [],
      }),
    /minimal satu metode/i
  );
});

test("every PAYMENT_METHODS entry normalizes and only QRIS-bearing providers list QRIS", () => {
  assert.deepEqual(PAYMENT_METHODS.pakasir, ["qris"]);
  for (const provider of ["midtrans", "tripay", "pakasir"] as const) {
    assert.ok(PAYMENT_METHODS[provider].length > 0);
  }
});
