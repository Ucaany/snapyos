import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { listPublicTemplates, resolveBusinessIdBySlug } from "@/server/public-config";

type Params = { params: Promise<{ businessSlug: string }> };

/** GET /api/v1/public/:businessSlug/templates?package=<id> (docs/08 §8.14). */
export async function GET(request: Request, { params }: Params) {
  try {
    const { businessSlug } = await params;
    const packageId = new URL(request.url).searchParams.get("package") ?? undefined;
    const businessId = await resolveBusinessIdBySlug(businessSlug);
    return NextResponse.json(dataEnvelope(await listPublicTemplates(businessId, packageId)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
