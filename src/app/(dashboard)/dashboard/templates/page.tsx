import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TemplatesGrid } from "@/components/dashboard/TemplatesGrid";
import { PremiumTemplatesGrid } from "@/components/dashboard/PremiumTemplatesGrid";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listTemplates } from "@/server/templates";
import { listPremiumTemplates } from "@/server/template-purchase";

export const metadata: Metadata = {
  title: "Template — SnapyOS",
};

/** /dashboard/templates — upload & kelola frame (docs/04 §4.10) + marketplace premium. */
export default async function TemplatesPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const canWrite = can(active.role, "template:write");

  const [templates, premium] = await Promise.all([
    listTemplates(user.id, active.business.id, { includeInactive: true }),
    listPremiumTemplates(user.id, active.business.id),
  ]);

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow={`TEMPLATE: ${active.role.toUpperCase()}`}
        title="Template & Frame"
        description="Upload frame sendiri (PNG/JPG/WebP transparan dari Canva/Figma), kategorisasi, lalu assign ke package. Buka &ldquo;Atur slot&rdquo; untuk menambah slot foto atau hapus background hijau dengan chroma key."
      />

      <section aria-labelledby="premium-templates" className="flex flex-col gap-4">
        <div className="border-2 border-ink bg-ink p-4">
          <p id="premium-templates" className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-bg">
            {"/// Template Premium (Marketplace)"}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-bg/70">
              Frame berbayar dari platform. Beli sekali, lalu gunakan di paket.
          </p>
        </div>
        <PremiumTemplatesGrid templates={premium} />
      </section>

      <TemplatesGrid templates={templates} canWrite={canWrite} />
    </div>
  );
}
