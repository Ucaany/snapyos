import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute, parseUuidParam } from "@/lib/api-route";
import { deleteTemplateCategory } from "@/server/admin";

/** DELETE /api/v1/admin/template-categories/:id — hapus kategori (docs/10 §10.2). */
export const DELETE = adminRawRoute<{ id: string }>(async ({ params }) => {
  const id = parseUuidParam(params.id, "id");
  return NextResponse.json(dataEnvelope(await deleteTemplateCategory(id)));
});
