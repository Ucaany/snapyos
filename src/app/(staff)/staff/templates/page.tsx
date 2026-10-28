import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StaffCatalogShell, StaffTemplatesBoard } from "@/components/staff/StaffCatalog";
import { StaffPageHeader } from "@/components/staff/StaffPrimitives";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listTemplates } from "@/server/templates";

export const metadata: Metadata = {
  title: "Template: SnapyOS Staff",
};

/** /staff/templates, read-only (docs/04 §4.10; RBAC staff: template:read). */
export default async function StaffTemplatesPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/staff");

  // Hanya frame aktif: shell staff menampilkan apa yang dilihat customer di
  // kiosk (`listPublicTemplates` juga `is_active = true`), dan frame nonaktif
  // tidak bisa diaktifkan dari sini (read-only) sehingga hanya membingungkan.
  const templates = await listTemplates(user.id, active.business.id);

  return (
    <div className="flex flex-col gap-6 p-4 pb-10 sm:gap-8 sm:p-6 md:p-8 lg:p-10">
      <StaffPageHeader
        eyebrow="TEMPLATE · HANYA LIHAT"
        title="Template & Frame"
        description="Preview frame yang tersedia untuk customer. Upload & assign dikontrol owner."
        aside={
          <div className="border-2 border-ink bg-bg px-3 py-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              FRAME AKTIF
            </p>
            <p className="font-mono text-xl font-bold leading-none">
              {String(templates.length).padStart(2, "0")} FRAME
            </p>
          </div>
        }
      />
      <StaffCatalogShell
        title="PUSTAKA.FRAME"
        meta={`${String(templates.length).padStart(2, "0")} AKTIF`}
      >
        <StaffTemplatesBoard templates={templates} />
      </StaffCatalogShell>
    </div>
  );
}
