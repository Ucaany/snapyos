import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-errors";
import { handlePakasirWebhook, pakasirWebhookSecretResolution } from "@/server/payment/checkout";
import { verifyPakasirWebhookSecret, resolvePakasirExpectedSecret } from "@/server/payment/pakasir-utils";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

/** Batas ukuran body webhook — payload gateway jauh di bawah ini. */
const MAX_WEBHOOK_BYTES = 64 * 1024;

/**
 * POST /api/webhooks/payment/pakasir — https://pakasir.com/p/webhook (v2).
 * Verifikasi header X-Secret (webhook secret v2):
 * - order_id milik credential owner → secret terenkripsi di credential metadata;
 *   credential TANPA secret per-credential → 401 (tanpa fallback global, C2/H2).
 * - selain itu (aggregator/invoice platform) → env PAKASIR_WEBHOOK_SECRET.
 * Fail-closed: secret tidak dikenal → 401.
 * Validation/idempotency errors → 200 (agar provider berhenti mengulang).
 * Internal exceptions → 500 (agar provider retry — data mungkin belum ter-settle).
 */
export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`webhook:pakasir:${ip}`, 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { received: false },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ received: false }, { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ received: false }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }
  if (payload === null || typeof payload !== "object") {
    return NextResponse.json({ received: false }, { status: 400 });
  }
  const orderId =
    typeof (payload as Record<string, unknown>).order_id === "string"
      ? ((payload as Record<string, unknown>).order_id as string).trim()
      : "";
  const receivedSecret = request.headers.get("x-secret")?.trim() ?? "";
  const resolution = orderId
    ? await pakasirWebhookSecretResolution(orderId)
    : { hasCredential: false, secret: null };
  // C2/H2: order tenant WAJIB punya secret per-credential (tanpa fallback global).
  const { reject, expected } = resolvePakasirExpectedSecret({
    hasCredential: resolution.hasCredential,
    secret: resolution.secret,
    globalSecret: process.env.PAKASIR_WEBHOOK_SECRET,
  });
  if (reject || !verifyPakasirWebhookSecret(receivedSecret, expected)) {
    // Fail-closed: tolak webhook tanpa secret yang valid.
    return NextResponse.json({ received: false }, { status: 401 });
  }
  try {
    const result = await handlePakasirWebhook(payload);
    // M3: verify provider gagal (outage) → non-2xx agar provider retry, bukan 200.
    if ("retryable" in result && result.retryable) {
      return NextResponse.json({ received: false, ...result }, { status: 503 });
    }
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ received: false }, { status: 200 });
    }
    console.error("[webhook pakasir] unexpected error:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
