import { NextResponse } from "next/server";
import { adminRawRoute } from "@/lib/api-route";

/** Installer catalog writes are retired; keep an explicit compatibility response. */
export const PATCH = adminRawRoute(async () =>
  NextResponse.json({ error: { code: "METHOD_NOT_ALLOWED", message: "Katalog installer bersifat read-only." } }, { status: 405 })
);

export const DELETE = adminRawRoute(async () =>
  NextResponse.json({ error: { code: "METHOD_NOT_ALLOWED", message: "Katalog installer bersifat read-only." } }, { status: 405 })
);
