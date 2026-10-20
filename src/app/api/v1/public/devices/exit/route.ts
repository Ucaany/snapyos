import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { verifyDeviceExit } from "@/server/devices";
import { deviceExitSchema } from "@/lib/validators";

/** POST /api/v1/public/devices/exit — PIN petugas untuk keluar mode kiosk (docs/05 §5.0). */
export async function POST(request: Request) {
  try {
    // Endpoint verifikasi PIN: limit per IP dulu (tanpa baca body) agar argon2
    // dan lock per-booth tidak bisa dipakai sebagai amplifikasi.
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`device-exit:${ip}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Terlalu banyak percobaan. Coba lagi nanti.",
            details: { retry_after: rl.retryAfterSec },
          },
        },
        { status: 429 }
      );
    }

    const input = deviceExitSchema.parse(await request.json());
    return NextResponse.json(dataEnvelope(await verifyDeviceExit(input)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
