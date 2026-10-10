import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute } from "@/lib/api-route";
import { getPlatformSettings, updatePlatformSettings } from "@/server/admin";

/** GET /api/v1/admin/settings — platform settings (docs/10 §10.4). */
export const GET = adminRawRoute(async () => {
  return NextResponse.json(dataEnvelope(await getPlatformSettings()));
});

/** PATCH /api/v1/admin/settings — update key whitelist (docs/10 §10.4). */
export const PATCH = adminRawRoute(async ({ request }) => {
  const body = await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  });
  return NextResponse.json(dataEnvelope(await updatePlatformSettings(body)));
});
