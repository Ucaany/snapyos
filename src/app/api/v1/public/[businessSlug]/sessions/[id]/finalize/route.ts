import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { parseUuidParam, toErrorResponse } from "@/lib/api-route";
import { finalizeSession } from "@/server/kiosk-sessions";
import { rateLimit, rateLimitByDevice } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import {
  FINALIZE_MAX_REQUEST_BYTES,
  FINALIZE_TOO_LARGE_MESSAGE,
  isFinalizeRequestTooLarge,
  validateFinalizeRequest,
  validatePhotoFile,
} from "@/lib/upload-validation";
import { sessionFinalizeSchema } from "@/lib/validators";

const MAX_MULTIPART_BYTES = FINALIZE_MAX_REQUEST_BYTES;

function rateLimited(retryAfterSec: number) {
  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan. Coba lagi nanti.", details: { retry_after: retryAfterSec } } },
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

function validateFiles(files: readonly PhotoFile[]): FilesValidation {
  const totalBytes = sumFileBytes(files);
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

async function readValidatedPhotos(files: readonly PhotoFile[]): Promise<PhotoFile[]> {
  const validated: PhotoFile[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = validatePhotoFile(file, bytes);
    if (!result.ok) throw new Error(result.error);
    validated.push(withCachedBuffer(file, bytes));
  }
  return validated;
}

function parsePhotos(form: FormData): PhotoFile[] {
  return form.getAll("photos").filter((value): value is File => value instanceof File);
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
    const filesError = validateFiles(photos);
    if (!filesError.ok) return filesInvalid(filesError);
    let validatedPhotos: PhotoFile[];
    try {
      validatedPhotos = await readValidatedPhotos(photos);
    } catch (error) {
      return uploadInvalid(error instanceof Error ? error.message : "Foto tidak valid");
    }

    return NextResponse.json(
      dataEnvelope(await finalizeSession(businessSlug, id, input, validatedPhotos))
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
