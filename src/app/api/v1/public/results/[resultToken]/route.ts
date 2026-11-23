import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { getResult } from "@/server/kiosk-sessions";

type Params = { params: Promise<{ resultToken: string }> };

/** GET /api/v1/public/results/:resultToken (docs/08 §8.14). */
export async function GET(request: Request, { params }: Params) {
  try {
    // Token = kapabilitas bearer (12 base36 ≈ 62 bit, token lama 32 hex = 128
    // bit): rate-limit per IP agar tidak bisa di-scrape (enumerasi token).
    // 60 req/60s per IP, idiom sama dgn route public lain (sessions/route.ts).
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`result:${ip}`, 60, 60_000);
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

    const { resultToken } = await params;
    const tokenKey = createHash("sha256").update(resultToken).digest("hex").slice(0, 24);
    const tokenRl = await rateLimit(`result-token:${tokenKey}`, 120, 60_000);
    if (!tokenRl.ok) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Terlalu banyak permintaan untuk hasil ini. Coba lagi nanti.",
            details: { retry_after: tokenRl.retryAfterSec },
          },
        },
        { status: 429, headers: { "Retry-After": String(tokenRl.retryAfterSec) } }
      );
    }
    return NextResponse.json(dataEnvelope(await getResult(resultToken)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
