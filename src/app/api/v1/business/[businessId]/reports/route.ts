import { NextResponse } from "next/server";
import { authRawRoute, parseUuidParam, searchParamsToObject } from "@/lib/api-route";
import { generateReport } from "@/server/reports";

/** GET /api/v1/business/:businessId/reports?type=&from=&to=&format= (docs/08 §8.9). */
export const GET = authRawRoute<{ businessId: string }>(async ({ user, request, params }) => {
  const businessId = parseUuidParam(params.businessId, "businessId");
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
