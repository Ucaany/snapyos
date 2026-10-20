/**
 * Regression: handlePakasirWebhook verifikasi status paid harus memakai
 * credential owner (project langsung) bila payments.credential_id ter-set,
 * bukan aggregator env platform (PAKASIR_API_KEY/PAKASIR_PROJECT_SLUG).
 * Sebelum fix, webhook selalu hit pakasirProvider (env platform) → mismatch
 * untuk payment yang dibuat via credential owner.
 * verifyPakasirPaid diekstrak ke pakasir-utils (pure) agar testable tanpa
 * runtime Next/supabase.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createPakasirGateway } from "../src/server/payment/providers/pakasir.ts";
import {
  verifyPakasirPaid,
  resolvePakasirExpectedSecret,
  isWebhookEventFresh,
  verifyPakasirWebhookSecret,
} from "../src/server/payment/pakasir-utils.ts";
import { parseProviderDateTime } from "../src/lib/qris-helpers.ts";
import type { GatewayCredential } from "../src/server/payment/providers/types.ts";

const OWNER_CREDENTIAL: GatewayCredential = {
  id: "cred-owner",
  provider: "pakasir",
  merchantId: "owner-project",
  serverKey: "sk-owner",
  clientKey: null,
  environment: "sandbox",
  metadata: {},
};

/** Stub fetch yang menangkap URL + membalas status transaksi (v2 root-level status). */
function stubFetch(status: string, captured: { url: string; apiKey?: string }, amount = 50000) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    captured.url = String(input);
    captured.apiKey = (init?.headers as Record<string, string> | undefined)?.["X-Api-Key"] ?? "";
    // `total_payment` disertakan agar verifikasi amount server-to-server lolos
    // (getStatus menolak "paid" bila nominal provider tak cocok).
    return new Response(JSON.stringify({ status, total_payment: amount }));
  }) as typeof fetch;
  return orig;
}

test("verifyPakasirPaid: credential owner dipakai, aggregator TIDAK dipanggil, api_key owner", async () => {
  const gateway = createPakasirGateway(OWNER_CREDENTIAL);
  let aggregatorCalled = false;
  const captured: { url: string; apiKey?: string } = { url: "" };
  const orig = stubFetch("completed", captured);
  try {
    const ok = await verifyPakasirPaid(
      { credential_id: "cred-owner", order_id: "SnapyOS-OWNER01", final_amount: 50000 },
      {
        byCredential: async (id) => (id === "cred-owner" ? gateway : null),
        aggregator: () => {
          aggregatorCalled = true;
          throw new Error("aggregator tidak boleh dipakai untuk payment credential owner");
        },
      }
    );
    assert.equal(ok, true);
    assert.equal(aggregatorCalled, false);
    assert.match(captured.url, /\/api\/v2\/transaction-status\/owner-project\//);
    assert.equal(captured.apiKey, "sk-owner");
  } finally {
    globalThis.fetch = orig;
  }
});

test("verifyPakasirPaid: credential_id null → aggregator env platform (backward compat)", async () => {
  const previousApiKey = process.env.PAKASIR_API_KEY;
  const previousProject = process.env.PAKASIR_PROJECT_SLUG;
  process.env.PAKASIR_API_KEY = "sk-platform";
  process.env.PAKASIR_PROJECT_SLUG = "platform-project";
  const captured: { url: string; apiKey?: string } = { url: "" };
  const orig = stubFetch("completed", captured);
  try {
    const ok = await verifyPakasirPaid(
      { credential_id: null, order_id: "SnapyOS-AGG01", final_amount: 50000 },
      {
        byCredential: async () => {
          throw new Error("byCredential tidak boleh dipanggil untuk payment aggregator");
        },
        aggregator: () => createPakasirGateway(null),
      }
    );
    assert.equal(ok, true);
    assert.match(captured.url, /\/api\/v2\/transaction-status\/platform-project\//);
    assert.equal(captured.apiKey, "sk-platform");
  } finally {
    globalThis.fetch = orig;
    if (previousApiKey === undefined) delete process.env.PAKASIR_API_KEY;
    else process.env.PAKASIR_API_KEY = previousApiKey;
    if (previousProject === undefined) delete process.env.PAKASIR_PROJECT_SLUG;
    else process.env.PAKASIR_PROJECT_SLUG = previousProject;
  }
});

test("verifyPakasirPaid: credential_id ter-set tapi row hilang → false (fail-closed), aggregator tidak dipanggil", async () => {
  let aggregatorCalled = false;
  const ok = await verifyPakasirPaid(
    { credential_id: "cred-deleted", order_id: "SnapyOS-OWNER02", final_amount: 50000 },
    {
      byCredential: async () => null,
      aggregator: () => {
        aggregatorCalled = true;
        throw new Error("aggregator tidak boleh fallback untuk credential yang hilang");
      },
    }
  );
  assert.equal(ok, false);
  assert.equal(aggregatorCalled, false);
});

test("verifyPakasirPaid: status provider belum paid → false", async () => {
  const gateway = createPakasirGateway(OWNER_CREDENTIAL);
  const captured = { url: "" };
  const orig = stubFetch("PENDING", captured);
  try {
    const ok = await verifyPakasirPaid(
      { credential_id: "cred-owner", order_id: "SnapyOS-OWNER03", final_amount: 50000 },
      { byCredential: async () => gateway, aggregator: () => gateway }
    );
    assert.equal(ok, false);
  } finally {
    globalThis.fetch = orig;
  }
});

test("verifyPakasirPaid: paid tapi nominal provider beda → false (amount S2S diverifikasi)", async () => {
  const gateway = createPakasirGateway(OWNER_CREDENTIAL);
  const captured = { url: "" };
  // Provider bilang completed tapi total_payment != final_amount → TOLAK.
  const orig = stubFetch("completed", captured, 99999);
  try {
    const ok = await verifyPakasirPaid(
      { credential_id: "cred-owner", order_id: "SnapyOS-OWNER04", final_amount: 50000 },
      { byCredential: async () => gateway, aggregator: () => gateway }
    );
    assert.equal(ok, false);
  } finally {
    globalThis.fetch = orig;
  }
});

// ---------------------------------------------------------------------------
// C2/H2 — secret per-credential wajib; tenant TIDAK fallback ke secret global.
// ---------------------------------------------------------------------------

test("C2/H2: order tenant tanpa secret per-credential → REJECT (no global fallback)", () => {
  const r = resolvePakasirExpectedSecret({
    hasCredential: true,
    secret: null,
    globalSecret: "platform-global-secret",
  });
  assert.equal(r.reject, true, "tenant tanpa secret harus ditolak");
});

test("C2/H2: order tenant dengan secret per-credential → pakai secret itu", () => {
  const r = resolvePakasirExpectedSecret({
    hasCredential: true,
    secret: "tenant-secret",
    globalSecret: "platform-global-secret",
  });
  assert.equal(r.reject, false);
  assert.equal(r.expected, "tenant-secret", "tidak boleh pakai secret platform");
});

test("C2/H2: order non-tenant (aggregator/invoice) → pakai secret global", () => {
  const r = resolvePakasirExpectedSecret({
    hasCredential: false,
    secret: null,
    globalSecret: "platform-global-secret",
  });
  assert.equal(r.reject, false);
  assert.equal(r.expected, "platform-global-secret");
});

// ---------------------------------------------------------------------------
// H2 — freshness: tolak webhook di luar jendela (replay / clock skew).
// ---------------------------------------------------------------------------

test("H2: payment_date dalam jendela → fresh", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  assert.equal(isWebhookEventFresh("2026-10-08 11:00:00", now, parseProviderDateTime), true);
});

test("H2: payment_date terlalu lama (>24 jam) → STALE (ditolak)", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  assert.equal(isWebhookEventFresh("2026-10-06 11:00:00", now, parseProviderDateTime), false);
});

test("H2: payment_date di masa depan jauh (clock skew) → STALE", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  assert.equal(isWebhookEventFresh("2026-10-11 12:00:00", now, parseProviderDateTime), false);
});

test("H2: payment_date null / tak terparse → lewat (S2S tetap gate utama)", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  assert.equal(isWebhookEventFresh(null, now, parseProviderDateTime), true);
  assert.equal(isWebhookEventFresh("bukan-tanggal", now, parseProviderDateTime), true);
});

test("verifyPakasirWebhookSecret: cocok → true, beda → false, kosong → fail-closed", () => {
  assert.equal(verifyPakasirWebhookSecret("s3cret", "s3cret"), true);
  assert.equal(verifyPakasirWebhookSecret("s3cret ", "s3cret"), true, "trim diizinkan");
  assert.equal(verifyPakasirWebhookSecret("wrong", "s3cret"), false);
  assert.equal(verifyPakasirWebhookSecret("s3cret", "s3cre"), false, "panjang beda → false");
  // Fail-closed: expected atau received kosong.
  assert.equal(verifyPakasirWebhookSecret("s3cret", ""), false);
  assert.equal(verifyPakasirWebhookSecret("s3cret", null), false);
  assert.equal(verifyPakasirWebhookSecret("", "s3cret"), false);
  assert.equal(verifyPakasirWebhookSecret(null, null), false);
});
