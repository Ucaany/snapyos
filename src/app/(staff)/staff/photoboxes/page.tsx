import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StaffBoothsBoard, StaffCatalogShell } from "@/components/staff/StaffCatalog";
import { StaffPageHeader } from "@/components/staff/StaffPrimitives";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listPhotoboxes } from "@/server/photoboxes";

export const metadata: Metadata = {
  title: "Booth: SnapyOS Staff",
};

/** /staff/photoboxes, read-only (docs/04 §4.6; RBAC staff: photobox:read). */
export default async function StaffPhotoboxesPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/staff");

  const photoboxes = await listPhotoboxes(user.id, active.business.id);

  return (
    <div className="flex flex-col gap-6 p-4 pb-10 sm:gap-8 sm:p-6 md:p-8 lg:p-10">
      <StaffPageHeader
        eyebrow="BOOTH · READ ONLY"
        title="Photobox"
        description="Pantau status booth, URL perangkat, dan perangkat yang terdeteksi. Perubahan konfigurasi dan PIN dikontrol owner."
        aside={
          <div className="border-2 border-ink bg-bg px-3 py-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              AKSES ANDA
            </p>
            <p className="font-mono text-xl font-bold leading-none">
              {String(photoboxes.length).padStart(2, "0")} BOOTH
            </p>
          </div>
        }
      />
      <StaffCatalogShell
        title="BOOTH.REGISTER"
        meta={`${String(photoboxes.length).padStart(2, "0")} UNIT`}
      >
        <StaffBoothsBoard
          photoboxes={photoboxes}
          businessSlug={active.business.slug}
          timeZone={active.business.timezone || "Asia/Jakarta"}
        />
      </StaffCatalogShell>
    </div>
  );
}
