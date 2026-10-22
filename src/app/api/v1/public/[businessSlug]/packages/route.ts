import { NextResponse } from "next/server";
import { dataEnvelope, ApiError } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { listPublicPackages, resolveBusinessAndPhotobox } from "@/server/public-config";

type Params = { params: Promise<{ businessSlug: string }> };

/** GET /api/v1/public/:businessSlug/packages?photobox=<slug> (docs/08 §8.14). */
export async function GET(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`packages:${ip}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests" }, {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      });
    }

    const { businessSlug } = await params;
    const photoboxSlug = new URL(request.url).searchParams.get("photobox");
    if (!photoboxSlug) {
      throw new ApiError("VALIDATION_ERROR", "Parameter photobox wajib diisi");
    }
    const { business, photobox } = await resolveBusinessAndPhotobox(businessSlug, photoboxSlug);
    const packages = await listPublicPackages(business.id, photobox.id, photobox.outlet_id);
    return NextResponse.json(dataEnvelope(packages));
  } catch (error) {
    return toErrorResponse(error);
  }
}
