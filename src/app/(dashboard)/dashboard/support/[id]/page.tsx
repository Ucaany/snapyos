import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SupportTicketDetail } from "@/components/dashboard/SupportTicketDetail";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { getSupportTicket } from "@/server/support-tickets";

export const metadata: Metadata = {
  title: "Detail Tiket | SnapyOS",
};

/** /dashboard/support/:id — detail tiket + thread balasan (docs/04 §4.20). */
export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const { id } = await params;
  let ticket;
  try {
    ticket = await getSupportTicket(id);
  } catch {
    notFound();
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={`TIKET: ${active.role.toUpperCase()}`}
        title="Detail Tiket"
        description={ticket.subject}
      />
      <SupportTicketDetail ticket={ticket} />
    </PageShell>
  );
}
