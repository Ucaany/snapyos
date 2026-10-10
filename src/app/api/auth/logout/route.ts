import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";
import { dataEnvelope } from "@/lib/api-errors";

/** POST /api/auth/logout — hapus session (docs/08 §8.3). */
export async function POST() {
  await signOut({ redirect: false });
  return NextResponse.json(dataEnvelope({ ok: true }));
}
