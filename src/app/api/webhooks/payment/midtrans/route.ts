import { NextResponse } from "next/server";
import { handleMidtransWebhook } from "@/server/payment/checkout";
import { rateLimit } from "@/lib/rate-limit";
import { redactSensitive } from "@/lib/error-redaction";
import { getClientIp } from "@/lib/request-ip";

/** Batas ukuran body webhook — payload gateway jauh di bawah ini. */
const MAX_WEBHOOK_BYTES = 64 * 1024;

/** Midtrans requires a quick acknowledgement; details stay in server webhook logs. */
export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`webhook:midtrans:${ip}`, 120, 60_000);
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

  try {
    const result = await handleMidtransWebhook(payload);
    // M3: verifikasi provider gagal (outage) → non-2xx agar provider retry.
    if (result && "retryable" in result && result.retryable) {
      return NextResponse.json({ received: false, ...result }, { status: 503 });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[webhook midtrans] unexpected error:", redactSensitive(error));
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
