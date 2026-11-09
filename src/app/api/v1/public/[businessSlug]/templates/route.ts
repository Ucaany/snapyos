import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { listPublicTemplates, resolveBusinessIdBySlug } from "@/server/public-config";

type Params = { params: Promise<{ businessSlug: string }> };

/** GET /api/v1/public/:businessSlug/templates?package=<id> (docs/08 §8.14). */
export async function GET(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`templates:${ip}`, 120, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests" }, {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      });
    }

    const { businessSlug } = await params;
    const packageId = new URL(request.url).searchParams.get("package") ?? undefined;
    const businessId = await resolveBusinessIdBySlug(businessSlug);
    return NextResponse.json(dataEnvelope(await listPublicTemplates(businessId, packageId)), {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
