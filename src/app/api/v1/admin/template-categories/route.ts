import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute } from "@/lib/api-route";
import { createTemplateCategory, listTemplateCategories } from "@/server/admin";

/**
 * GET /api/v1/admin/template-categories — list kategori template global
 * (docs/10 §10.2). Kategori dipakai admin sebagai FK di templates.category_id
 * (migration 0039).
 */
export const GET = adminRawRoute(async () => {
  return NextResponse.json(dataEnvelope(await listTemplateCategories()));
});

/**
 * POST /api/v1/admin/template-categories — buat kategori.
 * Body: { name: string (2-60 char) }
 */
export const POST = adminRawRoute(async ({ request }) => {
  const body = (await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  })) as { name?: unknown; price?: unknown };
  if (typeof body.name !== "string") {
    throw new ApiError("VALIDATION_ERROR", "Field `name` (string) wajib");
  }
  const price =
    body.price === undefined || body.price === null
      ? null
      : typeof body.price === "number"
        ? body.price
        : (() => {
            throw new ApiError("VALIDATION_ERROR", "Field `price` harus number/null");
          })();
  return NextResponse.json(dataEnvelope(await createTemplateCategory({ name: body.name, price })), {
    status: 201,
  });
});
