import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse, searchParamsToObject } from "@/lib/api-route";
import { rateLimit, rateLimitByDevice } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { getPaymentStatus } from "@/server/payment/checkout";
import { paymentStatusQuerySchema } from "@/lib/validators";

type Params = { params: Promise<{ businessSlug: string; paymentRef: string }> };

/** GET /api/v1/public/:businessSlug/payments/:paymentRef/status — recover saat reload (docs/06 §6.8). */
export async function GET(request: Request, { params }: Params) {
  try {
    const { businessSlug, paymentRef } = await params;
    // Token device lewat header (bukan query string) supaya tidak ikut tercatat
    // di access log nginx/CDN. Bentuk query dipertahankan sebagai fallback
    // untuk kiosk versi lama.
    const { device_token } = paymentStatusQuerySchema.parse({
      device_token:
        request.headers.get("x-device-token")?.trim() || searchParamsToObject(request).device_token,
    });
    const ip = getClientIp(request.headers);
    // Kiosk poll 3 detik = 20 req/menit/booth. Batas IP harus longgar supaya
    // beberapa booth di satu NAT tidak saling mengunci; batas per device yang
    // menahan booth tunggal yang kebablasan.
    const rl = await rateLimit(`paystatus:${ip}`, 600, 60_000);
    const deviceRl = await rateLimitByDevice("paystatus", device_token, 120, 60_000);
    if (!rl.ok || (deviceRl && !deviceRl.ok)) {
      const retryAfter = !rl.ok ? rl.retryAfterSec : (deviceRl?.retryAfterSec ?? 0);
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Terlalu banyak permintaan. Coba lagi nanti.",
            details: { retry_after: retryAfter },
          },
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      dataEnvelope(await getPaymentStatus(businessSlug, paymentRef, device_token))
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
