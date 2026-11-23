import { NextResponse } from "next/server";
import { ApiError, authRawRoute, parseUuidParam, searchParamsToObject } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { generateReport } from "@/server/reports";

/** GET /api/v1/business/:businessId/reports?type=&from=&to=&format= (docs/08 §8.9). */
export const GET = authRawRoute<{ businessId: string }>(async ({ user, request, params }) => {
  const businessId = parseUuidParam(params.businessId, "businessId");
  const limit = await rateLimit(`owner-report:${user.id}:${businessId}`, 6, 60_000);
  if (!limit.ok) {
    throw new ApiError("RATE_LIMITED", "Terlalu banyak export. Coba lagi sebentar.", {
      retry_after: [String(limit.retryAfterSec)],
    });
  }
  const result = await generateReport(user.id, businessId, searchParamsToObject(request));
  const body = typeof result.body === "string" ? result.body : new Uint8Array(result.body);
  return new NextResponse(body, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
