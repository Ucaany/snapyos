import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { adminRawRoute } from "@/lib/api-route";
import { listInstallers } from "@/server/admin";

export const GET = adminRawRoute(async () =>
  NextResponse.json(dataEnvelope(await listInstallers()))
);

/** Installer catalog writes are retired; artifacts remain readable for migration. */
export const POST = adminRawRoute(async () =>
  NextResponse.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Katalog installer bersifat read-only." } },
    { status: 405 }
  )
);
