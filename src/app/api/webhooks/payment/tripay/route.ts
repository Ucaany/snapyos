import { NextResponse } from "next/server";
import { handleTripayWebhook } from "@/server/payment/checkout";
import { rateLimit } from "@/lib/rate-limit";
import { redactSensitive } from "@/lib/error-redaction";
import { getClientIp } from "@/lib/request-ip";

/** Batas ukuran body webhook — payload gateway jauh di bawah ini. */
const MAX_WEBHOOK_BYTES = 64 * 1024;

/** Read exact bytes as text: Tripay signs the original JSON body, not parsed JSON. */
export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`webhook:tripay:${ip}`, 120, 60_000);
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
  const rawBody = await request.text();
  if (rawBody.length > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ received: false }, { status: 413 });
  }

  try {
    const result = await handleTripayWebhook(rawBody, request.headers.get("x-callback-signature"));
    // M3: verifikasi provider gagal (outage) → non-2xx agar provider retry.
    if (result && "retryable" in result && result.retryable) {
      return NextResponse.json({ received: false, ...result }, { status: 503 });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[webhook tripay] unexpected error:", redactSensitive(error));
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
