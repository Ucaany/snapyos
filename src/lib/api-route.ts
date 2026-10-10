import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { redactSensitive } from "@/lib/error-redaction";
import { parseUuidParam } from "@/lib/uuid-param";
import { requireUser, type AppUser } from "@/lib/tenant";
import { requireAdmin } from "@/server/admin/guard";

export { ApiError, parseUuidParam };

/** Query params → plain object (nilai null dibuang). */
export function searchParamsToObject(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams.entries()) {
    if (value !== "") out[key] = value;
  }
  return out;
}

/** Map error apa pun → envelope error standar (docs/08 §8.2). */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(error.toBody(), { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Input tidak valid",
          details: { issues: error.issues },
        },
      },
      { status: 422 }
    );
  }
  // Body JSON invalid (request.json() melempar SyntaxError) → 422, bukan 500.
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Body JSON tidak valid",
        },
      },
      { status: 422 }
    );
  }
  // Log diagnostik dengan sanitizer: secret keys → [REDACTED],
  // email → ***@domain. Response ke client TIDAK pernah membawa detail
  // internal (mis. db_code/db_message) supaya bocornya schema/query nihil.
  console.error("[api] unexpected error:", redactSensitive(error));
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Terjadi kesalahan" } },
    { status: 500 }
  );
}

/**
 * `adminRoute` — wrapper route `/api/v1/admin/*`. Memanggil `requireAdmin()`
 * SEBELUM handler (throw UNAUTHORIZED/FORBIDDEN), sehingga guard ada di lapisan
 * route — bukan bergantung pada callee kebetulan memanggil requireAdmin.
 * Envelope + error handling identik `authRoute`.
 */
export function adminRoute<
  T,
  P extends Record<string, string> = Record<string, string>,
>(
  handler: (ctx: { admin: AppUser; request: Request; params: P }) => Promise<T>,
  options?: { status?: number },
) {
  return async (request: Request, ctx: { params: Promise<P> }) => {
    try {
      const admin = await requireAdmin();
      const params = await ctx.params;
      const result = await handler({ admin, request, params });
      return NextResponse.json(dataEnvelope(result), { status: options?.status });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/**
 * `adminRawRoute` — variant `adminRoute` untuk endpoint admin yang
 * mengembalikan `NextResponse` mentah (bukan JSON envelope).
 */
export function adminRawRoute<
  P extends Record<string, string> = Record<string, string>,
>(handler: (ctx: { admin: AppUser; request: Request; params: P }) => Promise<NextResponse>) {
  return async (request: Request, ctx: { params: Promise<P> }) => {
    try {
      const admin = await requireAdmin();
      const params = await ctx.params;
      return await handler({ admin, request, params });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/**
 * `authRoute` — wrapper untuk route yang butuh session user (Fase 5).
 * Menghilangkan boilerplate `requireUser() → throw UNAUTHORIZED` yang tersebar
 * di ~9 route dashboard. `params` sudah di-await; handler menerima `user`,
 * `request`, dan `params` typed.
 *
 * Usage:
 *   export const GET = authRoute<Result, { businessId: string }>(
 *     async ({ user, params }) => {
 *       const businessId = parseUuidParam(params.businessId, "businessId");
 *       return listSomething(user.id, businessId);
 *     },
 *   );
 *
 * Opsi `status` diteruskan ke NextResponse (mis. 201 untuk POST create).
 */
type AuthedContext<P> = {
  user: AppUser;
  request: Request;
  params: P;
};

export function authRoute<
  T,
  P extends Record<string, string> = Record<string, string>,
>(
  handler: (ctx: AuthedContext<P>) => Promise<T>,
  options?: { status?: number },
) {
  return async (request: Request, ctx: { params: Promise<P> }) => {
    try {
      const user = await requireUser();
      if (!user) throw new ApiError("UNAUTHORIZED", "Silakan login");
      const params = await ctx.params;
      const result = await handler({ user, request, params });
      return NextResponse.json(dataEnvelope(result), { status: options?.status });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/**
 * `authRawRoute` — variant `authRoute` untuk endpoint yang mengembalikan
 * `NextResponse` mentah (mis. download binary/CSV) — bukan JSON envelope.
 * Wrapper tetap injeksi user + error handling standar.
 */
export function authRawRoute<
  P extends Record<string, string> = Record<string, string>,
>(handler: (ctx: AuthedContext<P>) => Promise<NextResponse>) {
  return async (request: Request, ctx: { params: Promise<P> }) => {
    try {
      const user = await requireUser();
      if (!user) throw new ApiError("UNAUTHORIZED", "Silakan login");
      const params = await ctx.params;
      return await handler({ user, request, params });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
