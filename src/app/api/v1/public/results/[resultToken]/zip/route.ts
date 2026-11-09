import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { getResult } from "@/server/kiosk-sessions";
import { createZip, withinZipLimits, ZIP_MAX_BYTES, ZIP_MAX_FILES } from "@/lib/zip";

type Params = { params: Promise<{ resultToken: string }> };

/**
 * GET /api/v1/public/results/:resultToken/zip — unduh semua foto + GIF.
 *
 * Token = kapabilitas bearer, jadi rate limit per IP mencegah penyalahgunaan.
 * Batas 50 berkas / 100 MB menjaga memori server; store-only membuat ukuran
 * ZIP mendekati jumlah byte sumber.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`result-zip:${ip}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Terlalu banyak unduhan. Coba lagi nanti.",
            details: { retry_after: rl.retryAfterSec },
          },
        },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const { resultToken } = await params;
    const result = await getResult(resultToken);
    const sources = [
      ...(result.gif_download_url || result.gif_url
        ? [{ name: "snapyos-slideshow.gif", url: result.gif_download_url ?? result.gif_url! }]
        : []),
      ...result.photos
        .filter((photo) => photo.download_url || photo.url)
        .map((photo, index) => ({
          name: `snapyos-${index + 1}.jpg`,
          url: (photo.download_url ?? photo.url)!,
        })),
    ];
    if (sources.length === 0) {
      throw new ApiError("NOT_FOUND", "Foto belum tersedia");
    }
    if (sources.length > ZIP_MAX_FILES) {
      throw new ApiError("VALIDATION_ERROR", `Maksimal ${ZIP_MAX_FILES} berkas per unduhan.`);
    }

    const files: { name: string; data: Uint8Array }[] = [];
    let total = 0;
    for (const source of sources) {
      const response = await fetch(source.url, { cache: "no-store" });
      if (!response.ok) {
        throw new ApiError("INTERNAL", "Sebagian foto tidak bisa diunduh. Coba lagi.");
      }
      const buffer = new Uint8Array(await response.arrayBuffer());
      total += buffer.byteLength;
      if (total > ZIP_MAX_BYTES) {
        throw new ApiError("VALIDATION_ERROR", "Ukuran unduhan melebihi 100 MB.");
      }
      files.push({ name: source.name, data: buffer });
    }
    if (!withinZipLimits(files.length, total)) {
      throw new ApiError("VALIDATION_ERROR", "Berkas unduhan tidak valid.");
    }

    const zip = createZip(files);
    return new NextResponse(new Blob([zip as unknown as BlobPart], { type: "application/zip" }), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="snapyos-${resultToken}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
