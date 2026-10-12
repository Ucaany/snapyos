import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { TemplateBuilder } from "@/components/dashboard/TemplateBuilder";
import { PageHeader } from "@/components/ui/page-header";
import { getGlobalTemplate } from "@/server/admin";
import { getAdminUser } from "@/server/admin";
import { saveGlobalTemplateBuilderAction } from "@/server/admin-actions";
import type { TemplateRow } from "@/server/templates";

export const metadata: Metadata = {
  title: "Template Builder - SnapyOS",
};

/** /admin/templates/builder/:id - slot builder global (mirror owner, docs/10 §10.2). */
export default async function AdminTemplateBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect("/login");

  const { id } = await params;
  let row;
  try {
    row = await getGlobalTemplate(id);
  } catch {
    notFound();
  }

  const template: TemplateRow = {
    id: row.id,
    name: row.name,
    category: row.category,
    file_url: row.file_url,
    is_active: row.is_active,
    created_at: "",
    preview_url: row.preview_url,
    layout: row.layout as TemplateRow["layout"],
    slot_count: 0,
  };

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow={`TEMPLATE BUILDER - ADMIN`}
        title="Slot Frame Global"
        description="Tambah/atur slot foto pada frame global. Layout berlaku untuk seluruh tenant yang membeli template ini."
      />
      <TemplateBuilder
        template={template}
        saveAction={saveGlobalTemplateBuilderAction}
        backHref="/admin/templates"
      />
    </div>
  );
}
