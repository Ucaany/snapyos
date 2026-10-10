import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TemplatesGrid } from "@/components/dashboard/TemplatesGrid";
import { PageHeader } from "@/components/ui/page-header";
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

  const templates = await listTemplates(user.id, active.business.id, {
    includeInactive: true,
  });

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="TEMPLATE: READ ONLY"
        title="Template & Frame"
        description="Preview frame yang tersedia untuk customer. Upload & assign dikontrol owner."
      />
      <TemplatesGrid templates={templates} canWrite={false} />
    </div>
  );
}
