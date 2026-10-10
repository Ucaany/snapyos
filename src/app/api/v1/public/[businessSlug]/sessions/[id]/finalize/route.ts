import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { parseUuidParam, toErrorResponse } from "@/lib/api-route";
import { finalizeSession } from "@/server/kiosk-sessions";
import { sessionFinalizeSchema } from "@/lib/validators";

type Params = { params: Promise<{ businessSlug: string; id: string }> };

type PhotoFile = {
  name?: string | null;
  type?: string | null;
  size?: number | null;
  arrayBuffer(): Promise<ArrayBuffer>;
};

/** POST /api/v1/public/:businessSlug/sessions/:id/finalize (docs/08 §8.14). */
export async function POST(request: Request, { params }: Params) {
  try {
    const { businessSlug, id: idRaw } = await params;
    // businessSlug bukan UUID (slug string) — validasi via downstream lookup.
    // session id WAJIB UUID: non-UUID → 404 (defense-in-depth sebelum query DB).
    const id = parseUuidParam(idRaw, "id");

    const form = await request.formData();
    const deviceToken = String(form.get("device_token") ?? "");
    const retakeRaw = String(form.get("retake_count") ?? "");
    const templateRaw = String(form.get("template_id") ?? "");

    const input = sessionFinalizeSchema.parse({
      device_token: deviceToken,
      retake_count: retakeRaw === "" ? undefined : Number(retakeRaw),
      template_id: templateRaw === "" ? null : templateRaw,
    });

    const photos: PhotoFile[] = form
      .getAll("photos")
      .filter((f): f is File => f instanceof File);

    return NextResponse.json(dataEnvelope(await finalizeSession(businessSlug, id, input, photos)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
