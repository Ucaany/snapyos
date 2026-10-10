import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { activateDevice } from "@/server/devices";
import { deviceActivateSchema } from "@/lib/validators";

/** POST /api/v1/public/devices/activate — brute-force guard (docs/09 §9). */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`activate:${ip}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Terlalu banyak percobaan. Coba lagi nanti.", details: {} } },
        { status: 429 }
      );
    }

    const input = deviceActivateSchema.parse(await request.json());
    return NextResponse.json(dataEnvelope(await activateDevice(input)), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
