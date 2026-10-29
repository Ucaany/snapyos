/**
 * Next.js proxy (Next 16 rename dari `middleware`) — enforce maintenance mode.
 *
 * Referensi:
 *  - docs/10-admin-platform.md §10.4 (platform_settings.maintenance_mode).
 *  - AGENTS.md — Neo-Brutalism single aesthetic (halaman /maintenance).
 *
 * Perilaku:
 *  - Jika `platform_settings.maintenance_mode = true`:
 *      • Non-admin → rewrite ke `/maintenance` (503) untuk browser, JSON 503
 *        untuk request `/api/*`.
 *      • Admin (role=admin ATAU email di ADMIN_EMAILS) → pass-through.
 *      • Path allowlist selalu pass: `/maintenance`, `/login`, `/api/health`,
 *        `/api/auth/*`, `/api/webhooks/*`, `/admin/*`, aset Next.
 *  - Jika maintenance_mode = false → tidak melakukan apa-apa.
 *
 * Cache: tidak ada cache lintas-request. Flag dibaca langsung dari DB
 * (src/lib/maintenance.ts) supaya toggle admin langsung efektif. Proxy tidak
 * boleh bergantung pada shared module state dengan kode render (Next.js docs:
 * proxy bisa jalan terpisah dari kode render).
 *
 * runtime: "nodejs" (config di bawah) — dibutuhkan karena `auth()` (NextAuth
 * v5) dan Supabase service client pakai native modules yang tidak kompatibel
 * dengan Edge Runtime.
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getMaintenanceState } from "@/lib/maintenance";
import { isAdminUser } from "@/server/admin/guard";

const ALWAYS_ALLOWED_PREFIXES = [
  "/maintenance",
  "/login",
  "/api/health",
  "/api/auth", // NextAuth callback
  "/api/webhooks", // provider webhooks (Pakasir): jangan blokir settlement in-flight
  "/_next",
  "/favicon.ico",
  // Aset root yang dibutuhkan halaman maintenance / ikon PWA. Daftar ini
  // eksplisit: jangan pernah menambah pengecualian berbasis ekstensi file,
  // karena itu membuat `/api/v1/public/<slug>.png` melewati gate.
  "/snapyos-mark.png",
  "/snapyos-icon-192.png",
  "/snapyos-icon-512.png",
  "/snapyos-icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/sw.js",
];

function isAllowlisted(pathname: string): boolean {
  for (const prefix of ALWAYS_ALLOWED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fast-path: whitelist paths yang harus tetap jalan.
  if (isAllowlisted(pathname)) return NextResponse.next();

  // Admin panel selalu accessible (untuk toggle off maintenance).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return NextResponse.next();
  }

  const maintenance = await getMaintenanceState();
  if (maintenance === "disabled") return NextResponse.next();

  // Admin lolos saat maintenance aktif. Saat status DB tidak tersedia, jalur
  // non-allowlist tetap 503 karena session check juga bergantung pada DB.
  if (maintenance === "enabled") {
    const session = await auth();
    const user = session?.user as { role?: string | null; email?: string | null } | undefined;
    if (isAdminUser(user)) return NextResponse.next();
  }

  const message =
    maintenance === "unavailable"
      ? "Status platform sementara tidak tersedia"
      : "Platform sedang perawatan sistem";

  // Block: JSON untuk API, rewrite untuk browser.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: {
          code: "MAINTENANCE_MODE",
          message,
          details: {},
        },
      },
      { status: 503, headers: { "Retry-After": "60" } }
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/maintenance";
  url.search = "";
  return NextResponse.rewrite(url, { status: 503 });
}

/**
 * Matcher: eksekusi proxy untuk semua path kecuali aset statis Next.
 * NOTE (Next 16): Proxy SELALU jalan di Node.js runtime. `runtime` config
 * TIDAK diperbolehkan lagi di proxy.
 */
export const config = {
  matcher: [
    // Semua path kecuali aset statis Next. JANGAN mengecualikan berdasarkan
    // ekstensi file: segmen dinamis (mis. /api/v1/public/acme.png) akan ikut
    // lolos dan gate maintenance/limiter jadi bisa dilewati.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
