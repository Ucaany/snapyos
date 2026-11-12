import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Palette } from "lucide-react";

import { DesignBuilder } from "@/components/dashboard/DesignBuilder";
import { PageHeader } from "@/components/ui/page-header";
import { brandingSchema } from "@/lib/validators";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { getBranding, signBrandingAssets } from "@/server/branding";
import { listPhotoboxes } from "@/server/photoboxes";

export const metadata: Metadata = { title: "Design Builder | SnapyOS" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DesignBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ booth?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const businessId = active.business.id;
  const [photoboxes, globalBranding] = await Promise.all([
    listPhotoboxes(user.id, businessId),
    getBranding(user.id, businessId),
  ]);

  const query = await searchParams;
  const requested = query.booth && UUID.test(query.booth) ? query.booth : null;
  const initialBoothId =
    (requested && photoboxes.some((booth) => booth.id === requested) ? requested : null) ??
    photoboxes[0]?.id ??
    null;

  const overrides = photoboxes.map((booth) => ({
    id: booth.id,
    name: booth.name,
    slug: booth.slug,
    override: booth.branding ? brandingSchema.catch({}).parse(booth.branding) : null,
    orientation: booth.camera_settings?.screen_orientation ?? null,
  }));

  // Satu peta signed URL untuk semua key (global + seluruh override booth).
  const maps = await Promise.all([
    signBrandingAssets(globalBranding),
    ...overrides.map((booth) => signBrandingAssets(booth.override)),
  ]);
  const signedUrls: Record<string, string> = {};
  for (const map of maps) {
    for (const [key, url] of map) signedUrls[key] = url;
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="DESIGN BUILDER · PHOTOBOX"
        title="Design Builder"
        icon={Palette}
        description="Pilih photobox, ubah merek, sambutan, dan tampilan layar kiosk, lalu lihat pratinjau langsung. Photobox tanpa kustomisasi mewarisi branding global."
        meta={
          <>
            {photoboxes.length} photobox ·{" "}
            {can(active.role, "business:update") ? "global" : "global read-only"}
          </>
        }
      />
      <DesignBuilder
        businessName={active.business.name}
        globalBranding={globalBranding}
        booths={overrides}
        initialBoothId={initialBoothId}
        signedUrls={signedUrls}
        canBooth={can(active.role, "photobox:write")}
        canGlobal={can(active.role, "business:update")}
      />
    </PageShell>
  );
}
