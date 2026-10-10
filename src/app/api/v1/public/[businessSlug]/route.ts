import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { ApiError } from "@/lib/api-errors";
import { getPublicConfig } from "@/server/public-config";

type Params = { params: Promise<{ businessSlug: string }> };

/** GET /api/v1/public/:businessSlug?photobox=<slug> (docs/08 §8.14).
 *  Mendukung If-None-Match → 304 (poll kiosk 3s tak mengirim body bila config
 *  tak berubah). ETag derivatif dari hash config (tanpa biaya hashing tambahan). */
export async function GET(request: Request, { params }: Params) {
  try {
    const { businessSlug } = await params;
    const photoboxSlug = new URL(request.url).searchParams.get("photobox");
    if (!photoboxSlug) {
      throw new ApiError("VALIDATION_ERROR", "Parameter photobox wajib diisi");
    }
    const config = await getPublicConfig(businessSlug, photoboxSlug);
    const etag = `W/"${config.etag}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }
    return NextResponse.json(dataEnvelope(config), {
      headers: {
        ETag: etag,
        // Kiosk tetap revalidate tiap poll (ETag menentukan 304 vs body baru);
        // no-store agar tak ada cache perantara yang menyajikan config basi.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
