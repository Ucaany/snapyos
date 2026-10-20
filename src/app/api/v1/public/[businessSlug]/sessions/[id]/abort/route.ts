import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { parseUuidParam, toErrorResponse } from "@/lib/api-route";
import { abortSession } from "@/server/kiosk-sessions";
import { sessionAbortSchema } from "@/lib/validators";
import { rateLimit, rateLimitByDevice } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

async function enforceAbortRateLimit(request: Request, deviceToken: string) {
  const ip = getClientIp(request.headers);
  const ipLimit = await rateLimit(`session-abort:${ip}`, 20, 60_000);
  if (!ipLimit.ok) return ipLimit;
  return rateLimitByDevice("session-abort", deviceToken, 20, 60_000);
}

function rateLimited(retryAfterSec: number) {
  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Terlalu banyak permintaan. Coba lagi nanti.",
        details: { retry_after: retryAfterSec },
      },
    },
    { status: 429, headers: { "retry-after": String(retryAfterSec) } }
  );
}

function parseDeviceToken(requestBody: unknown) {
  return sessionAbortSchema.parse(requestBody);
}

/** POST /api/v1/public/:businessSlug/sessions/:id/abort — kiosk buang sesi aktifnya sendiri. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessSlug: string; id: string }> }
) {
  try {
    const { businessSlug, id: idRaw } = await params;
    // businessSlug bukan UUID (slug string) — validasi via downstream lookup.
    // session id WAJIB UUID: non-UUID → 404 sebelum menyentuh DB (paritas finalize).
    const id = parseUuidParam(idRaw, "id");
    const input = parseDeviceToken(await request.json());
    const limited = await enforceAbortRateLimit(request, input.device_token);
    if (limited && !limited.ok) return rateLimited(limited.retryAfterSec);
    return NextResponse.json(dataEnvelope(await abortSession(businessSlug, id, input)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
