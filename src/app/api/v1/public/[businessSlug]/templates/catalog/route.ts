import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { createServerClient } from "@/lib/supabase/server";
import { listPublicTemplates, resolveBusinessIdBySlug } from "@/server/public-config";

type Params = { params: Promise<{ businessSlug: string }> };

type CatalogAsset = {
  assetId: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  signedUrl: string;
};

type CatalogTemplate = {
  templateId: string;
  name: string;
  category: string;
  slotCount: number;
  layout: unknown;
  assets: CatalogAsset[];
  isActive: true;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function frameManifest(
  url: string,
  requestUrl: string,
  assetId: string
): Promise<CatalogAsset> {
  const resolved = new URL(url, requestUrl);
  const response = await fetch(resolved, { cache: "no-store", redirect: "error" });
  if (!response.ok) throw new ApiError("INTERNAL", "Asset template tidak tersedia");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType =
    (response.headers.get("content-type") ?? "").split(";", 1)[0]?.toLowerCase() ?? "";
  if (!/^image\/(png|jpeg|webp)$/.test(contentType) || bytes.byteLength === 0) {
    throw new ApiError("INTERNAL", "Asset template tidak valid");
  }
  return {
    assetId,
    objectKey: `template-assets/${assetId}`,
    contentType,
    sizeBytes: bytes.byteLength,
    sha256: sha256(bytes),
    signedUrl: resolved.toString(),
  };
}

/** GET /api/v1/public/:businessSlug/templates/catalog?package=<id>. */
export async function GET(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`template-catalog:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        }
      );
    }

    const { businessSlug } = await params;
    const query = new URL(request.url).searchParams;
    const packageId = query.get("package") ?? undefined;
    const businessId = await resolveBusinessIdBySlug(businessSlug);
    if (packageId) {
      const { data } = await createServerClient()
        .from("packages")
        .select("id")
        .eq("id", packageId)
        .eq("business_id", businessId)
        .eq("is_active", true)
        .maybeSingle();
      if (!data) throw new ApiError("NOT_FOUND", "Package tidak ditemukan");
    }

    const templates = await listPublicTemplates(businessId, packageId);
    const catalogTemplates: CatalogTemplate[] = [];
    for (const template of templates) {
      const asset = await frameManifest(template.file_url, request.url, `${template.id}:frame`);
      catalogTemplates.push({
        templateId: template.id,
        name: template.name,
        category: template.category,
        slotCount: template.slot_count,
        layout: template.layout,
        assets: [asset],
        isActive: true,
      });
    }

    const payload = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      packageId: packageId ?? null,
      templates: catalogTemplates,
      revokedTemplateIds: [],
    };
    const catalogVersion = createHash("sha256")
      .update(JSON.stringify({ ...payload, generatedAt: undefined }))
      .digest("hex");
    const etag = `W/"${catalogVersion}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }
    return NextResponse.json(dataEnvelope({ ...payload, catalogVersion }), {
      headers: { ETag: etag, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
