import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { parseUuidParam, toErrorResponse } from "@/lib/api-route";
import { finalizeSession } from "@/server/kiosk-sessions";
import { rateLimit, rateLimitByDevice } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import {
  FINALIZE_MAX_PHOTOS,
  FINALIZE_MAX_REQUEST_BYTES,
  FINALIZE_MAX_TOTAL_PIXELS,
  FINALIZE_PIXEL_BUDGET_MESSAGE,
  FINALIZE_TOO_LARGE_MESSAGE,
  PHOTO_MAX_PIXELS,
  isFinalizeRequestTooLarge,
  jpegPixelCount,
  validateFinalizeRequest,
  validatePhotoFile,
} from "@/lib/upload-validation";
import { sessionFinalizeSchema } from "@/lib/validators";

const MAX_MULTIPART_BYTES = FINALIZE_MAX_REQUEST_BYTES;

function rateLimited(retryAfterSec: number) {
  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Terlalu banyak permintaan. Coba lagi nanti.",
        details: { retry_after: retryAfterSec },
      },
    },
    { status: 429, headers: { "retry-after": String(retryAfterSec) } }
  );
}

/** Body kebesaran = 413 (bukan 422 input invalid), konsisten dengan route
 *  frame/webhook di scope kiosk. Pesan tetap sama untuk customer. */
function requestTooLarge() {
  const error = new ApiError("PAYLOAD_TOO_LARGE", FINALIZE_TOO_LARGE_MESSAGE);
  return NextResponse.json(error.toBody(), { status: error.status });
}

function uploadInvalid(message: string) {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message, details: {} } },
    { status: 422 }
  );
}

/**
 * Bungkus file dengan buffer yang sudah dibaca route ini. `finalizeSession`
 * memanggil `file.arrayBuffer()` lagi untuk tiap foto; tanpa cache, body 50 MB
 * disalin dua kali penuh (sekali validasi, sekali upload) di tablet kiosk.
 */
function withCachedBuffer(file: PhotoFile, bytes: Uint8Array): PhotoFile {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    arrayBuffer: async () => bytes.buffer as ArrayBuffer,
  };
}

function declaredBodyBytes(request: Request): number | null {
  const value = request.headers.get("content-length");
  if (!value) return null;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

function sumFileBytes(files: readonly PhotoFile[]): number {
  return files.reduce((total, file) => total + Math.max(0, file.size ?? 0), 0);
}

/** Hasil validasi batch: `tooLarge` memisahkan body kebesaran (413) dari
 *  foto tidak valid (422) — dua kondisi berbeda tidak boleh satu status. */
type FilesValidation = { ok: true } | { ok: false; tooLarge: boolean; message: string };

function validateFiles(files: readonly PhotoFile[], extraBytes = 0): FilesValidation {
  // `extraBytes` = foto mentah untuk GIF; batas 50 MB berlaku untuk SELURUH
  // body multipart, bukan hanya `photos`.
  const totalBytes = sumFileBytes(files) + Math.max(0, extraBytes);
  // Total byte dari file yang benar-benar terkirim: multipart bisa tanpa
  // Content-Length (chunked), jadi jalur ini tetap perlu.
  if (isFinalizeRequestTooLarge(totalBytes)) {
    return { ok: false, tooLarge: true, message: FINALIZE_TOO_LARGE_MESSAGE };
  }
  const aggregateError = validateFinalizeRequest(totalBytes, files.length);
  if (aggregateError) return { ok: false, tooLarge: false, message: aggregateError };
  for (const file of files) {
    if (!file.name || file.type !== "image/jpeg" || (file.size ?? 0) > 10 * 1024 * 1024) {
      return { ok: false, tooLarge: false, message: "Foto tidak valid atau melebihi batas 10 MB" };
    }
  }
  return { ok: true };
}

/** Satu tempat pemetaan hasil validasi → respons: body kebesaran selalu 413. */
function filesInvalid(result: Extract<FilesValidation, { ok: false }>) {
  return result.tooLarge ? requestTooLarge() : uploadInvalid(result.message);
}

async function readValidatedPhotos(
  files: readonly PhotoFile[],
  pixelBudget: number
): Promise<PhotoFile[]> {
  const validated: PhotoFile[] = [];
  let pixels = 0;
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = validatePhotoFile(file, bytes);
    if (!result.ok) throw new Error(result.error);
    // Budget dihitung dari header SOF (murah, tanpa decode). Header yang tidak
    // terbaca dihitung sebesar batas per-foto supaya tetap fail-closed.
    const dims = jpegPixelCount(bytes);
    pixels += dims ? dims.width * dims.height : PHOTO_MAX_PIXELS;
    if (pixels > pixelBudget) throw new Error(FINALIZE_PIXEL_BUDGET_MESSAGE);
    validated.push(withCachedBuffer(file, bytes));
  }
  return validated;
}

function parsePhotos(form: FormData): PhotoFile[] {
  return form.getAll("photos").filter((value): value is File => value instanceof File);
}

/** Capture mentah tanpa frame — hanya dipakai sebagai frame GIF slideshow.
 *  Klien lama tidak mengirim field ini; server lalu memakai `photos`. */
function parseGifPhotos(form: FormData): PhotoFile[] {
  return form.getAll("gif_photos").filter((value): value is File => value instanceof File);
}

function parseMetadata(form: FormData) {
  const deviceToken = String(form.get("device_token") ?? "");
  const retakeRaw = String(form.get("retake_count") ?? "");
  const templateRaw = String(form.get("template_id") ?? "");
  return sessionFinalizeSchema.parse({
    device_token: deviceToken,
    retake_count: retakeRaw === "" ? undefined : Number(retakeRaw),
    template_id: templateRaw === "" ? null : templateRaw,
  });
}

/** Limit per IP — dipanggil SEBELUM body diparse (murah, tanpa baca body).
 *  Body 50 MB yang di-parse dulu baru ditolak = kerja gratis untuk penyerang. */
async function enforceIpRateLimit(request: Request) {
  return rateLimit("session-finalize:" + getClientIp(request.headers), 10, 60_000);
}

/** Lapis kedua per device (booth) — butuh `device_token` dari body. */
async function enforceDeviceRateLimit(deviceToken: string) {
  return rateLimitByDevice("session-finalize", deviceToken, 10, 60_000);
}

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
    const id = parseUuidParam(idRaw, "id");
    const declared = declaredBodyBytes(request);
    if (declared !== null && declared > MAX_MULTIPART_BYTES) return requestTooLarge();

    // IP lebih dulu, sebelum multipart 50 MB diparse.
    const ipLimit = await enforceIpRateLimit(request);
    if (!ipLimit.ok) return rateLimited(ipLimit.retryAfterSec);

    const form = await request.formData();
    const input = parseMetadata(form);
    const deviceLimit = await enforceDeviceRateLimit(input.device_token);
    if (deviceLimit && !deviceLimit.ok) return rateLimited(deviceLimit.retryAfterSec);

    const photos = parsePhotos(form);
    const gifPhotos = parseGifPhotos(form);
    if (gifPhotos.length > FINALIZE_MAX_PHOTOS) return uploadInvalid("Jumlah foto tidak valid");

    const filesError = validateFiles(photos, sumFileBytes(gifPhotos));
    if (!filesError.ok) return filesInvalid(filesError);
    let validatedPhotos: PhotoFile[];
    let validatedGifPhotos: PhotoFile[];
    try {
      validatedPhotos = await readValidatedPhotos(photos, FINALIZE_MAX_TOTAL_PIXELS);
      validatedGifPhotos =
        gifPhotos.length > 0 ? await readValidatedPhotos(gifPhotos, FINALIZE_MAX_TOTAL_PIXELS) : [];
    } catch (error) {
      return uploadInvalid(error instanceof Error ? error.message : "Foto tidak valid");
    }

    return NextResponse.json(
      dataEnvelope(
        await finalizeSession(businessSlug, id, input, validatedPhotos, validatedGifPhotos)
      )
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
