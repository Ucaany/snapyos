import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse, searchParamsToObject } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { getPaymentStatus } from "@/server/payment/checkout";
import { paymentStatusQuerySchema } from "@/lib/validators";

type Params = { params: Promise<{ businessSlug: string; paymentRef: string }> };

/** GET /api/v1/public/:businessSlug/payments/:paymentRef/status — recover saat reload (docs/06 §6.8). */
export async function GET(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`paystatus:${ip}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan. Coba lagi nanti.", details: { retry_after: rl.retryAfterSec } } },
        { status: 429 }
      );
    }

    const { businessSlug, paymentRef } = await params;
    const { device_token } = paymentStatusQuerySchema.parse(searchParamsToObject(request));
    return NextResponse.json(
      dataEnvelope(await getPaymentStatus(businessSlug, paymentRef, device_token))
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
