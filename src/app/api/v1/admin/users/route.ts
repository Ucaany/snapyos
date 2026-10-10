import { NextResponse } from "next/server";
import { ApiError, dataEnvelope, listEnvelope } from "@/lib/api-errors";
import { adminRawRoute, searchParamsToObject } from "@/lib/api-route";
import { createUser, listUsers } from "@/server/admin";

/** GET /api/v1/admin/users?search=&page=&limit= — docs/08 §8.15, docs/10 §10.2. */
export const GET = adminRawRoute(async ({ request }) => {
  const q = searchParamsToObject(request);
  const page = Number.parseInt(q.page ?? "1", 10);
  const limit = Number.parseInt(q.limit ?? "20", 10);
  const { items, total } = await listUsers({
    search: q.search,
    page: Number.isFinite(page) ? page : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  return NextResponse.json(listEnvelope(items, page || 1, limit || 20, total));
});

/**
 * POST /api/v1/admin/users — buat user langsung (admin CEO).
 * Body: { name, email, password, role? } — mirror createUserAction.
 */
export const POST = adminRawRoute(async ({ request }) => {
  const body = (await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  })) as { name?: unknown; email?: unknown; password?: unknown; role?: unknown };
  return NextResponse.json(
    dataEnvelope(
      await createUser({
        name: typeof body.name === "string" ? body.name : "",
        email: typeof body.email === "string" ? body.email : "",
        password: typeof body.password === "string" ? body.password : "",
        role: body.role === "admin" ? "admin" : "user",
      })
    ),
    { status: 201 }
  );
});
