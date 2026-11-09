import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { TemplateBuilderCanvas } from "@/components/dashboard/TemplateBuilderCanvas";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import type { TemplateLayout } from "@/lib/template-layout";
import { detectTemplateChromaSlotsAction, saveTemplateLayoutAction } from "@/server/catalog-actions";
import { getTemplateForBuilder } from "@/server/templates";

/** /dashboard/templates/builder/[id] — builder slot frame milik owner (docs/15 §15.3). */
export default async function TemplateBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");
  if (!can(active.role, "template:read")) notFound();
  const canWrite = can(active.role, "template:write");

  let data: Awaited<ReturnType<typeof getTemplateForBuilder>>;
  try {
    data = await getTemplateForBuilder(user.id, active.business.id, id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const { template, is_global } = data;
  const initialLayout =
    template.slot_count > 0 ? (template.layout as TemplateLayout) : null;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 md:p-10">
      <PageHeader
        eyebrow={`TEMPLATE BUILDER · ${active.role.toUpperCase()}`}
        title={template.name}
        description="Tambah hingga 8 slot foto di atas frame. Geser lewat drag atau tombol panah, atur bentuk/fit/rotasi, lalu simpan sebagai draft atau publish. Frame selalu digambar di atas foto, sama seperti kiosk."
        right={
          <Link
            href="/dashboard/templates"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft aria-hidden="true" />
            Kembali ke Templates
          </Link>
        }
      />

      <TemplateBuilderCanvas
        templateName={template.name}
        initialLayout={initialLayout}
        initialActive={template.is_active}
        frameUrl={template.preview_url}
        readOnly={is_global || !canWrite}
        onSave={
          is_global || !canWrite ? undefined : saveTemplateLayoutAction.bind(null, template.id)
        }
        onDetectChroma={
          is_global || !canWrite
            ? undefined
            : detectTemplateChromaSlotsAction.bind(null, template.id)
        }
      />
    </div>
  );
}
