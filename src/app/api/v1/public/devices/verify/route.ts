import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { verifyDevice } from "@/server/devices";
import { deviceVerifySchema } from "@/lib/validators";

/** POST /api/v1/public/devices/verify (docs/08 §8.14). */
export async function POST(request: Request) {
  try {
    // Token device = bearer; limit per IP agar tidak bisa di-hammer untuk
    // enumerasi token / DoS lookup device.
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`device-verify:${ip}`, 30, 60_000);
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

    const input = deviceVerifySchema.parse(await request.json());
    return NextResponse.json(dataEnvelope(await verifyDevice(input)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
