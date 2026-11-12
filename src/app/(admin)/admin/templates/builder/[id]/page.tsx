import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { TemplateBuilderCanvas } from "@/components/dashboard/TemplateBuilderCanvas";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { ApiError } from "@/lib/api-errors";
import { slotCount, type TemplateLayout } from "@/lib/template-layout";
import { getGlobalTemplate } from "@/server/admin";
import {
  detectGlobalTemplateChromaSlotsAction,
  saveGlobalTemplateLayoutAction,
} from "@/server/admin-actions";

/** /admin/templates/builder/[id] — builder slot template global (docs/10 §10.2). */
export default async function AdminTemplateBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let template: Awaited<ReturnType<typeof getGlobalTemplate>>;
  try {
    template = await getGlobalTemplate(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const initialLayout = slotCount(template.layout) > 0 ? (template.layout as TemplateLayout) : null;

  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <PageHeader
        eyebrow="ADMIN / BUILDER TEMPLATE"
        title={template.name}
        description="Atur slot frame platform yang dipakai semua tenant. Tambah hingga 8 slot, geser lewat drag atau tombol panah, lalu simpan draft atau publish."
        meta={`${template.category.toUpperCase()} · ${template.is_active ? "AKTIF" : "NONAKTIF"}`}
        right={
          <Link
            href="/admin/templates"
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
        readOnly={false}
        onSave={saveGlobalTemplateLayoutAction.bind(null, id)}
        onDetectChroma={detectGlobalTemplateChromaSlotsAction.bind(null, id)}
      />
    </div>
  );
}
