import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { TemplateBuilder } from "@/components/dashboard/TemplateBuilder"
import { ApiError } from "@/lib/api-errors"
import { can } from "@/lib/rbac"
import { getActiveBusiness, requireUser } from "@/lib/tenant"
import { getTemplate } from "@/server/templates"

export const metadata: Metadata = {
  title: "Template Builder — SnapyOS",
}

/** /dashboard/templates/builder/[id] — drag-and-drop slot foto (docs/15 §15.3). */
export default async function TemplateBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!user) redirect("/login")

  const active = await getActiveBusiness(user.id)
  if (!active) redirect("/dashboard")

  if (!can(active.role, "template:write")) {
    redirect("/dashboard/templates")
  }

  const { id } = await params
  let template: Awaited<ReturnType<typeof getTemplate>>
  try {
    template = await getTemplate(user.id, active.business.id, id)
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return <TemplateBuilder template={template} />
}
