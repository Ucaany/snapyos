import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";

import { SupportTicketsPanel } from "@/components/dashboard/SupportTicketsPanel";
import { IconLink } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listSupportTickets } from "@/server/support-tickets";

export const metadata: Metadata = {
  title: "Bantuan | SnapyOS",
};

/** /dashboard/support: tiket bantuan, submit + pantau status (docs/04 §4.20).
 *  Semua role boleh membuat tiket; owner melihat seluruh tiket business,
 *  anggota lain hanya tiket miliknya (scoping di listSupportTickets). */
export default async function SupportPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const tickets = await listSupportTickets();

  return (
    <PageShell>
      <PageHeader
        eyebrow={`BANTUAN: ${active.role.toUpperCase()}`}
        title="Tiket Bantuan"
        description="Laporkan masalah atau pertanyaan. Pantau status tiap tiket: terbuka, butuh tindakan, atau selesai. Cek panduan mandiri dan daftar hardware sebelum bikin tiket."
      />
      <div className="flex flex-wrap gap-2">
        <IconLink href="/docs" label="Dokumentasi" compact>
          <BookOpen className="size-4" aria-hidden="true" />
        </IconLink>
      </div>
      <SupportTicketsPanel tickets={tickets} />
    </PageShell>
  );
}
