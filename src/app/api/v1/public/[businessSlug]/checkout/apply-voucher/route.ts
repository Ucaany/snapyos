import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit, rateLimitByDevice } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { applyVoucherToCheckout } from "@/server/payment/checkout";
import { checkoutApplyVoucherSchema } from "@/lib/validators";

type Params = { params: Promise<{ businessSlug: string }> };

/** POST /api/v1/public/:businessSlug/checkout/apply-voucher — validasi server-side (docs/06 §6.2). */
export async function POST(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`voucher:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Terlalu banyak permintaan. Coba lagi nanti.",
            details: { retry_after: rl.retryAfterSec },
          },
        },
        { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
      );
    }

    const { businessSlug } = await params;
    const input = checkoutApplyVoucherSchema.parse(await request.json());
    const deviceRl = await rateLimitByDevice("voucher", input.device_token, 20, 60_000);
    if (deviceRl && !deviceRl.ok) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Terlalu banyak permintaan. Coba lagi nanti.",
            details: { retry_after: deviceRl.retryAfterSec },
          },
        },
        { status: 429, headers: { "retry-after": String(deviceRl.retryAfterSec) } }
      );
    }
    return NextResponse.json(dataEnvelope(await applyVoucherToCheckout(businessSlug, input)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
