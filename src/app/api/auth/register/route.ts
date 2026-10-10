import { NextResponse } from "next/server";

/**
 * POST /api/auth/register — DITUTUP.
 * Pendaftaran mandiri tidak dibuka lagi; akun HANYA dibuat admin CEO
 * via /admin/users (docs/10 §10.2). /register publik = halaman konsultasi.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "REGISTRATION_CLOSED",
        message: "Pendaftaran mandiri ditutup. Akun dibuat oleh admin platform.",
        details: {},
      },
    },
    { status: 403 }
  );
}
