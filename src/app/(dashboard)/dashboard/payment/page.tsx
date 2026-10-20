import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PaymentGatewaySettings } from "@/components/dashboard/PaymentGatewaySettings";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveBusiness, getMembership, requireUser } from "@/lib/tenant";
import { listCredentials } from "@/server/payment-credentials";

export const metadata: Metadata = { title: "Payment Gateway | SnapyOS" };

/**
 * /dashboard/payment — credential merchant owner (direct merchant).
 * Dana transaksi masuk rekening owner via merchant key sendiri; aggregator Pakasir
 * platform dihapus (docs/06 §6.5, 2026-09-18). Owner-only.
 */
export default async function PaymentGatewayPage() {
  const user = await requireUser();
  if (!user) redirect("/login");
  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");
  const membership = await getMembership(user.id, active.business.id);
  if (membership?.role !== "owner") redirect("/dashboard/settings");

  const credentials = await listCredentials(user.id, active.business.id);

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="KEUANGAN / PAYMENT GATEWAY"
        title="Payment Gateway"
        description="Credential merchant terenkripsi (Pakasir / Midtrans / Tripay). Dana pembayaran masuk rekening owner langsung, bukan platform. Secret tidak pernah ditampilkan kembali setelah tersimpan."
        meta="[ DIRECT MERCHANT ] /// PAKASIR · MIDTRANS · TRIPAY"
      />
      <PaymentGatewaySettings initialCredentials={credentials} />
    </div>
  );
}
