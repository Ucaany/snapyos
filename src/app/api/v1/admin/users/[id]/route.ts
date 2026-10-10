import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, parseUuidParam } from "@/lib/api-route";
import { deleteUser, getUserDetail, updateUser } from "@/server/admin";

/** GET /api/v1/admin/users/:id — detail user + riwayat (mirror halaman admin). */
export const GET = adminRawRoute<{ id: string }>(async ({ params }) => {
  const id = parseUuidParam(params.id, "id");
  return NextResponse.json(dataEnvelope(await getUserDetail(id)));
});

/** PATCH /api/v1/admin/users/:id — suspend/reactivate, ubah role (docs/10 §10.2). */
export const PATCH = adminRawRoute<{ id: string }>(async ({ request, params }) => {
  const id = parseUuidParam(params.id, "id");
  const body = await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  });
  return NextResponse.json(dataEnvelope(await updateUser(id, body)));
});

/**
 * DELETE /api/v1/admin/users/:id — hard delete user (docs/10 §10.2).
 * Ditolak (409) bila user masih terkait business (FK restrict).
 */
export const DELETE = adminRawRoute<{ id: string }>(async ({ params }) => {
  const id = parseUuidParam(params.id, "id");
  await deleteUser(id);
  return NextResponse.json(dataEnvelope({ id, deleted: true }));
});
