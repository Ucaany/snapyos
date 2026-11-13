import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FeatureLockedPanel } from "@/components/dashboard/FeatureLockedPanel";
import { KioskPaymentPreview } from "@/components/dashboard/KioskPaymentPreview";
import { PaymentGatewaySettings } from "@/components/dashboard/PaymentGatewaySettings";
import { PageHeader } from "@/components/ui/page-header";
import { paymentWebhookStatus } from "@/lib/payment-credentials";
import { getActiveBusinessForRoles, getMembership, requireUser } from "@/lib/tenant";
import { hasFeature } from "@/server/feature-gate";
import { listCredentials } from "@/server/payment-credentials";
import { listKioskPaymentMethods } from "@/server/payment/payment-methods";
import { listPhotoboxes } from "@/server/photoboxes";

export const metadata: Metadata = { title: "Payment Gateway | SnapyOS" };

/**
 * /dashboard/payment — credential merchant owner (direct merchant).
 * Dana transaksi masuk rekening owner via merchant key sendiri; aggregator Pakasir
 * platform dihapus (docs/06 §6.5, 2026-09-18). Owner-only.
 */
export default async function PaymentGatewayPage({
  searchParams,
}: {
  searchParams: Promise<{ booth?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");
  const active = await getActiveBusinessForRoles(user.id, ["owner", "manager"]);
  if (!active) redirect("/dashboard");
  const membership = await getMembership(user.id, active.business.id);
  if (membership?.role !== "owner") redirect("/dashboard/settings");

  const businessId = active.business.id;
  // Gate plan SEBELUM memuat credential (O-011): tanpa ini halaman memanggil
  // listCredentials yang melempar FEATURE_DISABLED dan credential tetap
  // berpotensi tampil lewat jalur lain.
  if (!(await hasFeature(businessId, "direct_payment"))) {
    return <FeatureLockedPanel />;
  }
  const [credentials, booths, query] = await Promise.all([
    listCredentials(user.id, businessId),
    listPhotoboxes(user.id, businessId),
    searchParams,
  ]);

  const selectedBooth = booths.find((booth) => booth.id === query.booth) ?? booths[0] ?? null;
  const kioskMethods = selectedBooth
    ? await listKioskPaymentMethods(businessId, selectedBooth.id)
    : [];

  const webhookUrls = {
    pakasir: paymentWebhookStatus("pakasir"),
    midtrans: paymentWebhookStatus("midtrans"),
    tripay: paymentWebhookStatus("tripay"),
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="KEUANGAN / PAYMENT GATEWAY"
        title="Pembayaran"
        description="Credential merchant terenkripsi (Pakasir / Midtrans / Tripay). Dana pembayaran masuk rekening owner langsung, bukan platform. Secret tidak pernah ditampilkan kembali setelah tersimpan."
        meta="[ DIRECT MERCHANT ] PAKASIR · MIDTRANS · TRIPAY"
      />
      <PaymentGatewaySettings initialCredentials={credentials} webhookUrls={webhookUrls} />
      <KioskPaymentPreview
        booths={booths.map((booth) => ({
          id: booth.id,
          name: booth.name,
          payment_mode: booth.payment_mode,
        }))}
        selectedId={selectedBooth?.id ?? null}
        methods={kioskMethods}
        basePath="/dashboard/payment"
      />
    </PageShell>
  );
}
