import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit, rateLimitByDevice } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { createSession } from "@/server/kiosk-sessions";
import { sessionCreateSchema } from "@/lib/validators";

type Params = { params: Promise<{ businessSlug: string }> };

/** POST /api/v1/public/:businessSlug/sessions (docs/08 §8.14, pay-first). */
export async function POST(request: Request, { params }: Params) {
  try {
    const { businessSlug } = await params;

    // Limit IP dulu (murah, tanpa baca body) — jangan longgar untuk body cacat.
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`session:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Terlalu banyak permintaan. Coba lagi nanti.",
            details: { retry_after: rl.retryAfterSec },
          },
        },
        { status: 429 }
      );
    }

    const input = sessionCreateSchema.parse(await request.json());

    // Lapis kedua per device (booth) — banyak booth di belakang satu NAT tidak
    // saling menstarvasi; limit IP tetap berlaku.
    const deviceRl = await rateLimitByDevice("session", input.device_token, 30, 60_000);
    if (deviceRl && !deviceRl.ok) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Terlalu banyak permintaan. Coba lagi nanti.",
            details: { retry_after: deviceRl.retryAfterSec },
          },
        },
        { status: 429 }
      );
    }

    return NextResponse.json(dataEnvelope(await createSession(businessSlug, input)), {
      status: 201,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
