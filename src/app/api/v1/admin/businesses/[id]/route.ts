import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, parseUuidParam } from "@/lib/api-route";
import { deleteBusiness, getBusinessUsage, updateBusiness } from "@/server/admin";

/** GET /api/v1/admin/businesses/:id — usage outlet/booth/sesi/transaksi (docs/10 §10.2). */
export const GET = adminRawRoute<{ id: string }>(async ({ params }) => {
  const id = parseUuidParam(params.id, "id");
  return NextResponse.json(dataEnvelope(await getBusinessUsage(id)));
});

/** PATCH /api/v1/admin/businesses/:id — suspend/reactivate (docs/10 §10.2). */
export const PATCH = adminRawRoute<{ id: string }>(async ({ request, params }) => {
  const id = parseUuidParam(params.id, "id");
  const body = await request.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Body JSON wajib");
  });
  return NextResponse.json(dataEnvelope(await updateBusiness(id, body)));
});

/**
 * DELETE /api/v1/admin/businesses/:id — hapus business + seluruh object
 * storage terkait (docs/10 §10.2). Storage disapu dulu, lalu baris DB
 * (cascade). Bila storage gagal sebagian → 500, retry aman (idempotent).
 */
export const DELETE = adminRawRoute<{ id: string }>(async ({ params }) => {
  const id = parseUuidParam(params.id, "id");
  return NextResponse.json(dataEnvelope(await deleteBusiness(id)));
});
