import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { listPublicTemplates, resolveBusinessIdBySlug } from "@/server/public-config";

type Params = { params: Promise<{ businessSlug: string }> };

/** GET /api/v1/public/:businessSlug/templates (docs/08 §8.14).
 *  `?package=<id>` masih diterima agar klien lama tidak error, tetapi diabaikan:
 *  semua template aktif tampil untuk semua paket (2026-11-11). */
export async function GET(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`templates:${ip}`, 120, 60_000, { failOpen: true });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        }
      );
    }

    const { businessSlug } = await params;
    const businessId = await resolveBusinessIdBySlug(businessSlug);
    return NextResponse.json(dataEnvelope(await listPublicTemplates(businessId)), {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
