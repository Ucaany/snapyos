import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { heartbeatDevice } from "@/server/devices";
import { deviceHeartbeatSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const rl = await rateLimit(`device-heartbeat:${getClientIp(request.headers)}`, 30, 60_000);
    if (!rl.ok) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan.", details: { retry_after: rl.retryAfterSec } } }, { status: 429 });
    const input = deviceHeartbeatSchema.parse(await request.json());
    return NextResponse.json(dataEnvelope(await heartbeatDevice(input)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
