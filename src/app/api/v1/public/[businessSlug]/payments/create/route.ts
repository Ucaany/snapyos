import { NextResponse } from "next/server"
import { dataEnvelope } from "@/lib/api-errors"
import { toErrorResponse } from "@/lib/api-route"
import { rateLimit, rateLimitByDevice } from "@/lib/rate-limit"
import { getClientIp } from "@/lib/request-ip"
import { paymentCreateSchema } from "@/lib/validators"
import { createPayment } from "@/server/payment/checkout"

type Params = { params: Promise<{ businessSlug: string }> }
export async function POST(request: Request, { params }: Params) {
  try {
    const { businessSlug } = await params
    const input = paymentCreateSchema.parse(await request.json())
    const ip = getClientIp(request.headers)
    const rl = await rateLimit(`payment-create:${ip}`, 20, 60_000)
    // Lapis kedua per device (booth) — limit IP tidak dilemahkan.
    const deviceRl = await rateLimitByDevice("payment-create", input.device_token, 20, 60_000)
    if (!rl.ok || (deviceRl && !deviceRl.ok)) {
      const retryAfter = !rl.ok ? rl.retryAfterSec : (deviceRl?.retryAfterSec ?? 0)
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Terlalu banyak permintaan. Coba lagi nanti.",
            details: { retry_after: retryAfter },
          },
        },
        { status: 429 }
      )
    }
    return NextResponse.json(
      dataEnvelope(await createPayment(businessSlug, input)),
      { status: 201 }
    )
  } catch (error) {
    return toErrorResponse(error)
  }
}
