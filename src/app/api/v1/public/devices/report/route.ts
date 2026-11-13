import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { reportDevice } from "@/server/devices";
import { deviceReportSchema } from "@/lib/validators";

/** POST /api/v1/public/devices/report — setup wizard laporkan status (docs/05 §5.0.1). */
export async function POST(request: Request) {
  try {
    // Setiap request menulis 2 baris (photoboxes + devices). Limit per IP agar
    // bearer token yang bocor tidak bisa dipakai membanjiri write/heartbeat.
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`device-report:${ip}`, 30, 60_000, { failOpen: true });
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

    const input = deviceReportSchema.parse(await request.json());
    return NextResponse.json(dataEnvelope(await reportDevice(input)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
