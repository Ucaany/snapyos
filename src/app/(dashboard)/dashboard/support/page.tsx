import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SupportTicketsPanel } from "@/components/dashboard/SupportTicketsPanel";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listSupportTickets } from "@/server/support-tickets";

export const metadata: Metadata = {
  title: "Bantuan | SnapyOS",
};

/** /dashboard/support — tiket bantuan owner: submit + pantau status (docs/04 §4.20). */
export default async function SupportPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const tickets = await listSupportTickets();

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow={`BANTUAN: ${active.role.toUpperCase()}`}
        title="Tiket Bantuan"
        description="Laporkan masalah atau pertanyaan. Pantau status tiap tiket: terbuka, butuh tindakan, atau selesai. Cek panduan mandiri dan daftar hardware sebelum bikin tiket."
      />
      <div className="flex flex-wrap gap-2">
        <Link
          href="/docs"
          className="border-2 border-ink bg-surface px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink transition-colors hover:bg-accent active:translate-y-[2px]"
        >
          Dokumentasi
        </Link>
      </div>
      <SupportTicketsPanel tickets={tickets} />
    </div>
  );
}
